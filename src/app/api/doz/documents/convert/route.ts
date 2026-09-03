import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { computeTax } from "@/lib/document-math";
import { syncProjectRevenue } from "@/lib/project-figures";

/** Quotation accepted -> invoice, carrying every line across unchanged. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }

  const quote = await db.quotation.findUnique({
    where: { id: body.quotationId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (quote.convertedInvoiceId) {
    return NextResponse.json(
      { error: "This quotation has already been converted to an invoice." },
      { status: 409 },
    );
  }

  const tax = computeTax({
    subtotal: quote.subtotal,
    discount: quote.discount,
    vatRate: quote.vatRate,
    whtRate: quote.whtRate,
    vatWithheldAtSource: quote.vatWithheldAtSource,
  });

  const invoice = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "INV");
    const created = await tx.invoice.create({
      data: {
        code,
        projectId: quote.projectId,
        accountId: quote.accountId,
        title: quote.title,
        eventStart: quote.eventStart,
        eventEnd: quote.eventEnd,
        detailLevel: quote.detailLevel,
        subtotal: quote.subtotal,
        discount: quote.discount,
        vatRate: quote.vatRate,
        tax: tax.vat,
        amount: tax.total,
        whtRate: quote.whtRate,
        whtAmount: tax.wht,
        expectedCash: tax.expectedCash,
        vatWithheldAtSource: quote.vatWithheldAtSource,
        grossUpRate: quote.grossUpRate,
        targetNet: quote.targetNet,
        paymentTerms: quote.paymentTerms,
        quotationId: quote.id,
        status: "DRAFT",
        lines: {
          create: quote.lines.map((l) => ({
            section: l.section,
            description: l.description,
            subDescription: l.subDescription,
            days: l.days,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            sortOrder: l.sortOrder,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    await tx.quotation.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", convertedInvoiceId: created.id },
    });

    // Converting IS accepting — this is the only place a quotation becomes
    // ACCEPTED — so the contract value becomes known here and nowhere else.
    // Inside the transaction, so a project can never report a figure from a
    // conversion that then rolled back. Nothing accepted yet leaves the
    // founder's estimate alone rather than asserting zero.
    if (quote.projectId) {
      await syncProjectRevenue(tx, quote.projectId);
    }
    return created;
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
