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
 */
export function applyGrossUp(
  lines: DocumentLineInput[],
  targetNet: number,
  whtRate: number,
): { lines: DocumentLineInput[]; grossUpRate: number } {
  const base = sumLines(lines);
  if (base <= 0 || targetNet <= 0) return { lines, grossUpRate: 0 };
  const wanted = grossUpSubtotal(targetNet, whtRate);
  const factor = wanted / base;
  return {
    lines: lines.map((l) => ({
      ...l,
      unitPrice: roundToNearest(l.unitPrice * factor, 100),
    })),
    grossUpRate: whtRate,
  };
}
