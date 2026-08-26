// ============================================================
// SHARED REQUEST-BODY HANDLING FOR CLIENT DOCUMENT ROUTES
//
// Quotations and invoices both accept the same shape of line-item input and
// both support the founder naming a target net to gross up against. Keeping
// this here — instead of duplicating it inline in each route — means the tax
// and gross-up handling can only drift by editing one file, not by an edit
// landing in one route and not the other.
//
// Free of Prisma and Next.js imports, exactly like document-math.ts, so it
// stays unit-testable without a database or request context.
// ============================================================

import {
  sumLines,
  grossUpSubtotal,
  roundToNearest,
  computeTax,
  VAT_RATE,
  type DocumentLineInput,
} from "./document-math.ts";

export type IncomingLine = {
  section?: string | null;
  description?: string;
  subDescription?: string | null;
  days?: number;
  quantity?: number;
  unitPrice?: number;
};

export function normaliseLines(raw: unknown): DocumentLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 300)
    .map((l: IncomingLine) => ({
      section: typeof l.section === "string" ? l.section.trim() || null : null,
      description: String(l.description ?? "").trim(),
      subDescription:
        typeof l.subDescription === "string" ? l.subDescription.trim() || null : null,
      days: Math.max(1, Math.trunc(Number(l.days) || 1)),
      quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)),
      unitPrice: Math.max(0, Number(l.unitPrice) || 0),
    }))
    .filter((l) => l.description.length > 0);
}

/**
 * Applies the gross-up when the founder has named a target net.
 *
 * Scales every unit price by the same factor so the proportions the founder
 * set are preserved, then rounds each to the nearest 100 naira. The caller
 * shows the resulting expected cash next to the target rather than hiding
 * the small rounding difference.
 *
 * `discount` matters because the gross-up scales the SUBTOTAL while the tax
 * base is the subtotal AFTER discount. Ignoring it undershoots the target by
 * `(1 - whtRate/100) x discount` — on a 5% job, 0.95 of every naira discounted.
 * The discount is therefore added back into the subtotal we scale towards, so
 * the money that survives the deduction is the target the founder asked for
 * whether or not a discount is also in play.
 */
export function applyGrossUp(
  lines: DocumentLineInput[],
  targetNet: number,
  whtRate: number,
  discount: number = 0,
): { lines: DocumentLineInput[]; grossUpRate: number } {
  const base = sumLines(lines);
  if (base <= 0 || targetNet <= 0) return { lines, grossUpRate: 0 };
  const wanted = grossUpSubtotal(targetNet, whtRate) + Math.max(0, discount);
  const factor = wanted / base;
  return {
    lines: lines.map((l) => ({
      ...l,
      unitPrice: roundToNearest(l.unitPrice * factor, 100),
    })),
    grossUpRate: whtRate,
  };
}

/**
 * Parses and validates the fields common to quotations and invoices:
 * line items, the optional gross-up against a target net, discount, VAT
 * rate, WHT rate and whether the client withholds VAT at source — then runs
 * `computeTax` once. Both document routes call this and differ only in
 * model, code prefix and status vocabulary, so the tax and gross-up
 * handling cannot drift between them.
 */
export type ParseOptions = {
  /**
   * The company's own VAT registration, from CompanySettings.
   *
   * A business that is not VAT-registered may not charge VAT, so when this is
   * false the rate is forced to 0 at CREATION time. It deliberately does not
   * affect RENDERING: a document already issued keeps printing the VAT it was
   * issued with, because that is what the client was actually billed.
   */
  vatRegistered?: boolean;
};

export function parseDocumentBody(
  body: Record<string, unknown>,
  opts: ParseOptions = {},
):
  | {
      lines: DocumentLineInput[];
      subtotal: number;
      discount: number;
      vatRate: number;
      whtRate: number;
      vatWithheldAtSource: boolean;
      grossUpRate: number;
      targetNet: number | null;
      tax: ReturnType<typeof computeTax>;
    }
  | { error: string } {
  let lines = normaliseLines(body.lines);
  if (lines.length === 0) {
    return { error: "Add at least one line with a description" };
  }

  const whtRate = Math.max(0, Number(body.whtRate) || 0);
  const targetNet = Number(body.targetNet) || 0;
  const discount = Math.max(0, Number(body.discount) || 0);
  let grossUpRate = 0;
  if (targetNet > 0 && whtRate > 0) {
    // The discount is passed in so the gross-up scales towards a subtotal that
    // still hits the target AFTER the discount comes off the tax base.
    const applied = applyGrossUp(lines, targetNet, whtRate, discount);
    lines = applied.lines;
    grossUpRate = applied.grossUpRate;
  }

  const subtotal = sumLines(lines);
  // An unregistered company charges no VAT, whatever the request asked for.
  const vatRate =
    opts.vatRegistered === false
      ? 0
      : body.vatRate === undefined
        ? VAT_RATE
        : Number(body.vatRate) || 0;
  const vatWithheldAtSource = body.vatWithheldAtSource === true;
  const tax = computeTax({ subtotal, discount, vatRate, whtRate, vatWithheldAtSource });

  return {
    lines,
    subtotal,
    discount,
    vatRate,
    whtRate,
    vatWithheldAtSource,
    grossUpRate,
    targetNet: targetNet > 0 ? targetNet : null,
    tax,
  };
}
