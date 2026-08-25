import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { parseDocumentBody } from "@/lib/document-request";
import { lineAmount } from "@/lib/document-math";

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

  const parsed = parseDocumentBody(body);
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
  await db.$transaction([
    db.invoiceLine.deleteMany({ where: { invoiceId: body.invoiceId } }),
    db.invoice.delete({ where: { id: body.invoiceId } }),
  ]);
  return NextResponse.json({ ok: true });
}
