// ============================================================
// INVOICE PROVENANCE — real (Documents-issued) vs synthetic
// ============================================================
//
// Two code paths write to the one Invoice table:
//
//  - The Documents module (/api/doz/documents/invoices) creates REAL client
//    invoices. parseDocumentBody refuses to create one with zero lines, so
//    a real invoice always has at least one InvoiceLine.
//
//  - reconcileReceived() in /api/doz/projects mints a SYNTHETIC placeholder
//    invoice purely to give a "received" figure somewhere to land, for a
//    project that has no real invoice yet. It never creates InvoiceLine
//    rows.
//
// Finance must not double-count a project that has both: once a project's
// real invoice goes live, the synthetic row is superseded and must not add
// its money on top. reconcileReceived must also stop minting a new
// synthetic invoice the moment a real one exists — see final-fix-report.md.
//
// isSynthetic is set explicitly at creation time going forward, but four
// invoices already existed in production before that column did. Rather
// than requiring a data-migration backfill, this checks BOTH signals: a
// missing/false isSynthetic flag with zero lines is still synthetic. A real
// invoice can never have zero lines, so this cannot misclassify one.
//
// ------------------------------------------------------------------
// THE ONE RULE, AND WHY IT IS IN ONE FILE
// ------------------------------------------------------------------
// "Superseded" must mean the same thing in two places that used to decide
// it independently — /api/doz/finance (revenue, outstanding, cash) and
// /api/doz/projects (a project's "received"). It means exactly this:
//
//   A superseded synthetic loses its FACE VALUE — the live real invoice
//   now bills that work — but it never loses a naira of CASH. `amountPaid`
//   and `paidDate` on the row are reported untouched.
//
// Dropping the row wholesale was the previous rule and it deleted collected
// cash from Finance the instant a real invoice was marked sent: the
// synthetic vanished with the money on it while the real invoice still read
// amountPaid = 0. Money is never dropped here; only duplicate face value is.
//
// The matching ledger rule lives in planReceivedReconciliation() below and
// is what /api/doz/projects writes: fill the real invoices to capacity
// first, park only the genuine overflow on the synthetic that already
// exists, never mint a new one. Once that has run, a superseded synthetic
// holds nothing and this projection drops it outright.

import {
  MONEY_EPSILON,
  allocateDelta,
  collectableAmount,
  type AllocatableInvoice,
  type AllocationChange,
} from "./received-allocation.ts";

/** The minimal shape this needs from an invoice row. */
export type InvoiceProvenance = {
  isSynthetic?: boolean | null;
  /** Count of this invoice's InvoiceLine rows (e.g. Prisma's `_count.lines`). */
  linesCount: number;
};

/**
 * True for a synthetic reconcileReceived() placeholder; false for a real,
 * Documents-issued invoice.
 */
export function isSyntheticInvoice(inv: InvoiceProvenance): boolean {
  return Boolean(inv.isSynthetic) || inv.linesCount === 0;
}

/**
 * The set of project ids that have a LIVE real invoice — real (per
 * isSyntheticInvoice) and not DRAFT. A real invoice still being drafted has
 * not superseded anything yet, so a project's synthetic row should keep
 * counting until the real one is actually issued.
 */
export function projectsWithLiveRealInvoice(
  invoices: (InvoiceProvenance & { projectId?: string | null; status: string })[],
): Set<string> {
  const ids = new Set<string>();
  for (const inv of invoices) {
    if (inv.projectId && inv.status !== "DRAFT" && !isSyntheticInvoice(inv)) {
      ids.add(inv.projectId);
    }
  }
  return ids;
}

/** What the reporting projection needs from a row. */
export type SupersedableInvoice = InvoiceProvenance & {
  projectId?: string | null;
  status: string;
  amount: number;
  expectedCash?: number | null;
  amountPaid: number;
};

/**
 * The reporting projection every money-summing route must run its invoice
 * list through — Finance and Projects both call this, so "superseded" can
 * only be defined once.
 *
 * For each project that has a LIVE real invoice, its synthetic rows are
 * superseded and are rewritten as follows:
 *
 *  - a superseded synthetic holding no cash is DROPPED (the steady state
 *    after reconcileReceived has swept it);
 *  - a superseded synthetic still holding cash is KEPT, with `amountPaid`,
 *    `paidDate` and every other field untouched, but its face value cut to
 *    the part of that cash the project's live real invoices have no headroom
 *    to account for — normally 0, and non-zero only when the client has paid
 *    more than the real invoices can ever collect. It is marked PAID because
 *    a row with no face value left can owe nothing; that keeps it out of the
 *    outstanding/overdue filters instead of contributing a nonsense balance.
 *
 * The result: `sum(amountPaid)` over the returned list always equals
 * `sum(amountPaid)` over the input — no collected cash can go missing — while
 * `sum(collectableAmount)` counts the same work exactly once.
 *
 * Real invoices, and synthetics on projects with no live real invoice, pass
 * through untouched.
 */
export function dedupeSyntheticInvoices<T extends SupersedableInvoice>(invoices: T[]): T[] {
  const live = projectsWithLiveRealInvoice(invoices);
  if (live.size === 0) return invoices;

  // Per project: what the live real invoices could still collect. Cash on a
  // superseded synthetic is "already accounted for by the real invoice" only
  // up to this much.
  const headroom = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.projectId || !live.has(inv.projectId)) continue;
    if (inv.status === "DRAFT" || isSyntheticInvoice(inv)) continue;
    const room = Math.max(0, collectableAmount(inv) - (inv.amountPaid ?? 0));
    headroom.set(inv.projectId, (headroom.get(inv.projectId) ?? 0) + room);
  }

  const out: T[] = [];
  for (const inv of invoices) {
    const projectId = inv.projectId;
    const superseded = !!projectId && live.has(projectId) && isSyntheticInvoice(inv);
    if (!superseded) {
      out.push(inv);
      continue;
    }
    const cash = inv.amountPaid ?? 0;
    if (cash <= MONEY_EPSILON) continue; // nothing to carry — drop the row
    const room = headroom.get(projectId!) ?? 0;
    const absorbed = Math.min(cash, room);
    headroom.set(projectId!, room - absorbed);
    const face = cash - absorbed;
    out.push({ ...inv, amount: face, expectedCash: face, status: "PAID" } as T);
  }
  return out;
}

/**
 * A project's received figure — `sum(amountPaid)` per projectId — derived
 * through the same projection Finance uses, so the two can never drift.
 * Keyed by projectId; invoices with no project are ignored.
 */
export function receivedByProject<T extends SupersedableInvoice>(
  invoices: T[],
): Map<string, number> {
  const received = new Map<string, number>();
  for (const inv of dedupeSyntheticInvoices(invoices)) {
    if (!inv.projectId) continue;
    received.set(inv.projectId, (received.get(inv.projectId) ?? 0) + (inv.amountPaid ?? 0));
  }
  return received;
}

// ============================================================
// THE LEDGER SIDE — what reconcileReceived actually writes
// ============================================================

/** An invoice as the allocation planner needs to see it. */
export type LedgerInvoice = AllocatableInvoice & InvoiceProvenance;

export type ReceivedPlan = {
  /** sum(amountPaid) across EVERY invoice on the project, before this run. */
  previousReceived: number;
  /** newTotal - previousReceived. The only real money movement there is. */
  delta: number;
  /** Every row whose stored state must change, including pure migration. */
  writes: AllocationChange[];
  /**
   * The subset of the movement that is an actual client payment. Sums to
   * exactly |delta| — this, and never `writes`, is what a
   * PaymentConfirmation and the ActivityLog may report.
   */
  payments: AllocationChange[];
  /** Money no invoice on the project can hold. > 0 means refuse. */
  unallocated: number;
};

/**
 * Allocate one target total across a project's invoices under the founder's
 * ruling: real invoices first, to capacity; whatever they genuinely cannot
 * hold stays on the synthetic rows that already exist.
 *
 * Each allocateDelta call is handed the list its delta is derived from —
 * that is the contract in @/lib/received-allocation, and passing a
 * project-wide total against a narrowed list is exactly the bug this
 * replaces.
 */
function planAtTotal(
  real: LedgerInvoice[],
  synthetic: LedgerInvoice[],
  total: number,
  now: Date,
): { changes: AllocationChange[]; unallocated: number } {
  const realCapacity = real.reduce((s, i) => s + collectableAmount(i), 0);
  const realTarget = Math.min(total, realCapacity);
  const residue = total - realTarget; // >= 0; only ever non-zero on overflow
  const a = allocateDelta(real, realTarget, now);
  const b = allocateDelta(synthetic, residue, now);
  return {
    changes: [...a.changes, ...b.changes],
    unallocated: a.unallocated + b.unallocated,
  };
}

function applyChanges<T extends LedgerInvoice>(invoices: T[], changes: AllocationChange[]): T[] {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return invoices.map((inv) => {
    const c = byId.get(inv.id);
    return c ? { ...inv, amountPaid: c.to, status: c.status, paidDate: c.paidDate } : inv;
  });
}

/**
 * Plan a whole reconciliation of a project's received figure.
 *
 * Run in two stages, and the split is the point:
 *
 *  1. MIGRATION — re-lay the ledger at the total it ALREADY holds. On a
 *     project that has just gained a real invoice this is what lifts the
 *     money off the superseded synthetic and onto the real invoice. It moves
 *     no money in or out, so it must not produce a payment record.
 *  2. PAYMENT — go from there to the founder's new figure. These changes sum
 *     to exactly |newTotal - previousReceived|, which is why a
 *     PaymentConfirmation built from them can never be inflated by the
 *     migration underneath it.
 *
 * Invariant: after the writes, sum(amountPaid) over the project's invoices
 * equals newTotal exactly, provided `unallocated` is 0.
 */
export function planReceivedReconciliation(
  invoices: LedgerInvoice[],
  newTotal: number,
  now: Date = new Date(),
): ReceivedPlan {
  const previousReceived = invoices.reduce((s, i) => s + (i.amountPaid ?? 0), 0);
  const delta = newTotal - previousReceived;

  const split = (list: LedgerInvoice[]) => ({
    real: list.filter((i) => !isSyntheticInvoice(i)),
    synthetic: list.filter((i) => isSyntheticInvoice(i)),
  });

  // Stage 1 — migration. Capacity always covers money the rows already hold,
  // so this cannot come up short; its unallocated is carried anyway rather
  // than assumed away.
  const before = split(invoices);
  const migration = planAtTotal(before.real, before.synthetic, previousReceived, now);
  const migrated = applyChanges(invoices, migration.changes);

  // Stage 2 — the payment itself.
  const after = split(migrated);
  const payment = planAtTotal(after.real, after.synthetic, newTotal, now);
  const final = applyChanges(migrated, payment.changes);

  // Collapse both stages into one write per row, measured from the ORIGINAL
  // stored value so the database is touched once and the audit trail reads
  // as a single move.
  const finalById = new Map(final.map((i) => [i.id, i]));
  const writes: AllocationChange[] = [];
  for (const inv of invoices) {
    const f = finalById.get(inv.id)!;
    const moved =
      Math.abs((f.amountPaid ?? 0) - (inv.amountPaid ?? 0)) > MONEY_EPSILON ||
      f.status !== inv.status ||
      (f.paidDate?.getTime() ?? null) !== (inv.paidDate?.getTime() ?? null);
    if (!moved) continue;
    writes.push({
      id: inv.id,
      code: inv.code,
      from: inv.amountPaid ?? 0,
      to: f.amountPaid ?? 0,
      status: f.status,
      paidDate: f.paidDate,
    });
  }

  return {
    previousReceived,
    delta,
    writes,
    payments: payment.changes,
    unallocated: migration.unallocated + payment.unallocated,
  };
}
