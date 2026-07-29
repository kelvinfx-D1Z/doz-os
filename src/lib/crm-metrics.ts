// Growth metrics for the CRM module.
//
// Pure functions — no database, no React. The single organising metric is
// contracted revenue: the share of money actually collected that sits under a
// signed recurring agreement. See
// docs/superpowers/specs/2026-07-29-founder-dependent-revenue-design.md

export interface AccountMetricInput {
  id: string;
  /** Money collected from this account — sum(Invoice.amountPaid). */
  revenue: number;
  /** Number of known contacts at the client. */
  contactCount: number;
  /** Has a Contract with isRecurring = true and status = "ACTIVE". */
  hasActiveRecurringContract: boolean;
}

/**
 * Percentage of collected revenue that sits under an active recurring
 * agreement. Weighted by money, not by account count — one retained energy
 * major matters more than five small one-off jobs.
 */
export function contractedRevenuePct(accounts: AccountMetricInput[]): number {
  const total = accounts.reduce((sum, a) => sum + a.revenue, 0);
  if (total <= 0) return 0;
  const contracted = accounts
    .filter((a) => a.hasActiveRecurringContract)
    .reduce((sum, a) => sum + a.revenue, 0);
  return (contracted / total) * 100;
}

/** An account is single-threaded when we know fewer than two people there. */
export function isSingleThreaded(account: { contactCount: number }): boolean {
  return account.contactCount < 2;
}

/**
 * Percentage of accounts where we know two or more people — the client-side
 * key-person risk measure.
 */
export function multiThreadedAccountsPct(accounts: AccountMetricInput[]): number {
  if (accounts.length === 0) return 0;
  const multi = accounts.filter((a) => !isSingleThreaded(a)).length;
  return (multi / accounts.length) * 100;
}
