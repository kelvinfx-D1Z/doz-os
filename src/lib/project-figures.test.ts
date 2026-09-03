import test from "node:test";
import assert from "node:assert/strict";
import { projectBudgetFrom, budgetChanged, hasAnyPrice, revenueFromQuotations } from "./project-figures.ts";

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

// ---- revenue: the accepted quotation's total ----

const quote = (status: string, total: number, updatedAt: string) => ({ status, total, updatedAt });

test("no accepted quotation means the contract value is unknown, not zero", () => {
  // Null, never 0. Zero would assert the client agreed to nothing.
  assert.equal(revenueFromQuotations([]), null);
  assert.equal(revenueFromQuotations([quote("DRAFT", 9_384_105, "2026-09-02")]), null);
  assert.equal(revenueFromQuotations([quote("SENT", 9_384_105, "2026-09-02")]), null);
  assert.equal(revenueFromQuotations([quote("DECLINED", 5_000_000, "2026-09-02")]), null);
  assert.equal(revenueFromQuotations([quote("EXPIRED", 5_000_000, "2026-09-02")]), null);
});

test("an accepted quotation's total becomes the contract value", () => {
  assert.equal(revenueFromQuotations([quote("ACCEPTED", 9_384_105, "2026-09-02")]), 9_384_105);
});

test("RENEGOTIATION: the most recently accepted quotation wins", () => {
  // Triple Helix moved from N12,117,400 to N9,384,105 mid-conversation.
  // Accepting the revised one must re-stamp the project, not be ignored
  // because an earlier one was accepted first.
  const quotes = [
    quote("ACCEPTED", 12_117_400, "2026-08-29T09:18:00Z"),
    quote("ACCEPTED", 9_384_105, "2026-09-02T16:34:00Z"),
  ];
  assert.equal(revenueFromQuotations(quotes), 9_384_105);
  assert.equal(revenueFromQuotations(quotes.slice().reverse()), 9_384_105, "order of the array must not matter");
});

test("a renegotiated figure wins even when it is lower", () => {
  const quotes = [
    quote("ACCEPTED", 20_000_000, "2026-01-01T00:00:00Z"),
    quote("ACCEPTED", 1_000_000, "2026-06-01T00:00:00Z"),
  ];
  assert.equal(revenueFromQuotations(quotes), 1_000_000);
});

test("drafts and declines alongside an acceptance are ignored", () => {
  const quotes = [
    quote("DRAFT", 99_000_000, "2026-09-03T00:00:00Z"),
    quote("DECLINED", 50_000_000, "2026-09-03T00:00:00Z"),
    quote("ACCEPTED", 9_384_105, "2026-09-02T00:00:00Z"),
  ];
  assert.equal(revenueFromQuotations(quotes), 9_384_105);
});

test("a genuinely free accepted job reports zero, not unknown", () => {
  // 0 here is a real agreed figure — the distinction the rest of this
  // codebase lives by. Null means nothing was accepted; 0 means nothing owed.
  assert.equal(revenueFromQuotations([quote("ACCEPTED", 0, "2026-09-02")]), 0);
});

test("an unparseable timestamp does not become the winner", () => {
  const quotes = [
    quote("ACCEPTED", 9_384_105, "2026-09-02T00:00:00Z"),
    quote("ACCEPTED", 999_999_999, "not a date"),
  ];
  assert.equal(revenueFromQuotations(quotes), 9_384_105);
});

test("a negative total cannot become a contract value", () => {
  assert.equal(revenueFromQuotations([quote("ACCEPTED", -500_000, "2026-09-02")]), 0);
});
