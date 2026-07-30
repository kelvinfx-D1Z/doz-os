// ============================================================
// RECEIVED → INVOICE ALLOCATION (pure, no DB)
//
// "Received" is not a column: every screen derives it from
// sum(Invoice.amountPaid) for the project. When the founder types a new
// received figure in Projects & Events, the invoice ledger has to be moved
// to match it.
//
// The rules that matter (both were bugs before):
//
//  1. Only the DELTA is applied. Re-spreading the whole total from scratch
//     ignores WHICH invoice the client actually paid, and will happily reset
//     a genuinely-settled invoice back to SENT — the client portal then tells
//     the client that the invoice they paid is unpaid.
//
//  2. paidDate is only ever set for a fully-PAID invoice, and an existing
//     paidDate is PRESERVED rather than re-stamped with today. Re-stamping
//     moves a January collection into July and corrupts the monthly cash-flow
//     buckets in /api/doz/finance. Anything short of PAID has paidDate null.
//
// These are pure functions so the same code that ships in
// /api/doz/projects can be exercised by the rollback verification scripts.
// ============================================================

/** Money comparisons are in naira — anything under this is rounding noise. */
export const MONEY_EPSILON = 0.0001;

/** The invoice fields the allocation needs. Nothing else is read. */
export type AllocatableInvoice = {
  id: string;
  code?: string | null;
  amount: number;
  amountPaid: number;
  status: string;
  paidDate: Date | null;
};

/** One invoice's resulting state. `from`/`to` are amountPaid before/after. */
export type AllocationChange = {
  id: string;
  code?: string | null;
  from: number;
  to: number;
  status: string;
  paidDate: Date | null;
};

export type AllocationResult = {
  /** newTotal minus the current sum(amountPaid). Signed. */
  delta: number;
  /** Only the invoices that actually move. Empty when delta is ~0. */
  changes: AllocationChange[];
  /** Money the invoices on file could not absorb / give back. Should be 0. */
  unallocated: number;
};

/**
 * Recompute an invoice's status from its amounts — mirrors verify_payment in
 * /api/doz/reminders.
 *
 * `existingPaidDate` is the invoice's CURRENT paidDate: a still-fully-paid
 * invoice keeps it instead of being re-stamped with today.
 */
export function invoiceStatusFor(
  amount: number,
  amountPaid: number,
  current: string,
  existingPaidDate: Date | null,
  now: Date = new Date(),
): { status: string; paidDate: Date | null } {
  const balance = amount - amountPaid;
  if (balance <= MONEY_EPSILON && amountPaid > 0) {
    return { status: "PAID", paidDate: existingPaidDate ?? now };
  }
  if (amountPaid > 0) return { status: "PARTIAL", paidDate: null };
  // Back to nothing paid — fall back to SENT unless it was still a draft.
  return { status: current === "DRAFT" ? "DRAFT" : "SENT", paidDate: null };
}

/**
 * Work out how to move a project's invoices so sum(amountPaid) === newTotal,
 * applying only the difference.
 *
 *   increase -> fill outstanding balances OLDEST first; invoices that are
 *               already settled are skipped entirely and never touched.
 *   decrease -> unwind NEWEST first.
 *
 * @param invoices Project invoices in oldest-first order (issuedDate asc).
 */
export function allocateDelta(
  invoices: AllocatableInvoice[],
  newTotal: number,
  now: Date = new Date(),
): AllocationResult {
  const currentTotal = invoices.reduce((sum, i) => sum + (i.amountPaid ?? 0), 0);
  const delta = newTotal - currentTotal;
  if (Math.abs(delta) < MONEY_EPSILON) {
    return { delta: 0, changes: [], unallocated: 0 };
  }

  const increasing = delta > 0;
  const order = increasing ? invoices : [...invoices].reverse();
  let remaining = Math.abs(delta);
  const changes: AllocationChange[] = [];

  for (const inv of order) {
    if (remaining <= MONEY_EPSILON) break;
    const paid = inv.amountPaid ?? 0;
    // What this invoice can absorb (increase) or give back (decrease).
    const headroom = increasing ? inv.amount - paid : paid;
    if (headroom <= MONEY_EPSILON) continue; // settled already / nothing to undo
    const move = Math.min(headroom, remaining);
    remaining -= move;
    const to = increasing ? paid + move : paid - move;
    const { status, paidDate } = invoiceStatusFor(inv.amount, to, inv.status, inv.paidDate, now);
    changes.push({ id: inv.id, code: inv.code, from: paid, to, status, paidDate });
  }

  return { delta, changes, unallocated: remaining > MONEY_EPSILON ? remaining : 0 };
}
