import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
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

  const quotations = await db.quotation.findMany({
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      account: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ quotations });
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

  const parsed = parseDocumentBody(body, {
    vatRegistered: await companyVatRegistered(),
  });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { lines, subtotal, discount, vatRate, whtRate, vatWithheldAtSource, grossUpRate, targetNet, tax } = parsed;

  const created = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "QUO");
    return tx.quotation.create({
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
        total: tax.total,
        whtRate,
        vatWithheldAtSource,
        grossUpRate,
        targetNet,
        paymentTerms: body.paymentTerms ? String(body.paymentTerms).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        createdById: user.id,
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

  return NextResponse.json({ quotation: created, expectedCash: tax.expectedCash }, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }
  const existing = await db.quotation.findUnique({ where: { id: body.quotationId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const VALID_STATUS = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];
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
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.paymentTerms === "string") {
    data.paymentTerms = body.paymentTerms.trim() || null;
  }

  const updated = await db.quotation.update({ where: { id: body.quotationId }, data });
  return NextResponse.json({ ok: true, quotation: updated });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }
  const existing = await db.quotation.findUnique({ where: { id: body.quotationId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.convertedInvoiceId) {
    return NextResponse.json(
      { error: "This quotation was converted to an invoice and cannot be deleted." },
      { status: 409 },
    );
  }
  await db.$transaction([
    db.quotationLine.deleteMany({ where: { quotationId: body.quotationId } }),
    db.quotation.delete({ where: { id: body.quotationId } }),
  ]);
  return NextResponse.json({ ok: true });
}
