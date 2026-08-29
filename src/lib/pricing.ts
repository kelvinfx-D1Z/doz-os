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

// ============================================================
// Rate-card resolution — shared by GET and POST convert in
// src/app/api/doz/projects/pricing/route.ts, so one rule decides what a
// published CP is for a given (serviceName, category) pair rather than two
// routes maintaining separate (and driftable) copies of it.
//
// ProjectService.serviceName/category are plain text, entered by a human
// (typed or picked from the catalogue, which then copies the words in — see
// the "safety property" comment in services/route.ts). Matching against
// ServiceItem.name/ServiceCategory.name is therefore case-insensitive and
// ignores leading/trailing whitespace, but nothing fuzzier than that: a
// near-miss falls back to MARKUP rather than guessing, because a wrong match
// would price a line off some other service's rate — worse than the formula.
// ============================================================

export type RateCardEntry = {
  name: string;
  category: string;
  standardClientRate: number | null | undefined;
};

/** Case/whitespace-insensitive key a ProjectService line and a ServiceItem are matched on. */
export function rateKey(name: string, category: string): string {
  return `${name.trim().toLowerCase()}|${category.trim().toLowerCase()}`;
}

/**
 * Indexes a rate card into (name, category) -> the set of distinct published
 * rates seen for that key.
 *
 * ServiceItem carries no DB-level uniqueness on (categoryId, name), and
 * add_custom_item (unlike the founder-only catalogue_add_item) never checks
 * for a duplicate before creating one — so two rows can share a
 * (name, category) pair. Keeping every distinct rate (not just the last row
 * read) is what lets resolvePublishedRate below apply the duplicate rule
 * deterministically instead of depending on row order.
 *
 * A published rate of 0 is a deliberate complimentary price (see
 * src/lib/rate-card.ts), not an absent one — checking !== null &&
 * !== undefined (never truthiness) is what keeps a real free line from being
 * quietly dropped and marked up to a formula price.
 */
export function buildRateCardIndex(items: RateCardEntry[]): Map<string, Set<number>> {
  const byKey = new Map<string, Set<number>>();
  for (const item of items) {
    if (item.standardClientRate === null || item.standardClientRate === undefined) continue;
    const key = rateKey(item.name, item.category);
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(item.standardClientRate);
  }
  return byKey;
}

/**
 * Resolves the one published rate for (serviceName, category), or undefined
 * if there is no unambiguous published rate to use. Resolved deterministically,
 * by intent:
 *   - no candidate for this key has a published (non-null) rate -> undefined
 *     (fall back to MARKUP)
 *   - every candidate that HAS one agrees on the same rate -> that rate,
 *     however many rows say so — there is no real ambiguity
 *   - candidates disagree (two different published rates) -> undefined
 *     (fall back to MARKUP); choosing between two conflicting published
 *     prices is guessing, and a near-miss must fall back rather than guess
 *     (same rule as the name/category match above).
 */
export function resolvePublishedRate(
  index: Map<string, Set<number>>,
  serviceName: string,
  category: string,
): number | undefined {
  const candidates = index.get(rateKey(serviceName, category));
  return candidates !== undefined && candidates.size === 1 ? [...candidates][0] : undefined;
}

export type SuggestedPrice = { suggested: number; source: "RATE_CARD" | "MARKUP" };

/**
 * GET's starting point for a line: the published CP if there is an
 * unambiguous one, otherwise the section-markup formula. A starting point
 * only — never written unless the founder confirms it.
 */
export function suggestPrice(
  index: Map<string, Set<number>>,
  line: { serviceName: string; category: string; unitPrice: number },
): SuggestedPrice {
  const published = resolvePublishedRate(index, line.serviceName, line.category);
  if (published !== undefined) return { suggested: published, source: "RATE_CARD" };
  return { suggested: suggestOfficialPrice(line.unitPrice, line.category), source: "MARKUP" };
}

/**
 * POST convert's price for a line, in priority order:
 *   1. An explicit price the founder typed wins — including a deliberate 0.
 *   2. Otherwise the published CP, if there is an unambiguous one —
 *      including a published 0 (see buildRateCardIndex above).
 *   3. Otherwise the section-markup formula.
 *
 * This is the same rate the GET above already showed the founder as
 * "Rate card ₦X" on the panel he priced from — a line he cleared, or one
 * added to the sheet after the panel loaded, must fall back to what his own
 * screen just quoted him, not silently to the formula alone.
 */
export function resolveConvertPrice(
  explicit: number | null | undefined,
  index: Map<string, Set<number>>,
  line: { serviceName: string; category: string; unitPrice: number },
): number {
  if (explicit !== null && explicit !== undefined) return explicit;
  const published = resolvePublishedRate(index, line.serviceName, line.category);
  if (published !== undefined) return published;
  return suggestOfficialPrice(line.unitPrice, line.category);
}
