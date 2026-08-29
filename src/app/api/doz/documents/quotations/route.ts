import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { parseDocumentBody } from "@/lib/document-request";
import { lineAmount } from "@/lib/document-math";
import { isContentEditable, CONTENT_LOCKED_MESSAGE } from "@/lib/document-editability";

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

  // A content edit — the lines, and the client/header fields that go with
  // them — is signalled by `lines` being present in the body. This is the
  // only path that may rewrite what the document actually says, so it is
  // the only path gated on DRAFT. Everything below this block (status,
  // detailLevel alone, notes, paymentTerms) is cosmetic or workflow state
  // and keeps working on a document in any status, exactly as before.
  if (Array.isArray(body.lines)) {
    if (!isContentEditable(existing.status)) {
      return NextResponse.json({ error: CONTENT_LOCKED_MESSAGE }, { status: 409 });
    }

    // Mirrors POST exactly: same parser, same tax module, same line-amount
    // helper. Nothing here re-derives arithmetic POST already owns — an
    // edited quotation must total the same way a freshly-created one would
    // from the same inputs.
    const parsed = parseDocumentBody(body, {
      vatRegistered: await companyVatRegistered(),
    });
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { lines, subtotal, discount, vatRate, whtRate, vatWithheldAtSource, grossUpRate, targetNet, tax } =
      parsed;

    const updated = await db.$transaction(async (tx) => {
      // Delete-then-recreate, both against the same transaction client, so
      // a failure partway through cannot leave the quotation with half its
      // old lines and half its new ones — the same pattern DELETE uses.
      await tx.quotationLine.deleteMany({ where: { quotationId: body.quotationId } });
      return tx.quotation.update({
        where: { id: body.quotationId },
        data: {
          // Header fields are derived exactly the way POST derives them —
          // same expressions, same falsy-to-null defaulting — because the
          // builder always resubmits the complete form on an edit, so an
          // absent/empty field here means the founder cleared it, not that
          // it should be left alone.
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
          // Notes and payment terms are the two POST-accepted fields the
          // document builder's form never collects at all, so — unlike the
          // header fields above — their absence from a content-edit body
          // means "not part of this form", not "cleared". Preserving them
          // is what keeps an edit made through the builder from silently
          // erasing terms or notes set some other way.
          paymentTerms:
            typeof body.paymentTerms === "string" ? body.paymentTerms.trim() || null : existing.paymentTerms,
          notes: typeof body.notes === "string" ? body.notes.trim() || null : existing.notes,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          // Never touched: `code` is minted once from a reserved sequence
          // and must never move, skip or duplicate — see document-code.ts.
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

    return NextResponse.json({ ok: true, quotation: updated, expectedCash: tax.expectedCash });
  }

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
