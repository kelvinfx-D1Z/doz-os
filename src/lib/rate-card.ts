// ============================================================
// RATE CARD — parsing for ServiceItem.standardCost / standardClientRate
//
// A rate of 0 is a real price — D1Z marks complimentary lines as zero on
// real invoices. Only an explicit `null` — or a value that plainly means
// "nothing here" (an empty or whitespace-only string) — clears a rate.
// Everything else that is not genuinely a non-negative number is rejected
// outright and leaves the existing rate untouched, rather than being
// coerced through `Number()` into an accidental 0. That coercion is
// exactly how a stray space in a text input (`" "`), or a control that
// emits `false` for "not set", would otherwise silently mark a service
// permanently free to the client: `Number(" ")`, `Number(false)` and
// `Number([])` are all `0` — finite and non-negative — so a naive
// `Number(v)` followed by an `isFinite`/`>= 0` check lets every one of
// them through as a real price.
//
// Lives here (not inside the route handler) so it can be imported and
// tested on its own — `clampInt`/`clampMoney` in the services route sit at
// module scope for the same reason.
// ============================================================

/**
 * Parses one incoming rate value (`standardCost` or `standardClientRate`
 * from a request body) into what should be written to the database.
 *
 *   | input                                                        | result                          |
 *   |---------------------------------------------------------------|----------------------------------|
 *   | absent / `undefined`                                          | `undefined` — not being changed |
 *   | `null`                                                         | `null` — deliberately cleared    |
 *   | `""` or a whitespace-only string                               | `null` — deliberately cleared    |
 *   | a finite number `>= 0`, including `0`                          | that number                     |
 *   | a string that trims to a finite number `>= 0`, including `"0"` | that number                     |
 *   | a negative number, `NaN`, `Infinity`, or a non-numeric string  | `undefined` — rejected          |
 *   | a boolean, array, object, or any other type                   | `undefined` — rejected          |
 *
 * The type check runs BEFORE any `Number()` coercion: a boolean or an
 * array is rejected on `typeof` alone, before it can reach a numeric
 * branch and be coerced into a false `0`. No falsy check (`if (!v)` or
 * similar) appears anywhere near the 0 case — that is precisely the
 * "tidy-up" that would break a genuine complimentary (0) price.
 */
export function parseRate(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // not being changed
  if (v === null) return null; // deliberately cleared

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null; // deliberately cleared
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return undefined; // ignore nonsense
    return n;
  }

  // Anything that isn't a number by this point — boolean, array, object,
  // function, symbol, bigint — is rejected here, before Number() gets a
  // chance to coerce it (Number(false) === 0, Number([]) === 0).
  if (typeof v !== "number") return undefined;

  if (!Number.isFinite(v) || v < 0) return undefined; // ignore nonsense
  return v;
}
