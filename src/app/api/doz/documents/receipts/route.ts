import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { collectableAmount, invoiceStatusFor } from "@/lib/received-allocation";

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

  const invoice = await db.invoice.findUnique({ where: { id: body.invoiceId } });
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });

  const collectable = collectableAmount(invoice);
  const paidAfter = invoice.amountPaid + amount;
  const balanceAfter = Math.max(0, collectable - paidAfter);

  const result = await db.$transaction(async (tx) => {
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
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid: paidAfter, status, paidDate },
    });
    return { receipt, invoice: updated };
  });

  return NextResponse.json(result, { status: 201 });
}
