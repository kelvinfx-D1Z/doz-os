// ============================================================
// WHETHER A CLIENT DOCUMENT'S CONTENT MAY STILL BE EDITED, AND WHICH
// STATUS MOVES IT MAY MAKE
//
// A DRAFT has not been shown to a client, so its lines, client/header
// fields and computed totals can be freely rewritten in place. Once it
// moves to SENT, ACCEPTED, DECLINED or EXPIRED, a client has (or may have)
// already seen it — rewriting its content underneath them is how a company
// ends up arguing about what it actually quoted. Superseding a sent
// document with a numbered revision is a deliberately separate and larger
// feature this module does not attempt; the honest fallback today is a new
// quotation.
//
// Pure and DB-free, exactly like document-math.ts, so both the API route
// and its tests can share one answer to "is this editable?" and "can this
// status move?" rather than each route re-deriving the rules.
// ============================================================

/** Every status a quotation can be in. */
export const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"] as const;

/** Statuses whose content (lines, client, dates, totals) may still change. */
const CONTENT_EDITABLE_STATUSES = ["DRAFT"] as const;

/**
 * True only for a DRAFT. Every other status — SENT, ACCEPTED, DECLINED,
 * EXPIRED — has content that must be treated as already communicated to a
 * client and therefore frozen.
 */
export function isContentEditable(status: string): boolean {
  return (CONTENT_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a quotation may move from `from` to `to`.
 *
 * Deliberately not a full state machine — the one rule that matters is that
 * DRAFT is a one-way exit. Once a quotation has moved off DRAFT it can never
 * move back to it, because moving back would make `isContentEditable` say
 * yes again for a document a client may already have seen. Every other move
 * (SENT -> ACCEPTED, SENT -> DECLINED, SENT -> EXPIRED, and so on) stays
 * legal — this function only ever says no for a `to` of "DRAFT".
 */
export function canTransitionStatus(from: string, to: string): boolean {
  if (to === "DRAFT") return from === "DRAFT";
  return true;
}

/** Message shown/returned when a content edit is refused. */
export const CONTENT_LOCKED_MESSAGE =
  "This quotation has already been sent, so its content is locked. Create a new quotation instead of editing a sent document.";

/** Message shown/returned when a status update would move a document back to DRAFT. */
export const BACKWARD_TO_DRAFT_MESSAGE =
  "A quotation that has already been sent can't be moved back to DRAFT.";

// ============================================================
// AN INVOICE'S CONTENT
//
// The founder's case, in his words: "in some cases we might still need to
// be able to edit the invoice, as there are last minute changes to a
// client's needs, things are added or removed."
//
// That is real. An event's scope moves in the last week, and a small firm
// re-issues the invoice rather than raising a credit note. So an invoice is
// editable for longer than a quotation is — but not forever, and the line
// is not drawn at status.
//
// THE LINE IS MONEY, NOT STATUS
// Once any payment has been recorded, a Receipt row exists that names the
// figures on this invoice, and Finance has allocated cash against it.
// Rewriting the lines then leaves a receipt describing an invoice that no
// longer says what it said — the client holds one document and the system
// holds another. So `amountPaid > 0` locks the content outright, whatever
// the status happens to read.
//
// Below that, SENT is deliberately still editable. Refusing it would be
// tidier and would not match how this business runs: the founder emails
// every document himself, and an invoice sent on Monday with a screen added
// on Tuesday is re-sent, under the same number, as the same invoice. The
// alternative he actually has is duplicating it, which mints a second
// invoice number for one job — worse for his records than an honest edit.
// ============================================================

/** Every status an invoice can be in. */
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE"] as const;

/**
 * Whether an invoice's lines and header may still be rewritten.
 *
 * `amountPaid` is the only thing that truly locks it — see the note above.
 * PAID is refused as well even at a zero recorded amount, because marking
 * an invoice paid is a claim that the account is settled, and quietly
 * changing what was owed after that is the one edit nobody could defend.
 */
export function isInvoiceContentEditable(status: string, amountPaid: number): boolean {
  if (Number(amountPaid) > 0) return false;
  if (status === "PAID" || status === "PARTIAL") return false;
  return (INVOICE_STATUSES as readonly string[]).includes(status);
}

/** Message returned when an invoice's content edit is refused. */
export const INVOICE_LOCKED_MESSAGE =
  "This invoice has money recorded against it, so its content is locked. Duplicate it and edit the copy, or reverse the payment first.";

/**
 * Whether re-issuing this invoice changes a document the client already
 * holds. Not a refusal — the founder is told, and decides.
 */
export function isReissue(status: string): boolean {
  return status !== "DRAFT";
}
