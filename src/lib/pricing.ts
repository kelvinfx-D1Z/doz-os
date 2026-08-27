// ============================================================
// BASE PRICE -> OFFICIAL PRICE (pure, no DB)
//
// BP is what a job COSTS D1Z — vendor hire, crew day rates, transport.
// The production manager builds it. OP is what the CLIENT is charged; only
// the founder ever sees or sets it.
//
// The markups below are starting points to argue with, not a formula. They
// come from D1Z's own invoices: a videographer costs 30,000/day and bills at
// 40,000 (1.33x), while fabrication and branding carry far more risk, waste
// and workmanship and mark up several times over.
// ============================================================

import { MONEY_EPSILON } from "./received-allocation.ts";

/** Applied to any section we do not recognise. */
export const DEFAULT_MARKUP = 2.0;

/**
 * Sections are free text typed by whoever built the sheet ("PERSONNEL",
 * "Operations, Logistics & Management", "BRANDING (FABRICATION + PRINTING)"),
 * so match on keywords rather than exact names. Order matters: the first
 * matching rule wins.
 */
const RULES: { markup: number; keywords: string[] }[] = [
  { markup: 1.3, keywords: ["personnel", "crew", "staff", "operations", "logistics", "management", "labour", "labor"] },
  { markup: 3.5, keywords: ["fabricat", "scenic", "stage", "branding", "signage", "print", "build", "carpentry", "decor", "construction", "booth", "exhibit"] },
];

function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function markupFor(section: string | null | undefined): number {
  const s = (section ?? "").trim().toLowerCase();
  if (!s) return DEFAULT_MARKUP;
  for (const rule of RULES) {
    if (rule.keywords.some((k) => s.includes(k))) return rule.markup;
  }
  return DEFAULT_MARKUP;
}

/** The founder's starting point for a line's client price. Never a floor or a cap. */
export function suggestOfficialPrice(basePrice: number, section: string | null | undefined): number {
  const cost = Math.max(0, safe(basePrice));
  return cost * markupFor(section);
}

/**
 * quantity x days x price.
 *
 * Days defaults to 1 rather than 0: a line with no day count is a one-off
 * (a fabricated backdrop), not a line worth nothing. The existing services
 * GET omitted `days` entirely, which silently understated every per-day line
 * on a multi-day job.
 */
export function lineTotal(l: { quantity: number; days: number; price: number }): number {
  const q = Math.max(0, safe(l.quantity));
  const d = Math.max(1, safe(l.days));
  return q * d * Math.max(0, safe(l.price));
}

export type PricedLine = {
  section: string | null;
  quantity: number;
  days: number;
  /** BP — cost per unit per day. */
  unitPrice: number;
  /** OP — client price per unit per day. Null means not yet priced. */
  clientPrice: number | null;
};

export function baseTotal(lines: PricedLine[]): number {
  return lines.reduce((s, l) => s + lineTotal({ quantity: l.quantity, days: l.days, price: l.unitPrice }), 0);
}

/** Unpriced lines contribute nothing — they are not yet part of what we charge. */
export function officialTotal(lines: PricedLine[]): number {
  return lines.reduce(
    (s, l) => (l.clientPrice === null ? s : s + lineTotal({ quantity: l.quantity, days: l.days, price: l.clientPrice })),
    0,
  );
}

export type Margin = { profit: number; percent: number };

/** Margin is profit as a share of the OFFICIAL price, which is how the trade quotes it. */
export function marginFor(base: number, official: number): Margin {
  const b = safe(base);
  const o = safe(official);
  const profit = o - b;
  return { profit, percent: o > MONEY_EPSILON ? (profit / o) * 100 : 0 };
}

/** A clientPrice of 0 is a deliberate complimentary line, NOT an absent price. */
export function unpricedLines(lines: PricedLine[]): number {
  return lines.filter((l) => l.clientPrice === null).length;
}

export function isFullyPriced(lines: PricedLine[]): boolean {
  return lines.length > 0 && unpricedLines(lines) === 0;
}
