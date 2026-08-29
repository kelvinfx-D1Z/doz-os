// ============================================================
// WHETHER A CLIENT DOCUMENT'S CONTENT MAY STILL BE EDITED
//
// A DRAFT has not been shown to a client, so its lines, client/header
// fields and computed totals can be freely rewritten in place. Once it
// moves to SENT, ACCEPTED, DECLINED or EXPIRED, a client has (or may have)
// already seen it — rewriting its content underneath them is how a company
// ends up arguing about what it actually quoted. That situation needs a
// revision (a new document superseding the old one), a deliberately
// separate and larger feature this function does not attempt.
//
// Pure and DB-free, exactly like document-math.ts, so both the API route
// and its tests can share one answer to "is this editable?" rather than
// each route re-deriving the rule.
// ============================================================

/** Statuses whose content (lines, client, dates, totals) may still change. */
export const CONTENT_EDITABLE_STATUSES = ["DRAFT"] as const;

/**
 * True only for a DRAFT. Every other status — SENT, ACCEPTED, DECLINED,
 * EXPIRED — has content that must be treated as already communicated to a
 * client and therefore frozen.
 */
export function isContentEditable(status: string): boolean {
  return (CONTENT_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/** Message shown/returned when a content edit is refused. */
export const CONTENT_LOCKED_MESSAGE =
  "This quotation has already been sent, so its content is locked. Create a revision instead of editing a sent document.";
