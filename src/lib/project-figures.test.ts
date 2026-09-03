import test from "node:test";
import assert from "node:assert/strict";
import { projectBudgetFrom, budgetChanged, hasAnyPrice } from "./project-figures.ts";

const line = (quantity: number, days: number, unitPrice: number) => ({ quantity, days, unitPrice });

test("a project's cost is the sum of its cost sheet", () => {
  // Two LED screens for three days at N150,000, plus one sound system.
  const lines = [line(2, 3, 150_000), line(1, 3, 250_000)];
  assert.equal(projectBudgetFrom(lines), 900_000 + 750_000);
});

test("DAYS ARE PART OF IT — a four-day line is not a one-day line", () => {
  // A stored total that ignored days once underpaid a vendor on a four-day
  // line. quantity x days x unitPrice, always.
  assert.equal(projectBudgetFrom([line(1, 4, 100_000)]), 400_000);
  assert.notEqual(projectBudgetFrom([line(1, 4, 100_000)]), 100_000);
});

test("no lines means it costs nothing yet, not that it is unknown", () => {
  assert.equal(projectBudgetFrom([]), 0);
});

test("a complimentary line at zero contributes zero without breaking the sum", () => {
  // 0 is a real price in this system, not an absent one.
  assert.equal(projectBudgetFrom([line(1, 1, 0), line(2, 2, 50_000)]), 200_000);
});

test("days below one count as one, matching lineTotal", () => {
  // lineTotal floors days at 1 — a line with days 0 is still a day's hire.
  assert.equal(projectBudgetFrom([line(1, 0, 80_000)]), 80_000);
});

test("negative figures cannot pull a project's cost down", () => {
  // lineTotal floors quantity and price at 0, so a bad row contributes
  // nothing rather than subtracting from honest ones.
  assert.equal(projectBudgetFrom([line(-5, 1, 100_000), line(1, 1, 40_000)]), 40_000);
  assert.equal(projectBudgetFrom([line(1, 1, -100_000)]), 0);
});

test("the total is rounded to the kobo so repeated recomputation cannot drift", () => {
  const drifty = projectBudgetFrom([line(3, 1, 10_000.1), line(3, 1, 0.2)]);
  assert.equal(drifty, Math.round(drifty * 100) / 100);
  assert.equal(drifty, 30_000.9);
});

test("the real Triple Helix figure adds up", () => {
  const lines = [
    line(2, 3, 250_000), // LED video walls
    line(1, 3, 330_000), // Standard event sound
    line(3, 3, 50_000),  // Professional camera package
    line(1, 1, 950_000), // Custom stage production
  ];
  assert.equal(projectBudgetFrom(lines), 1_500_000 + 990_000 + 450_000 + 950_000);
});

test("budgetChanged only fires on a real difference", () => {
  assert.equal(budgetChanged(1_000_000, 1_000_000), false);
  assert.equal(budgetChanged(1_000_000, 1_000_001), true);
  assert.equal(budgetChanged(1_000_000, 1_000_000.001), false, "float noise is not a change");
  assert.equal(budgetChanged(1_000_000, 1_000_000.01), true, "a kobo is a change");
});

test("budgetChanged treats an absent stored figure as zero", () => {
  // A project that never had a budget written is not 'unchanged' at 0.
  assert.equal(budgetChanged(null, 0), false);
  assert.equal(budgetChanged(undefined, 0), false);
  assert.equal(budgetChanged(null, 500_000), true);
  assert.equal(budgetChanged(NaN, 250_000), true);
});

test("hasAnyPrice distinguishes an unpriced sheet from a free one", () => {
  assert.equal(hasAnyPrice([]), false);
  assert.equal(hasAnyPrice([line(1, 1, 0), line(2, 3, 0)]), false);
  assert.equal(hasAnyPrice([line(1, 1, 0), line(1, 1, 150_000)]), true);
});
