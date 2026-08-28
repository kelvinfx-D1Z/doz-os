import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKUP,
  markupFor,
  suggestOfficialPrice,
  lineTotal,
  baseTotal,
  officialTotal,
  marginFor,
  unpricedLines,
  isFullyPriced,
  type PricedLine,
} from "./pricing.ts";

function line(over: Partial<PricedLine> = {}): PricedLine {
  return { section: "Audiovisual", quantity: 1, days: 1, unitPrice: 100_000, clientPrice: null, ...over };
}

// ---- markupFor ----------------------------------------------------------

test("markups follow the founder's own category table, not the old guesses", () => {
  // Equipment 25-40% -> midpoint 1.35
  assert.equal(markupFor("Audiovisual & Technical Production"), 1.35);
  assert.equal(markupFor("EQUIPMENT RENTAL"), 1.35);
  // Crew / personnel / production management 30-50% -> 1.40
  assert.equal(markupFor("Personnel"), 1.4);
  assert.equal(markupFor("Production Management"), 1.4);
  // Branding materials and printing 20-30% -> 1.25
  assert.equal(markupFor("Event Branding & Signage"), 1.25);
  assert.equal(markupFor("Branding & Print"), 1.25);
  // Fabrication and exhibition stands 25-40% -> 1.35
  assert.equal(markupFor("Stage & Scenic Fabrication"), 1.35);
  assert.equal(markupFor("Trade Show Exhibition & Booth Construction"), 1.35);
  // Logistics 20-30% -> 1.25
  assert.equal(markupFor("Logistics & Welfare"), 1.25);
  // Post, motion graphics, colour grading, creative 40-60%+ -> 1.50
  assert.equal(markupFor("Post-Production"), 1.5);
  assert.equal(markupFor("Motion Graphics"), 1.5);
  assert.equal(markupFor("Colour Grading"), 1.5);
});

test("the old 3.5x fabrication default is gone — it overpriced a stage threefold", () => {
  // The founder's rate card puts a 390,000 stage at 500,000, not 1,365,000.
  const suggested = suggestOfficialPrice(390_000, "Stage & Scenic Fabrication");
  assert.ok(suggested < 600_000, `expected near the rate card's 500,000, got ${suggested}`);
});

test("no section marks up more than 1.5x by default", () => {
  const sections = [
    "Displays", "Cameras & Capture", "Sound", "Lighting", "Streaming & Broadcast",
    "Stage & Scenic Fabrication", "Branding & Print", "Furniture", "Personnel",
    "Logistics & Welfare", "Post-Production", "Motion Graphics", "Colour Grading",
    "Trade Show Exhibition & Booth Construction", "Something we have never sold",
  ];
  for (const s of sections) {
    assert.ok(markupFor(s) <= 1.5, `${s} marks up at ${markupFor(s)}`);
    assert.ok(markupFor(s) >= 1.25, `${s} marks up at ${markupFor(s)}`);
  }
});

test("all six real D1Z departments map to their expected markup", () => {
  assert.equal(markupFor("Audiovisual & Technical Production"), 1.35);
  assert.equal(markupFor("Scenic Design & Stage Production"), 1.35);
  assert.equal(markupFor("Trade Show Exhibition & Booth Construction"), 1.35);
  assert.equal(markupFor("Event Branding & Signage"), 1.25);
  assert.equal(markupFor("Event Technology & Registration"), 1.35);
  assert.equal(markupFor("Operations, Logistics & Management"), 1.25);
});

test("an unknown or empty section falls back to the default rather than throwing", () => {
  assert.equal(markupFor("Something we have never sold"), DEFAULT_MARKUP);
  assert.equal(markupFor(null), DEFAULT_MARKUP);
  assert.equal(markupFor(""), DEFAULT_MARKUP);
});

test("section matching ignores case and surrounding words", () => {
  assert.equal(markupFor("  personnel  "), 1.4);
  assert.equal(markupFor("Stage Fabrication & Build"), 1.35);
});

test("a section matching two rules takes the higher markup", () => {
  // On the founder's own table, crew/personnel (1.40) sits slightly above
  // fabrication (1.35) — "Stage Fabrication & Crew" carries both a
  // fabrication word ("stage", "fabricat") and a personnel word ("crew"),
  // and highest-wins now resolves it to 1.40, not 1.35. That is exactly the
  // top of fabrication's own 25-40% band and the middle of crew's 30-50%
  // band: defensible under either reading, and it errs high, which is the
  // safe direction — a quote can be discounted, but one already sent cannot
  // be un-underpriced. This guards the scoring MECHANISM (every rule is
  // scored and the numerically highest wins, so the array's order can never
  // decide the price) rather than any fixed "fabrication beats personnel"
  // rank order, which the founder's own rates no longer support.
  assert.equal(markupFor("Stage Fabrication & Crew"), 1.4);
  // Both keywords here sit in the same 1.25 rule, so the result is
  // unambiguous regardless of which keyword is checked first.
  assert.equal(markupFor("Branding & Logistics"), 1.25);
  // Carries both "fabricat" (1.35) and the "production management" phrase
  // (1.40) — the higher of the two wins.
  assert.equal(markupFor("Fabrication & Production Management"), 1.4);
});

test("pure personnel sections mark up at 1.4x — the highest-rule wins does not sweep them up", () => {
  assert.equal(markupFor("Production Personnel"), 1.4);
  assert.equal(markupFor("Crew"), 1.4);
  assert.equal(markupFor("Labour"), 1.4);
});

test("booth and exhibition-stand fabrication now marks up as fabrication, matching the founder's table", () => {
  // Unlike the old table, "booth" and "exhibit" are fabrication keywords —
  // the founder's rate card does not carve out a separate rental tier for
  // them, so a plain rental line now marks up at the same 1.35x as real
  // exhibition carpentry.
  assert.equal(markupFor("Photo Booth Rental"), 1.35);
  assert.equal(markupFor("Exhibition Space Rental"), 1.35);
  assert.equal(markupFor("Trade Show Exhibition & Booth Construction"), 1.35);
  assert.equal(markupFor("Exhibition Stands"), 1.35);
  assert.equal(markupFor("Booth Fabrication"), 1.35);
});

// ---- suggestOfficialPrice ------------------------------------------------

test("suggested price applies the section markup to the cost", () => {
  assert.equal(suggestOfficialPrice(30_000, "Personnel"), 42_000);
  assert.equal(suggestOfficialPrice(150_000, "Audiovisual"), 202_500);
});

test("a zero cost suggests zero, not a markup of nothing", () => {
  assert.equal(suggestOfficialPrice(0, "Personnel"), 0);
});

test("a negative or invalid cost is floored at zero", () => {
  assert.equal(suggestOfficialPrice(-5, "Personnel"), 0);
});

test("the suggestion is rounded to kobo, not left as a binary-float tail", () => {
  // 10_001 * 1.4 === 14001.399999999999636 in IEEE-754. That value prefilled
  // the founder's input, was stored as clientPrice and stringified onto a document.
  assert.equal(suggestOfficialPrice(10_001, "Personnel"), 14_001.4);
  assert.equal(suggestOfficialPrice(0.145, "Personnel"), 0.2);
  // A whole-naira suggestion is unchanged by the rounding.
  assert.equal(suggestOfficialPrice(250_000, "Audiovisual"), 337_500);
  for (const cost of [1, 7, 33, 10_001, 123_457, 999_999]) {
    for (const section of ["Personnel", "Audiovisual", "Stage Fabrication"]) {
      const v = suggestOfficialPrice(cost, section);
      assert.equal(v, Math.round(v * 100) / 100, `${cost} @ ${section} kept a float tail`);
    }
  }
});

// ---- lineTotal ------------------------------------------------------------

test("lineTotal multiplies quantity, days and price", () => {
  assert.equal(lineTotal({ quantity: 2, days: 3, price: 250_000 }), 1_500_000);
});

test("lineTotal treats a missing day count as one day, never zero", () => {
  assert.equal(lineTotal({ quantity: 2, days: 0, price: 250_000 }), 500_000);
});

test("a complimentary line totals zero", () => {
  assert.equal(lineTotal({ quantity: 4, days: 3, price: 0 }), 0);
});

// ---- totals -----------------------------------------------------------

test("baseTotal sums the cost side using days", () => {
  const lines = [
    line({ quantity: 6, days: 1, unitPrice: 30_000 }),
    line({ quantity: 1, days: 3, unitPrice: 250_000 }),
  ];
  assert.equal(baseTotal(lines), 180_000 + 750_000);
});

test("officialTotal ignores lines that have no client price yet", () => {
  const lines = [
    line({ quantity: 1, days: 1, unitPrice: 100_000, clientPrice: 200_000 }),
    line({ quantity: 1, days: 1, unitPrice: 50_000, clientPrice: null }),
  ];
  assert.equal(officialTotal(lines), 200_000);
  assert.equal(baseTotal(lines), 150_000);
});

test("a client price of zero is a real price, not an absent one", () => {
  const lines = [line({ clientPrice: 0 })];
  assert.equal(unpricedLines(lines), 0);
  assert.equal(isFullyPriced(lines), true);
  assert.equal(officialTotal(lines), 0);
});

// ---- margin -------------------------------------------------------------

test("margin is profit over the official price, not over cost", () => {
  const m = marginFor(5_122_800, 12_190_177.5);
  assert.equal(Math.round(m.profit), 7_067_378);
  assert.ok(m.percent > 57 && m.percent < 58);
});

test("margin of a job with no official price is zero, not NaN", () => {
  const m = marginFor(500_000, 0);
  assert.equal(m.profit, -500_000);
  assert.equal(m.percent, 0);
});

test("a job priced below cost reports a negative margin rather than hiding it", () => {
  const m = marginFor(1_000_000, 800_000);
  assert.equal(m.profit, -200_000);
  assert.ok(m.percent < 0);
});

// ---- unpriced counting --------------------------------------------------

test("unpricedLines counts only nulls", () => {
  const lines = [line({ clientPrice: 1 }), line({ clientPrice: null }), line({ clientPrice: null })];
  assert.equal(unpricedLines(lines), 2);
  assert.equal(isFullyPriced(lines), false);
});

test("an empty sheet is not 'fully priced' — there is nothing to sell", () => {
  assert.equal(isFullyPriced([]), false);
});
