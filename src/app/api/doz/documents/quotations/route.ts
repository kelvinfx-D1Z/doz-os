import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { duplicateQuotationData, duplicateLines } from "@/lib/document-duplicate";
import { parseDocumentBody } from "@/lib/document-request";
import { lineAmount } from "@/lib/document-math";
import {
  isContentEditable,
  canTransitionStatus,
  CONTENT_LOCKED_MESSAGE,
  BACKWARD_TO_DRAFT_MESSAGE,
  QUOTATION_STATUSES,
} from "@/lib/document-editability";

// Thrown from inside a $transaction to abort it and report a 409 without
// committing any of the transaction's writes — the same pattern
// src/app/api/doz/projects/pricing/route.ts uses for its own conditional
// updateMany-or-conflict transitions.
class ContentLockedError extends Error {}

// Same idea, for the plain status/detailLevel/notes/paymentTerms branch:
// thrown when its own compare-and-set updateMany matches nothing, meaning
// the quotation's status moved between this request's read and its write.
class StatusConflictError extends Error {}
const STATUS_CONFLICT_MESSAGE =
  "This quotation changed elsewhere just now. Reload it and try again.";

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

  // DUPLICATE — start from an existing quotation instead of a blank one.
  // The copy is always a fresh DRAFT with its own number; see
  // src/lib/document-duplicate.ts for what is carried and what is reset.
  if (typeof body.duplicateOf === "string" && body.duplicateOf.trim()) {
    const src = await db.quotation.findUnique({
      where: { id: body.duplicateOf.trim() },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!src) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

    const created = await db.$transaction(async (tx) => {
      // Minted inside the transaction so two duplications cannot race onto
      // the same number.
      const code = await nextDocumentCode(tx, "QUO");
      return tx.quotation.create({
        data: {
          ...duplicateQuotationData(src),
          code,
          createdById: user.id,
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
      { ok: true, quotation: created, duplicatedFrom: src.code },
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
    // Fast, cheap 409 for the common case — avoids doing any parsing or tax
    // work for a document that is obviously already locked. This is NOT the
    // safety net: `existing` was read before this request's transaction
    // even started, so a status change racing in in between (another tab
    // clicking "Mark as sent") would slip past a check that only ever looks
    // at this stale read. The real guard is the conditional `updateMany`
    // inside the transaction below, which re-checks status at the instant
    // it writes.
    if (!isContentEditable(existing.status)) {
      return NextResponse.json({ error: CONTENT_LOCKED_MESSAGE }, { status: 409 });
    }

    // A content edit may also carry a new status (e.g. a future "save and
    // send" action) — validated the same way the status-only branch below
    // validates it, and applied inside the same conditional write so the
    // transition lands atomically with the content, rather than the two
    // silently disagreeing.
    if (typeof body.status === "string" && !QUOTATION_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. One of: ${QUOTATION_STATUSES.join(", ")}` },
        { status: 400 },
      );
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

    let updated;
    try {
      updated = await db.$transaction(async (tx) => {
        // The DRAFT guard and the write happen as one conditional statement
        // against the DB, not a separate read followed by a write — closing
        // the gap the fast check above cannot. Only a request that finds
        // the row still DRAFT at this exact instant can match; a "Mark as
        // sent" that commits first leaves nothing for this updateMany to
        // match, and it reports zero rather than silently overwriting a
        // quotation that is no longer a draft. Same pattern as
        // src/app/api/doz/projects/pricing/route.ts's reopen/convert guards.
        const flipped = await tx.quotation.updateMany({
          where: { id: body.quotationId, status: "DRAFT" },
          data: {
            // Header fields are derived exactly the way POST derives them —
            // same expressions, same falsy-to-null defaulting — because the
            // builder always resubmits the complete form on an edit, so an
            // absent/empty field here means the founder cleared it, not
            // that it should be left alone.
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
            // document builder's form never collects at all, so — unlike
            // the header fields above — their absence from a content-edit
            // body means "not part of this form", not "cleared".
            // Preserving them is what keeps an edit made through the
            // builder from silently erasing terms or notes set some other
            // way.
            paymentTerms:
              typeof body.paymentTerms === "string" ? body.paymentTerms.trim() || null : existing.paymentTerms,
            notes: typeof body.notes === "string" ? body.notes.trim() || null : existing.notes,
            validUntil: body.validUntil ? new Date(body.validUntil) : null,
            // Carried in the same conditional write so a forward move (e.g.
            // DRAFT -> SENT) lands atomically with the content it applies
            // to. `canTransitionStatus` is not needed here beyond the
            // membership check above: this update only ever fires with
            // `existing status = DRAFT` confirmed by the `where` clause
            // itself, so the only transitions reachable are DRAFT -> X,
            // never a backward move into DRAFT from something else.
            ...(typeof body.status === "string" ? { status: body.status } : {}),
            // Never touched: `code` is minted once from a reserved sequence
            // and must never move, skip or duplicate — see document-code.ts.
          },
        });
        if (flipped.count === 0) {
          throw new ContentLockedError(CONTENT_LOCKED_MESSAGE);
        }

        // Delete-then-recreate, both against the same transaction client,
        // so a failure partway through cannot leave the quotation with
        // half its old lines and half its new ones — the same pattern
        // DELETE uses. `updateMany` cannot carry a nested relation write,
        // which is why the lines are replaced as separate statements here
        // rather than nested inside the update above; both still run
        // inside this one transaction, so they commit or roll back
        // together with the guarded update.
        await tx.quotationLine.deleteMany({ where: { quotationId: body.quotationId } });
        await tx.quotationLine.createMany({
          data: lines.map((l, i) => ({
            quotationId: body.quotationId,
            section: l.section,
            description: l.description,
            subDescription: l.subDescription ?? null,
            days: l.days,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: lineAmount(l),
            sortOrder: i,
          })),
        });

        return tx.quotation.findUnique({
          where: { id: body.quotationId },
          include: { lines: { orderBy: { sortOrder: "asc" } } },
        });
      });
    } catch (e) {
      if (e instanceof ContentLockedError) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true, quotation: updated, expectedCash: tax.expectedCash });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!QUOTATION_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. One of: ${QUOTATION_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    // The one rule that matters: a document already moved off DRAFT can
    // never be walked back to it. Before this file grew a content-edit
    // path this was harmless — there was nothing destructive to pair the
    // downgrade with. Now that a DRAFT can have its lines rewritten, a
    // `status: "DRAFT"` PATCH followed by a `lines: [...]` PATCH would
    // rewrite a quotation a client has already seen, so the downgrade
    // itself has to be refused here, at the source. Checked against
    // `existing.status` — the same value the compare-and-set write below
    // conditions on, so this check and that write can never disagree about
    // what status the quotation was actually in.
    if (!canTransitionStatus(existing.status, body.status)) {
      return NextResponse.json({ error: BACKWARD_TO_DRAFT_MESSAGE }, { status: 409 });
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

  // Compare-and-set, not a plain update: `existing.status` was read once,
  // above, before this handler decided anything (including the
  // canTransitionStatus check just above). Conditioning the write on that
  // same status closes the general race, not just the DRAFT-specific one —
  // a status flip landing between this request's read and its write (e.g.
  // "mark as sent" from another tab) now makes this write match nothing
  // rather than silently overwriting whatever committed first. Same
  // updateMany-or-conflict pattern as the content branch above and as
  // src/app/api/doz/projects/pricing/route.ts's reopen/convert guards.
  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      const flipped = await tx.quotation.updateMany({
        where: { id: body.quotationId, status: existing.status },
        data,
      });
      if (flipped.count === 0) {
        throw new StatusConflictError(STATUS_CONFLICT_MESSAGE);
      }
      return tx.quotation.findUnique({ where: { id: body.quotationId } });
    });
  } catch (e) {
    if (e instanceof StatusConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

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
