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
  buildRateCardIndex,
  resolvePublishedRate,
  suggestPrice,
  resolveConvertPrice,
  type PricedLine,
  type RateCardEntry,
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
  // RULES is ordered [1.5 post, 1.4 personnel, 1.25 branding, 1.35
  // fabrication]. The first three assertions below demonstrate the outcome
  // of an overlap, but none of them distinguish highest-wins from
  // first-match-wins: in each case the higher-valued rule also happens to
  // sit earlier in the array, so a regression back to first-match would
  // still pass all three.
  //
  // "Stage Fabrication & Crew" carries a personnel word ("crew", 1.40) and a
  // fabrication word ("stage"/"fabricat", 1.35); personnel is both higher
  // AND earlier in the array.
  assert.equal(markupFor("Stage Fabrication & Crew"), 1.4);
  // Both keywords here sit in the same 1.25 rule, so the result is
  // unambiguous regardless of which keyword is checked first.
  assert.equal(markupFor("Branding & Logistics"), 1.25);
  // Carries both "fabricat" (1.35) and the "production management" phrase
  // (1.40); personnel is again higher AND earlier.
  assert.equal(markupFor("Fabrication & Production Management"), 1.4);
  //
  // This next case is the actual regression guard. "branding" (1.25) sits
  // BEFORE "fabricat" (1.35) in the array, so it is the one input in this
  // table where first-match and highest-match disagree: first-match would
  // stop at branding and return 1.25, highest-match correctly returns 1.35.
  // If markupFor is ever reverted to first-match-wins, this is the
  // assertion that fails.
  assert.equal(markupFor("BRANDING (FABRICATION + PRINTING)"), 1.35);
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

// ---- rate-card resolution -------------------------------------------------
//
// The branch's most business-critical new arithmetic: what GET suggests and
// what POST convert falls back to must be decided by exactly one rule. See
// resolveConvertPrice's doc comment for why an explicit price beats the
// published rate, which beats the markup formula.

function rateCardEntry(over: Partial<RateCardEntry> = {}): RateCardEntry {
  return { name: "Livestreaming", category: "Streaming & Broadcast", standardClientRate: 150_000, ...over };
}

function svcLine(over: { serviceName?: string; category?: string; unitPrice?: number } = {}) {
  return { serviceName: "Livestreaming", category: "Streaming & Broadcast", unitPrice: 70_000, ...over };
}

test("a single published rate wins over the markup formula", () => {
  const index = buildRateCardIndex([rateCardEntry()]);
  assert.equal(resolvePublishedRate(index, "Livestreaming", "Streaming & Broadcast"), 150_000);
  const { suggested, source } = suggestPrice(index, svcLine());
  assert.equal(suggested, 150_000);
  assert.equal(source, "RATE_CARD");
});

test("a published rate of 0 wins over the formula — it is a real complimentary price", () => {
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: 0 })]);
  const { suggested, source } = suggestPrice(index, svcLine());
  assert.equal(suggested, 0);
  assert.equal(source, "RATE_CARD");
});

test("no candidate for the key falls back to the markup formula", () => {
  const index = buildRateCardIndex([rateCardEntry({ name: "Some Other Service" })]);
  assert.equal(resolvePublishedRate(index, "Livestreaming", "Streaming & Broadcast"), undefined);
  const { suggested, source } = suggestPrice(index, svcLine());
  assert.equal(suggested, suggestOfficialPrice(70_000, "Streaming & Broadcast"));
  assert.equal(source, "MARKUP");
});

test("a rate published as null (unpriced) is not a candidate — falls back to the formula", () => {
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: null })]);
  const { source } = suggestPrice(index, svcLine());
  assert.equal(source, "MARKUP");
});

test("two duplicate catalogue rows agreeing on the same rate resolve to that rate", () => {
  const index = buildRateCardIndex([
    rateCardEntry({ standardClientRate: 150_000 }),
    rateCardEntry({ standardClientRate: 150_000 }),
  ]);
  const { suggested, source } = suggestPrice(index, svcLine());
  assert.equal(suggested, 150_000);
  assert.equal(source, "RATE_CARD");
});

test("two duplicate catalogue rows with DIFFERENT rates fall back to the formula — no guessing", () => {
  const index = buildRateCardIndex([
    rateCardEntry({ standardClientRate: 150_000 }),
    rateCardEntry({ standardClientRate: 175_000 }),
  ]);
  assert.equal(resolvePublishedRate(index, "Livestreaming", "Streaming & Broadcast"), undefined);
  const { suggested, source } = suggestPrice(index, svcLine());
  assert.equal(suggested, suggestOfficialPrice(70_000, "Streaming & Broadcast"));
  assert.equal(source, "MARKUP");
});

test("matching ignores case and surrounding whitespace on both name and category", () => {
  const index = buildRateCardIndex([rateCardEntry({ name: "  LIVESTREAMING  ", category: "streaming & broadcast" })]);
  assert.equal(resolvePublishedRate(index, "Livestreaming", "Streaming & Broadcast"), 150_000);
});

test("resolveConvertPrice: an explicit founder price wins over a published rate", () => {
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: 150_000 })]);
  assert.equal(resolveConvertPrice(94_500, index, svcLine()), 94_500);
});

test("resolveConvertPrice: an explicit founder price of 0 wins — a real complimentary override", () => {
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: 150_000 })]);
  assert.equal(resolveConvertPrice(0, index, svcLine()), 0);
});

test("resolveConvertPrice: no explicit price falls back to the published rate — the bug this closes", () => {
  // The concrete failure this guards: a line the founder cleared, or one
  // added to the sheet after the panel loaded, has no entry in `prices` —
  // POST must fall back to the SAME rate card GET already showed as
  // "Rate card ₦150,000", not silently to the 70,000 x 1.35 formula alone.
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: 150_000 })]);
  assert.equal(resolveConvertPrice(null, index, svcLine()), 150_000);
  assert.equal(resolveConvertPrice(undefined, index, svcLine()), 150_000);
});

test("resolveConvertPrice: a published rate of 0, with no explicit price, still wins over the formula", () => {
  const index = buildRateCardIndex([rateCardEntry({ standardClientRate: 0 })]);
  assert.equal(resolveConvertPrice(null, index, svcLine()), 0);
});

test("resolveConvertPrice: no candidate and no explicit price falls back to the markup formula", () => {
  const index = buildRateCardIndex([]);
  assert.equal(resolveConvertPrice(null, index, svcLine()), suggestOfficialPrice(70_000, "Streaming & Broadcast"));
});
