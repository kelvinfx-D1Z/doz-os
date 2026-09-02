import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { duplicateInvoiceData, duplicateLines } from "@/lib/document-duplicate";
import { parseDocumentBody } from "@/lib/document-request";
import { lineAmount } from "@/lib/document-math";

/**
 * The company's own VAT registration, read once per document creation.
 *
 * A company that is not VAT-registered must not issue documents charging VAT.
 * The checkbox in Company settings was stored and whitelisted but never read
 * by anything, so unticking it changed no output. This is what wires it up.
 * Defaults to registered if the row does not exist yet, matching the schema
 * default.
 */
async function companyVatRegistered(): Promise<boolean> {
  const company = await db.companySettings.findUnique({
    where: { id: "singleton" },
    select: { vatRegistered: true },
  });
  return company?.vatRegistered ?? true;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const invoices = await db.invoice.findMany({
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      account: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ invoices });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // DUPLICATE — start from an existing invoice instead of a blank one. The
  // copy is a fresh DRAFT with its own number, no payment recorded against it,
  // and no link to the quotation the original came from (that link is unique).
  // See src/lib/document-duplicate.ts.
  if (typeof body.duplicateOf === "string" && body.duplicateOf.trim()) {
    const src = await db.invoice.findUnique({
      where: { id: body.duplicateOf.trim() },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!src) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const created = await db.$transaction(async (tx) => {
      const code = await nextDocumentCode(tx, "INV");
      return tx.invoice.create({
        data: {
          ...duplicateInvoiceData(src),
          code,
          lines: { create: duplicateLines(src.lines) },
        },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      // Minting a number and inserting a document with all its lines can take
      // longer than Prisma's 5s default against a remote pooler — a copy of an
      // 18-line quotation exceeded it in testing. Failing here would leave the
      // founder with a "couldn't duplicate" error on a document that is fine.
    }, { timeout: 30_000 });
    return NextResponse.json(
      { ok: true, invoice: created, duplicatedFrom: src.code },
      { status: 201 },
    );
  }

  const parsed = parseDocumentBody(body, {
    vatRegistered: await companyVatRegistered(),
  });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { lines, subtotal, discount, vatRate, whtRate, vatWithheldAtSource, grossUpRate, targetNet, tax } = parsed;

  const created = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "INV");
    return tx.invoice.create({
      data: {
        code,
        projectId: body.projectId || null,
        accountId: body.accountId || null,
        title: body.title ? String(body.title).trim() : null,
        eventStart: body.eventStart ? new Date(body.eventStart) : null,
        eventEnd: body.eventEnd ? new Date(body.eventEnd) : null,
        detailLevel: body.detailLevel === "ITEMISED" ? "ITEMISED" : "SUMMARY",
        subtotal,
        discount,
        vatRate,
        tax: tax.vat,
        amount: tax.total,
        whtRate,
        whtAmount: tax.wht,
        expectedCash: tax.expectedCash,
        vatWithheldAtSource,
        grossUpRate,
        targetNet,
        paymentTerms: body.paymentTerms ? String(body.paymentTerms).trim() : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        quotationId: body.quotationId || null,
        lines: {
          create: lines.map((l, i) => ({
            section: l.section,
            description: l.description,
            subDescription: l.subDescription ?? null,
            days: l.days,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: lineAmount(l),
            sortOrder: i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return NextResponse.json({ invoice: created, expectedCash: tax.expectedCash }, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }
  const existing = await db.invoice.findUnique({ where: { id: body.invoiceId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const VALID_STATUS = ["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE"];
  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. One of: ${VALID_STATUS.join(", ")}` },
        { status: 400 },
      );
    }
    data.status = body.status;
  }
  if (body.detailLevel === "SUMMARY" || body.detailLevel === "ITEMISED") {
    data.detailLevel = body.detailLevel;
  }
  if (typeof body.paymentTerms === "string") {
    data.paymentTerms = body.paymentTerms.trim() || null;
  }

  const updated = await db.invoice.update({ where: { id: body.invoiceId }, data });
  return NextResponse.json({ ok: true, invoice: updated });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }
  const existing = await db.invoice.findUnique({ where: { id: body.invoiceId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.amountPaid > 0) {
    return NextResponse.json(
      { error: "This invoice has payments recorded against it and cannot be deleted." },
      { status: 409 },
    );
  }

  // amountPaid === 0 is NOT enough to prove nothing hangs off this invoice.
  // Receipt.invoiceId and PaymentConfirmation.invoiceId are both REQUIRED
  // relations, so Prisma's default Restrict makes the delete raise P2003 and
  // surface as an unhandled 500. Both are reachable with nothing paid:
  //   - a client files a payment confirmation through the portal, which
  //     deliberately does not touch amountPaid; or
  //   - the founder corrects a project's "received" figure back down, and
  //     allocateDelta unwinds amountPaid to 0 while the confirmation rows stay.
  // Count them first and say plainly what is in the way.
  const [receiptCount, confirmationCount] = await Promise.all([
    db.receipt.count({ where: { invoiceId: body.invoiceId } }),
    db.paymentConfirmation.count({ where: { invoiceId: body.invoiceId } }),
  ]);
  if (receiptCount > 0 || confirmationCount > 0) {
    const blockers: string[] = [];
    if (receiptCount > 0) {
      blockers.push(`${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`);
    }
    if (confirmationCount > 0) {
      blockers.push(
        `${confirmationCount} client payment confirmation${confirmationCount === 1 ? "" : "s"}`,
      );
    }
    return NextResponse.json(
      {
        error: `This invoice cannot be deleted because ${blockers.join(" and ")} ${
          receiptCount + confirmationCount === 1 ? "is" : "are"
        } filed against it. Delete or reject those first.`,
      },
      { status: 409 },
    );
  }

  await db.$transaction([
    // Release any quotation pointing at this invoice. Without this the
    // quotation is stranded ACCEPTED with a dangling convertedInvoiceId: it
    // cannot be re-converted (409), cannot be deleted (409), and the UI hides
    // both buttons — a permanently unusable row. Sending it back to SENT
    // returns it to the state it was in before the conversion.
    db.quotation.updateMany({
      where: { convertedInvoiceId: body.invoiceId },
      data: { convertedInvoiceId: null, status: "SENT" },
    }),
    db.invoiceLine.deleteMany({ where: { invoiceId: body.invoiceId } }),
    db.invoice.delete({ where: { id: body.invoiceId } }),
  ]);
  return NextResponse.json({ ok: true });
}
