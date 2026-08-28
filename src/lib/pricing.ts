// ============================================================
// BASE PRICE -> OFFICIAL PRICE (pure, no DB)
//
// BP is what a job COSTS D1Z — vendor hire, crew day rates, transport.
// The production manager builds it. OP is what the CLIENT is charged; only
// the founder ever sees or sets it.
//
// The markups below are the midpoints of the founder's own published 2026
// rate card, not a formula and not a guess taken from one invoice.
// ============================================================

import { MONEY_EPSILON } from "./received-allocation.ts";

/**
 * Applied to any section we do not recognise. The midpoint of the founder's
 * own equipment-rental band (25-40%).
 */
export const DEFAULT_MARKUP = 1.35;

/**
 * The founder's category table, at the midpoint of each stated range.
 *
 * These replace an earlier guess of 2.0x equipment and 3.5x fabrication, taken
 * from a single invoice where fabrication happened to mark up several times.
 * As a default that was badly wrong: it quoted a 390,000 stage at 1,365,000
 * where the founder's own rate card says 500,000 — a lost job with no
 * explanation. Real cost-to-rate pairs in that card cluster at 1.2x-1.5x.
 *
 * A real section name can still match TWO rules at once — "Stage Fabrication
 * & Crew" carries both a fabrication word ("stage", "fabricat") and a
 * personnel word ("crew"). Every rule is scored and the HIGHEST markup wins,
 * so the order of this array never decides the price. On the founder's own
 * table crew/personnel (30-50%, 1.40) sits slightly above fabrication
 * (25-40%, 1.35) — that is the founder's stated position, not an artefact of
 * this table, so a mixed section like that one now resolves to 1.40, the
 * top of fabrication's own band and the middle of crew's.
 */
const RULES: { markup: number; keywords: string[] }[] = [
  { markup: 1.5, keywords: ["post-production", "post production", "grading", "grade", "motion graphic", "animation", "creative", "consultancy", "editing"] },
  { markup: 1.4, keywords: ["personnel", "crew", "staff", "videographer", "photographer", "production management", "producer", "director", "technician", "operator", "labour", "labor"] },
  { markup: 1.25, keywords: ["branding", "signage", "print", "logistics", "transport", "catering", "welfare"] },
  { markup: 1.35, keywords: ["fabricat", "scenic", "stage", "build", "carpentry", "decor", "construction", "booth", "exhibit", "stand"] },
];

function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function markupFor(section: string | null | undefined): number {
  const s = (section ?? "").trim().toLowerCase();
  if (!s) return DEFAULT_MARKUP;
  let best: number | null = null;
  for (const rule of RULES) {
    if (rule.keywords.some((k) => s.includes(k))) {
      best = best === null ? rule.markup : Math.max(best, rule.markup);
    }
  }
  return best ?? DEFAULT_MARKUP;
}

/**
 * The founder's starting point for a line's client price. Never a floor or a cap.
 *
 * Rounded to kobo: 10,001 x 1.3 is 13001.300000000001 in binary floating point,
 * and this value prefills the founder's input, is stored as clientPrice and is
 * stringified straight into a client document. Twelve decimal places on an
 * invoice line is not a rounding error, it is a typo the founder did not make.
 */
export function suggestOfficialPrice(basePrice: number, section: string | null | undefined): number {
  const cost = Math.max(0, safe(basePrice));
  return Math.round(cost * markupFor(section) * 100) / 100;
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
