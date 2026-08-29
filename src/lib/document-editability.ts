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
