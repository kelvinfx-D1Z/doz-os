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
): Promise<number> {
  const lines = await client.projectService.findMany({
    where: { projectId },
    select: { quantity: true, days: true, unitPrice: true },
  });
  const budget = projectBudgetFrom(lines);
  await client.project.update({ where: { id: projectId }, data: { budget } });
  return budget;
}
