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

test("personnel marks up least — it is people, not kit", () => {
  assert.equal(markupFor("Personnel"), 1.3);
  assert.equal(markupFor("PRODUCTION PERSONNEL"), 1.3);
  assert.equal(markupFor("Operations, Logistics & Management"), 1.3);
});

test("fabrication and scenic mark up hardest", () => {
  assert.equal(markupFor("Scenic Design & Stage Production"), 3.5);
  assert.equal(markupFor("BRANDING (FABRICATION + PRINTING)"), 3.5);
  assert.equal(markupFor("Event Branding & Signage"), 3.5);
});

test("equipment takes the default", () => {
  assert.equal(markupFor("Audiovisual & Technical Production"), 2.0);
  assert.equal(markupFor("EQUIPMENT RENTAL"), 2.0);
});

test("all six real D1Z departments map to their expected markup", () => {
  assert.equal(markupFor("Audiovisual & Technical Production"), 2.0);
  assert.equal(markupFor("Scenic Design & Stage Production"), 3.5);
  assert.equal(markupFor("Trade Show Exhibition & Booth Construction"), 3.5);
  assert.equal(markupFor("Event Branding & Signage"), 3.5);
  assert.equal(markupFor("Event Technology & Registration"), 2.0);
  assert.equal(markupFor("Operations, Logistics & Management"), 1.3);
});

test("an unknown or empty section falls back to the default rather than throwing", () => {
  assert.equal(markupFor("Something we have never sold"), DEFAULT_MARKUP);
  assert.equal(markupFor(null), DEFAULT_MARKUP);
  assert.equal(markupFor(""), DEFAULT_MARKUP);
});

test("section matching ignores case and surrounding words", () => {
  assert.equal(markupFor("  personnel  "), 1.3);
  assert.equal(markupFor("Stage Fabrication & Build"), 3.5);
});

// ---- suggestOfficialPrice ------------------------------------------------

test("suggested price applies the section markup to the cost", () => {
  assert.equal(suggestOfficialPrice(30_000, "Personnel"), 39_000);
  assert.equal(suggestOfficialPrice(150_000, "Audiovisual"), 300_000);
});

test("a zero cost suggests zero, not a markup of nothing", () => {
  assert.equal(suggestOfficialPrice(0, "Personnel"), 0);
});

test("a negative or invalid cost is floored at zero", () => {
  assert.equal(suggestOfficialPrice(-5, "Personnel"), 0);
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
