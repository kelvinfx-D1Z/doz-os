import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRate } from "./rate-card.ts";

// ---- clearing forms -------------------------------------------------------

test("parseRate: undefined means not being changed", () => {
  assert.equal(parseRate(undefined), undefined);
});

test("parseRate: null deliberately clears the rate", () => {
  assert.equal(parseRate(null), null);
});

test("parseRate: an empty string deliberately clears the rate", () => {
  assert.equal(parseRate(""), null);
});

test("parseRate: a whitespace-only string deliberately clears the rate", () => {
  assert.equal(parseRate("   "), null);
  assert.equal(parseRate("\t\n "), null);
});

// ---- 0 is a real price, not "unset" ---------------------------------------

test("parseRate: 0 is a real (complimentary) price, not treated as falsy", () => {
  assert.equal(parseRate(0), 0);
});

test('parseRate: "0" is a real (complimentary) price', () => {
  assert.equal(parseRate("0"), 0);
});

// ---- ordinary real prices ---------------------------------------------------

test("parseRate: a positive finite number is accepted as-is", () => {
  assert.equal(parseRate(150000), 150000);
});

test("parseRate: a numeric string is trimmed and parsed", () => {
  assert.equal(parseRate("  85000  "), 85000);
});

// ---- rejected numeric edge cases -------------------------------------------

test("parseRate: a negative number is rejected", () => {
  assert.equal(parseRate(-1), undefined);
});

test("parseRate: a negative numeric string is rejected", () => {
  assert.equal(parseRate("-1"), undefined);
});

test("parseRate: NaN is rejected", () => {
  assert.equal(parseRate(NaN), undefined);
});

test("parseRate: Infinity is rejected", () => {
  assert.equal(parseRate(Infinity), undefined);
  assert.equal(parseRate(-Infinity), undefined);
});

test("parseRate: a non-numeric string is rejected", () => {
  assert.equal(parseRate("abc"), undefined);
});

// ---- wrong types, rejected before any Number() coercion --------------------
//
// Number(false) === 0 and Number([]) === 0 — both finite and non-negative.
// A type check that ran after coercion (or a plain `Number(v)` call) would
// let these through as a real, permanent 0 price. parseRate must reject on
// `typeof` before that coercion ever happens.

test("parseRate: a boolean is rejected, not coerced into 0", () => {
  assert.equal(parseRate(false), undefined);
  assert.equal(parseRate(true), undefined);
});

test("parseRate: an array is rejected, not coerced into 0", () => {
  assert.equal(parseRate([]), undefined);
  assert.equal(parseRate([1, 2]), undefined);
});

test("parseRate: a plain object is rejected", () => {
  assert.equal(parseRate({}), undefined);
});
