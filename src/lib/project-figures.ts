// ============================================================
// A PROJECT'S FIGURES ARE EARNED, NOT TYPED
//
// `Project.budget` (what the job costs D1Z) and `Project.revenue` (the total
// contract value) were typed into the New Project form at creation — the one
// moment nobody knows either number. In the founder's words: "at this point of
// project creation i do not have that information yet."
//
// So the columns stay and their SOURCE changes. That distinction matters:
// twelve places read `budget` and `revenue` — the projects, crm, dashboard,
// procurement, finance, marketing and monthly-report routes, plus five
// components. Deriving on read would mean touching all twelve. Deriving on
// WRITE means none of them change; the number in the column simply becomes
// true instead of invented.
//
//   budget   = the cost sheet: SUM(quantity x days x unitPrice) over
//              ProjectService. Recomputed whenever a cost line moves.
//   revenue  = the accepted quotation's total. Stamped on acceptance — that
//              is step 3 of the plan, not this module.
//
// The arithmetic is `lineTotal` from pricing.ts and is never re-derived here.
// A stored total that ignored `days` once underpaid a vendor on a four-day
// line; there is exactly one implementation of that rule and this defers to it.
// ============================================================

import { lineTotal } from "./pricing.ts";

export interface ProjectCostLine {
  quantity: number;
  days: number;
  /** BP — what D1Z pays out. Never clientPrice; that is the client's side. */
  unitPrice: number;
}

/**
 * What a project costs, from its cost sheet.
 *
 * A project with no lines costs 0 — which is honest, and different from the
 * old behaviour where 0 meant "the founder guessed 0" or "he left it blank".
 * Rounded to the kobo so repeated recomputation cannot drift on float error.
 */
export function projectBudgetFrom(lines: ProjectCostLine[]): number {
  const total = lines.reduce(
    (sum, l) => sum + lineTotal({ quantity: l.quantity, days: l.days, price: l.unitPrice }),
    0,
  );
  return Math.round(total * 100) / 100;
}

/**
 * Whether a recomputed figure differs enough from the stored one to be worth
 * a write. Money compares to the kobo; anything smaller is float noise.
 */
export function budgetChanged(stored: number | null | undefined, computed: number): boolean {
  const current = typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
  return Math.abs(current - computed) >= 0.005;
}

// ------------------------------------------------------------
// Keeping the column true
//
// The client is passed in rather than imported so this file never reaches for
// the database itself — it stays importable by the test runner, and callers
// can hand it a transaction so the recompute commits with the change that
// caused it. A budget recomputed outside the transaction can be overwritten by
// a concurrent line edit and left describing a cost sheet that no longer
// exists.
// ------------------------------------------------------------

interface BudgetSyncClient {
  projectService: {
    findMany(args: {
      where: { projectId: string };
      select: { quantity: true; days: true; unitPrice: true };
    }): Promise<ProjectCostLine[]>;
  };
  project: {
    findUnique(args: {
      where: { id: string };
      select: { budget: true };
    }): Promise<{ budget: number | null } | null>;
    update(args: { where: { id: string }; data: { budget: number } }): Promise<unknown>;
  };
}

/**
 * Recompute a project's cost from its lines and store it. Returns the figure.
 *
 * Call this after anything that changes a line's quantity, days or unitPrice.
 * Status changes and clientPrice writes do not move the cost and do not need
 * it — clientPrice is what the CLIENT pays, which is revenue, not budget.
 */
export async function syncProjectBudget(
  client: BudgetSyncClient,
  projectId: string,
): Promise<number | null> {
  const [lines, project] = await Promise.all([
    client.projectService.findMany({
      where: { projectId },
      select: { quantity: true, days: true, unitPrice: true },
    }),
    client.project.findUnique({ where: { id: projectId }, select: { budget: true } }),
  ]);
  const budget = projectBudgetFrom(lines);
  const storedBudget = project?.budget ?? 0;

  // Do not assert a cost of zero when what we actually have is no information.
  // Every cost sheet in production currently has lines but no prices, so a
  // naive recompute would silently replace a founder's N3,700,000 estimate
  // with N0 the moment he touched any line on that project. Zero is a claim —
  // "this job costs nothing" — and it is false here. The same rule the rest of
  // this codebase lives by: 0 is a real figure, absent is not the same thing.
  //
  // So while nothing on the sheet carries a price, an existing estimate is
  // left alone. The first priced line replaces it with the truth.
  if (budget === 0 && !hasAnyPrice(lines) && storedBudget > 0) {
    return null;
  }

  await client.project.update({ where: { id: projectId }, data: { budget } });
  return budget;
}

/** True once at least one line carries a real price above zero. */
export function hasAnyPrice(lines: ProjectCostLine[]): boolean {
  return lines.some((l) => Number(l.unitPrice) > 0);
}

// ============================================================
// REVENUE — the total contract value, earned on acceptance
//
// The founder's sequence: "when client is ok with the quotation it can be
// converted to an invoice, then the original project cost (budget) and Total
// contract value is automatically calculated."
//
// In this system converting a quotation to an invoice IS accepting it — the
// convert route is the only place that writes ACCEPTED. So the contract value
// becomes known at exactly that moment, and it is the accepted quotation's
// total.
//
// Renegotiation is normal here: Triple Helix moved from N12,117,400 to
// N9,384,105 mid-conversation. So the authority is the MOST RECENTLY accepted
// quotation, not the first — accepting a revised one re-stamps the project.
// ============================================================

export interface AcceptableQuotation {
  status: string;
  total: number;
  /** When this quotation was last touched. Latest acceptance wins. */
  updatedAt: Date | string;
}

/**
 * The contract value a project should report, or null when no quotation has
 * been accepted yet.
 *
 * Null is not zero. A project mid-negotiation has an unknown contract value,
 * and saying "zero" would assert the client agreed to nothing.
 */
export function revenueFromQuotations(quotations: AcceptableQuotation[]): number | null {
  const accepted = quotations
    .filter((q) => q.status === "ACCEPTED")
    .map((q) => ({ total: q.total, at: new Date(q.updatedAt).getTime() }))
    .filter((q) => Number.isFinite(q.at));
  if (accepted.length === 0) return null;
  accepted.sort((a, b) => b.at - a.at);
  const total = Number(accepted[0].total);
  return Number.isFinite(total) ? Math.round(Math.max(0, total) * 100) / 100 : null;
}

interface RevenueSyncClient {
  quotation: {
    findMany(args: {
      where: { projectId: string };
      select: { status: true; total: true; updatedAt: true };
    }): Promise<AcceptableQuotation[]>;
  };
  project: {
    findUnique(args: {
      where: { id: string };
      select: { revenue: true };
    }): Promise<{ revenue: number | null } | null>;
    update(args: { where: { id: string }; data: { revenue: number } }): Promise<unknown>;
  };
}

/**
 * Recompute a project's contract value from its quotations and store it.
 * Returns the figure, or null when it was deliberately left alone.
 *
 * Same rule as the budget: never replace a founder's estimate with a false
 * zero. If no quotation has been accepted we do not know the contract value,
 * and an existing figure is better than asserting nothing was agreed. Once a
 * quotation is accepted its total becomes the authority, including if that is
 * lower than the estimate — a renegotiated figure is the real one.
 */
export async function syncProjectRevenue(
  client: RevenueSyncClient,
  projectId: string,
): Promise<number | null> {
  const [quotations, project] = await Promise.all([
    client.quotation.findMany({
      where: { projectId },
      select: { status: true, total: true, updatedAt: true },
    }),
    client.project.findUnique({ where: { id: projectId }, select: { revenue: true } }),
  ]);

  const revenue = revenueFromQuotations(quotations);
  if (revenue === null) {
    // Nothing accepted. Leave whatever is there rather than claim zero.
    return null;
  }
  if (!budgetChanged(project?.revenue, revenue)) return revenue;
  await client.project.update({ where: { id: projectId }, data: { revenue } });
  return revenue;
}
