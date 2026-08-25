// ============================================================
// CLIENT DOCUMENT MONEY & TAX (pure, no DB)
//
// Nigerian government clients (MDAs) withhold BOTH taxes at source: 7.5% VAT
// and 5% WHT. Neither reaches D1Z.
//
// Two rules drive everything here, and both were wrong before:
//
//  1. expectedCash for a government client is `net - wht`, NOT
//     `total - wht`. The VAT never arrives, so subtracting only the WHT
//     overstates the expected cash by the entire VAT amount and makes every
//     government invoice read as permanently underpaid.
//
//  2. Recovering a 5% deduction needs a 5.26% uplift, because you divide by
//     0.95 rather than multiplying by 1.05. A flat 5% leaves a 0.25%
//     shortfall on every government invoice, forever.
//
// WHT is computed and stored but NEVER rendered on a document: it is the
// payer's deduction, not D1Z's charge. The 5% is absorbed into the prices
// via grossUpSubtotal instead.
// ============================================================

/** Nigerian statutory VAT rate, percent. */
export const VAT_RATE = 7.5;

/** Withholding tax on services for this work, percent. */
export const WHT_RATE = 5;

export type DocumentLineInput = {
  section: string | null;
  description: string;
  subDescription?: string | null;
  days: number;
  quantity: number;
  unitPrice: number;
};

function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * quantity x days x unitPrice. There is exactly one multiplier for days in
 * this codebase and it is here — `ServiceItem.unit` is a label and must never
 * be read as a second one.
 */
export function lineAmount(
  l: Pick<DocumentLineInput, "days" | "quantity" | "unitPrice">,
): number {
  return safe(l.quantity) * safe(l.days) * safe(l.unitPrice);
}

export function sumLines(lines: DocumentLineInput[]): number {
  return lines.reduce((s, l) => s + lineAmount(l), 0);
}

export type Section = {
  section: string;
  lines: DocumentLineInput[];
  total: number;
};

/**
 * Groups lines by section, preserving first-seen order.
 *
 * The Summary and Itemised views of a document both derive from this same
 * line array, so their totals agree by construction. There is never a second
 * set of numbers to drift.
 */
export function groupBySection(lines: DocumentLineInput[]): Section[] {
  const order: string[] = [];
  const byName = new Map<string, DocumentLineInput[]>();
  for (const l of lines) {
    const name = l.section?.trim() || "Other";
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(l);
  }
  return order.map((section) => {
    const group = byName.get(section)!;
    return { section, lines: group, total: sumLines(group) };
  });
}

export type TaxInput = {
  subtotal: number;
  discount?: number;
  vatRate?: number;
  whtRate?: number;
  /** True for government clients, who withhold the VAT as well as the WHT. */
  vatWithheldAtSource?: boolean;
};

export type TaxResult = {
  /** Subtotal after discount — the base for both VAT and WHT. */
  net: number;
  vat: number;
  /** What the document shows as the total. */
  total: number;
  /** Never rendered. Stored for reconciliation only. */
  wht: number;
  /** What will actually land in the bank. */
  expectedCash: number;
};

export function computeTax(input: TaxInput): TaxResult {
  const net = Math.max(0, safe(input.subtotal) - safe(input.discount));
  const vat = net * (safe(input.vatRate ?? VAT_RATE) / 100);
  const wht = net * (safe(input.whtRate) / 100);
  const total = net + vat;
  const expectedCash = input.vatWithheldAtSource
    ? net - wht
    : total - wht;
  return { net, vat, total, wht, expectedCash };
}

/**
 * The multiplier that recovers a deduction of `whtRate` percent.
 *
 * This is 1 / (1 - rate), NOT 1 + rate. For 5% that is 1.0526, not 1.05.
 */
export function grossUpFactor(whtRate: number): number {
  const rate = safe(whtRate);
  if (rate < 0 || rate >= 100) {
    throw new Error(`Gross-up rate must be between 0 and 100, got ${whtRate}`);
  }
  return 1 / (1 - rate / 100);
}

/** The subtotal to invoice so that `targetNet` survives the deduction. */
export function grossUpSubtotal(targetNet: number, whtRate: number): number {
  return safe(targetNet) * grossUpFactor(whtRate);
}

/** Rounds to the nearest `step` naira. A step of 0 or 1 leaves the value alone. */
export function roundToNearest(value: number, step: number): number {
  const v = safe(value);
  const s = safe(step);
  if (s <= 1) return v;
  return Math.round(v / s) * s;
}
