import test from "node:test";
import assert from "node:assert/strict";
import { extrapolateBudget, describeExtrapolation } from "./budget-extrapolation.ts";
import { buildCostIndex } from "./pricing.ts";

const CARD = buildCostIndex([
  { name: "LED screen (3m x 2m)", category: "Displays", standardCost: 150_000 },
  { name: "Standard event sound", category: "Sound", standardCost: 250_000 },
  { name: "Comp screen", category: "Displays", standardCost: 0 },
  { name: "Backdrop branding", category: "Branding & Print", standardCost: null },
]);

const q = (description: string, section: string | null, quantity = 1, days = 1) => ({
  description, section, quantity, days,
});

test("a quoted line is costed from the rate card's BP", () => {
  const r = extrapolateBudget([q("LED screen (3m x 2m)", "Displays", 2, 3)], CARD);
  assert.equal(r.lines[0].unitPrice, 150_000);
  assert.equal(r.lines[0].totalPrice, 900_000, "quantity x days x BP");
  assert.equal(r.costed, 1);
  assert.equal(r.total, 900_000);
});

test("cost is looked up, never derived by dividing out the markup", () => {
  // The markup is a suggestion the founder argues with, not a fact about what
  // a vendor charges. A line quoted at CP must not imply a cost.
  const r = extrapolateBudget([q("Standard event sound", "Sound", 1, 3)], CARD);
  assert.equal(r.lines[0].unitPrice, 250_000, "the published BP, not price/markup");
});

test("a line the rate card cannot price is carried through uncosted, not guessed", () => {
  const r = extrapolateBudget([q("Bespoke pyrotechnics", "Displays")], CARD);
  assert.equal(r.lines[0].unitPrice, 0);
  assert.equal(r.lines[0].costed, false);
  assert.equal(r.costed, 0);
  assert.deepEqual(r.uncosted, ["Bespoke pyrotechnics"]);
  assert.equal(r.total, 0, "the total never claims a cost for an unpriced line");
});

test("a null BP is unpriced, not free", () => {
  const r = extrapolateBudget([q("Backdrop branding", "Branding & Print")], CARD);
  assert.equal(r.lines[0].costed, false);
  assert.deepEqual(r.uncosted, ["Backdrop branding"]);
});

test("a published BP of 0 IS a cost — something we get for nothing", () => {
  // The distinction this codebase lives by. Null means we do not know; 0 means
  // it costs us nothing, and that is a fact worth recording.
  const r = extrapolateBudget([q("Comp screen", "Displays", 2, 2)], CARD);
  assert.equal(r.lines[0].unitPrice, 0);
  assert.equal(r.lines[0].costed, true, "0 is costed, unlike an absent rate");
  assert.equal(r.costed, 1);
  assert.deepEqual(r.uncosted, []);
});

test("the total counts only what is actually costed", () => {
  const r = extrapolateBudget(
    [q("LED screen (3m x 2m)", "Displays", 1, 1), q("Bespoke pyrotechnics", "Displays", 1, 1)],
    CARD,
  );
  assert.equal(r.lines.length, 2);
  assert.equal(r.total, 150_000, "the unpriced line adds nothing rather than 0 pretending to be a cost");
  assert.equal(r.costed, 1);
});

test("matching ignores case and surrounding whitespace, as the rate card does", () => {
  const r = extrapolateBudget([q("  led SCREEN (3m x 2m) ", "  displays ")], CARD);
  assert.equal(r.lines[0].unitPrice, 150_000);
  assert.equal(r.lines[0].serviceName, "led SCREEN (3m x 2m)", "the founder's own wording is kept");
});

test("a line with no section cannot match, and is not guessed at by name alone", () => {
  // Pricing a line off some other department's service is worse than leaving
  // it uncosted — the same rule the pricing route follows.
  const r = extrapolateBudget([q("LED screen (3m x 2m)", null)], CARD);
  assert.equal(r.lines[0].costed, false);
  assert.equal(r.lines[0].category, "Other");
});

test("two catalogue rows disagreeing leave the line uncosted", () => {
  const conflicted = buildCostIndex([
    { name: "LED Wall", category: "Displays", standardCost: 150_000 },
    { name: "LED Wall", category: "Displays", standardCost: 200_000 },
  ]);
  const r = extrapolateBudget([q("LED Wall", "Displays")], conflicted);
  assert.equal(r.lines[0].costed, false, "choosing between two published costs is guessing");
});

test("duplicate rows that agree still price the line", () => {
  const agreeing = buildCostIndex([
    { name: "LED Wall", category: "Displays", standardCost: 150_000 },
    { name: "LED Wall", category: "Displays", standardCost: 150_000 },
  ]);
  assert.equal(extrapolateBudget([q("LED Wall", "Displays")], agreeing).lines[0].unitPrice, 150_000);
});

test("days below one count as one, and a blank line is skipped entirely", () => {
  const r = extrapolateBudget(
    [q("LED screen (3m x 2m)", "Displays", 1, 0), q("   ", "Displays")],
    CARD,
  );
  assert.equal(r.lines.length, 1, "a line describing no work is not a cost line");
  assert.equal(r.lines[0].days, 1);
  assert.equal(r.lines[0].totalPrice, 150_000);
});

test("the summary tells the founder what still needs pricing", () => {
  const partial = extrapolateBudget(
    [q("LED screen (3m x 2m)", "Displays"), q("Bespoke pyrotechnics", "Displays")],
    CARD,
  );
  const msg = describeExtrapolation(partial);
  assert.match(msg, /1 of 2/);
  assert.match(msg, /Bespoke pyrotechnics/);

  const none = extrapolateBudget([q("Unknown thing", "Displays")], CARD);
  assert.match(describeExtrapolation(none), /none priced/);

  const all = extrapolateBudget([q("LED screen (3m x 2m)", "Displays")], CARD);
  assert.match(describeExtrapolation(all), /1 line costed/);

  assert.match(describeExtrapolation(extrapolateBudget([], CARD)), /Nothing to cost/);
});
