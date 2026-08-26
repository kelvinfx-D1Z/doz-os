import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { collectableAmount, invoiceStatusFor, MONEY_EPSILON } from "@/lib/received-allocation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const receipts = await db.receipt.findMany({
    include: {
      invoice: {
        select: { id: true, code: true, amount: true, account: { select: { name: true } } },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ receipts });
}

/**
 * Records one payment and issues its receipt.
 *
 * One receipt per payment, not per invoice — a client paying in three
 * instalments gets three receipts, each showing what it settled and what is
 * still outstanding. The balance is measured against collectableAmount, so a
 * government invoice settles at its expectedCash rather than its face value.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter the amount received as a positive number" },
      { status: 400 },
    );
  }

  // Everything below — the read, the arithmetic and the write — happens INSIDE
  // one transaction, and the invoice is re-read here rather than before it.
  //
  // This is a read-modify-write on money. Reading amountPaid outside the
  // transaction and later writing an ABSOLUTE value back means two payments
  // recorded close together (two tabs, a double-click that beats the UI guard,
  // the founder and a delegated user at once) both read amountPaid = 0 and
  // both write the same absolute figure. Two receipts get issued, each
  // printing a balance as if the other did not exist, and one payment simply
  // vanishes from the ledger — and from the project's derived "received",
  // which is sum(amountPaid).
  const result = await db.$transaction(async (tx) => {
    const exists = await tx.invoice.findUnique({
      where: { id: body.invoiceId },
      select: { id: true },
    });
    if (!exists) return null;

    // The increment is what makes this safe, not merely being inside the
    // transaction: under Postgres' default READ COMMITTED isolation two
    // concurrent transactions can still each READ amountPaid = 0. `increment`
    // is applied by the database as `amountPaid = amountPaid + $1`, which
    // takes a row lock — the second writer blocks until the first commits and
    // then adds to the committed value. `invoice` below therefore holds the
    // TRUE post-payment figure, and its status/paidDate are still the
    // pre-payment ones this update did not touch, which is exactly what
    // invoiceStatusFor needs.
    const invoice = await tx.invoice.update({
      where: { id: body.invoiceId },
      data: { amountPaid: { increment: amount } },
    });

    const collectable = collectableAmount(invoice);
    const paidAfter = invoice.amountPaid;
    const rawBalance = collectable - paidAfter;
    // Snap sub-naira residue to zero before storing. Float arithmetic on a
    // grossed-up government invoice leaves fractions of a kobo behind, and a
    // stored 0.0000001 makes the client-facing receipt print "Balance
    // outstanding: ₦0" where it should say the account is settled.
    const balanceAfter = rawBalance > MONEY_EPSILON ? rawBalance : 0;

    const code = await nextDocumentCode(tx, "REC");
    const receipt = await tx.receipt.create({
      data: {
        code,
        invoiceId: invoice.id,
        amount,
        method: body.method ? String(body.method).trim() : null,
        reference: body.reference ? String(body.reference).trim() : null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        balanceAfter,
        createdById: user.id,
      },
    });
    // Signature is (amount, amountPaid, current, existingPaidDate, now?) and it
    // returns BOTH status and paidDate. Do not recompute paidDate by hand: this
    // helper deliberately preserves an existing paid date rather than
    // re-stamping it with today, which would move a January collection into
    // August and corrupt the monthly cash-flow buckets in /api/doz/finance.
    const { status, paidDate } = invoiceStatusFor(
      collectable,
      paidAfter,
      invoice.status,
      invoice.paidDate,
    );
    // amountPaid is deliberately NOT written again here — it was already moved
    // atomically above. Writing the absolute value back is the bug.
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status, paidDate },
    });
    return { receipt, invoice: updated };
  });

  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result, { status: 201 });
}
