// ============================================================
// EXTRAPOLATING A BUDGET FROM A QUOTATION
//
// The founder does not always start from a budget. In his words: "Sometimes
// the founder skips the budget phase and goes straight to the quotation stage,
// because he is the one creating the project... when he is done, the budget
// should be extrapolated from the cost list."
//
// So a quotation priced at CP is turned back into a cost sheet by looking up
// what each quoted line COSTS us — its BP on the rate card. He gets a budget,
// and therefore a margin, without building the sheet by hand.
//
// WHAT THIS IS NOT
// It does not derive cost from price by dividing out the markup. That would
// invent a number: the markup is a suggestion the founder argues with, not a
// fact about what a vendor charges. Only a published BP is used, and a line
// with none is carried through uncosted rather than guessed at.
//
// THE UNCOSTED LINE
// ProjectService.unitPrice is `Float @default(0)` and cannot hold "unknown",
// so a line with no published BP arrives at 0 — the same state every existing
// cost sheet in production is already in. That is honest here only because the
// result reports how many lines got a real cost, so the founder is told what
// he still has to price rather than being handed a total that quietly omits
// half the job. A silent partial budget would be worse than none.
// ============================================================

import { resolvePublishedRate, lineTotal } from "./pricing.ts";

export interface QuotedLine {
  /** The catalogue service name, as it appears on the quotation. */
  description: string;
  /** The department. Matched with the name, exactly as the rate card is. */
  section: string | null;
  quantity: number;
  days: number;
}

export interface ExtrapolatedCostLine {
  serviceName: string;
  category: string;
  quantity: number;
  days: number;
  /** BP from the rate card, or 0 when the catalogue does not price it. */
  unitPrice: number;
  totalPrice: number;
  /** False when this line still needs a real cost from the founder. */
  costed: boolean;
}

export interface Extrapolation {
  lines: ExtrapolatedCostLine[];
  /** How many lines came back with a published cost. */
  costed: number;
  /** Lines the rate card could not price, by name, for reporting. */
  uncosted: string[];
  /** Sum of the costed lines. Never a claim about the uncosted ones. */
  total: number;
}

/**
 * Turn quoted lines into cost lines using published BPs.
 *
 * `costIndex` comes from `buildCostIndex` — the same keying and duplicate rule
 * the client-rate lookup uses, so a job's cost and its price always agree
 * about which catalogue row they matched.
 */
export function extrapolateBudget(
  quoted: QuotedLine[],
  costIndex: Map<string, Set<number>>,
): Extrapolation {
  const lines: ExtrapolatedCostLine[] = [];
  const uncosted: string[] = [];
  let costed = 0;
  let total = 0;

  for (const q of quoted) {
    const name = (q.description ?? "").trim();
    if (!name) continue; // a blank line describes no work
    const category = (q.section ?? "").trim();
    const bp = category ? resolvePublishedRate(costIndex, name, category) : undefined;

    // undefined means unpriced, or two catalogue rows disagreeing. A published
    // 0 is a real cost — something we genuinely get for nothing — and counts
    // as costed.
    const known = bp !== undefined;
    const unitPrice = known ? bp : 0;
    const quantity = Math.max(0, Math.trunc(Number(q.quantity) || 0));
    const days = Math.max(1, Math.trunc(Number(q.days) || 1));
    const totalPrice = lineTotal({ quantity, days, price: unitPrice });

    if (known) {
      costed++;
      total += totalPrice;
    } else {
      uncosted.push(name);
    }

    lines.push({
      serviceName: name,
      category: category || "Other",
      quantity,
      days,
      unitPrice,
      totalPrice,
      costed: known,
    });
  }

  return { lines, costed, uncosted, total: Math.round(total * 100) / 100 };
}

/**
 * A one-line summary for the founder. Says plainly what was priced and what
 * still needs him, because a budget that looks complete but is half-empty is
 * the failure mode worth designing against.
 */
export function describeExtrapolation(result: Extrapolation): string {
  const n = result.lines.length;
  if (n === 0) return "Nothing to cost — this quotation has no lines.";
  if (result.costed === 0) {
    return `${n} line${n === 1 ? "" : "s"} added, none priced — the rate card has no cost for any of them yet.`;
  }
  if (result.uncosted.length === 0) {
    return `${n} line${n === 1 ? "" : "s"} costed from the rate card.`;
  }
  return `${result.costed} of ${n} lines costed. ${result.uncosted.length} still need a cost: ${result.uncosted.slice(0, 3).join(", ")}${result.uncosted.length > 3 ? "…" : ""}`;
}
