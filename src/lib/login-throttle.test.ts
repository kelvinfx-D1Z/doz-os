import test from "node:test";
import assert from "node:assert/strict";
import {
  throttleState,
  shouldRecordFailure,
  pruneBefore,
  clientIpFrom,
  normaliseEmail,
  THROTTLE_WINDOW_MS,
  MAX_FAILURES_PER_EMAIL,
  MAX_FAILURES_PER_IP,
} from "./login-throttle.ts";

const NOW = new Date("2026-08-31T12:00:00.000Z").getTime();
const MIN = 60_000;
const EMAIL = "kelvin@d1zmedia.com";
const IP = "102.89.1.7";

const fails = (n: number, over: { email?: string; ip?: string | null; agoMin?: number } = {}) =>
  Array.from({ length: n }, () => ({
    email: over.email ?? EMAIL,
    ip: over.ip === undefined ? IP : over.ip,
    createdAt: new Date(NOW - (over.agoMin ?? 1) * MIN),
  }));

test("a clean slate is not locked", () => {
  assert.deepEqual(throttleState([], EMAIL, IP, NOW), {
    locked: false,
    retryAfterSeconds: 0,
    scope: null,
  });
});

test("one below the email limit still gets through; the limit itself locks", () => {
  assert.equal(throttleState(fails(MAX_FAILURES_PER_EMAIL - 1), EMAIL, IP, NOW).locked, false);
  const hit = throttleState(fails(MAX_FAILURES_PER_EMAIL), EMAIL, IP, NOW);
  assert.equal(hit.locked, true);
  assert.equal(hit.scope, "email");
  assert.ok(hit.retryAfterSeconds > 0);
});

test("failures older than the window do not count", () => {
  const stale = fails(MAX_FAILURES_PER_EMAIL, { agoMin: 20 }); // window is 15
  assert.equal(throttleState(stale, EMAIL, IP, NOW).locked, false);
});

test("the lock lifts on its own as the oldest failure ages out", () => {
  const attempts = fails(MAX_FAILURES_PER_EMAIL, { agoMin: 14 });
  assert.equal(throttleState(attempts, EMAIL, IP, NOW).locked, true);
  // Two minutes later those failures are 16 minutes old — outside the window.
  assert.equal(throttleState(attempts, EMAIL, IP, NOW + 2 * MIN).locked, false);
});

test("THE TRAP: a blocked attempt is not recorded, so the lock can expire", () => {
  // Counting blocked attempts would push the window forward on every retry and
  // turn a 15-minute pause into a permanent lockout for anyone who keeps trying.
  const locked = throttleState(fails(MAX_FAILURES_PER_EMAIL), EMAIL, IP, NOW);
  assert.equal(locked.locked, true);
  assert.equal(shouldRecordFailure(locked), false);

  const open = throttleState(fails(1), EMAIL, IP, NOW);
  assert.equal(shouldRecordFailure(open), true);
});

test("one account's failures do not lock a different account", () => {
  const others = fails(MAX_FAILURES_PER_EMAIL, { email: "someone.else@d1zmedia.com" });
  assert.equal(throttleState(others, EMAIL, IP, NOW).locked, false);
});

test("email matching is case and whitespace insensitive, like sign-in", () => {
  const shouty = fails(MAX_FAILURES_PER_EMAIL, { email: "  KELVIN@D1ZMEDIA.COM " });
  assert.equal(throttleState(shouty, EMAIL, IP, NOW).locked, true);
  assert.equal(normaliseEmail("  Foo@Bar.NG "), "foo@bar.ng");
});

test("password spraying trips the IP limit even though no single email does", () => {
  // One failure each against many addresses: every email count is 1, so the
  // email limit never fires. This is the case the second limit exists for.
  const spray = Array.from({ length: MAX_FAILURES_PER_IP }, (_, i) => ({
    email: `victim${i}@d1zmedia.com`,
    ip: IP,
    createdAt: new Date(NOW - MIN),
  }));
  assert.equal(throttleState(spray, "victim0@d1zmedia.com", IP, NOW).scope, "ip");
  assert.equal(throttleState(spray, "victim0@d1zmedia.com", IP, NOW).locked, true);
  // A different origin is unaffected by that spray.
  assert.equal(throttleState(spray, "victim0@d1zmedia.com", "41.58.2.9", NOW).locked, false);
});

test("a missing IP does not pool strangers into one budget", () => {
  // Two people behind a proxy that strips the header must not share a limit,
  // so null is never treated as matching null.
  const noIp = Array.from({ length: MAX_FAILURES_PER_IP }, (_, i) => ({
    email: `v${i}@d1zmedia.com`,
    ip: null,
    createdAt: new Date(NOW - MIN),
  }));
  assert.equal(throttleState(noIp, "v0@d1zmedia.com", null, NOW).locked, false);
});

test("the email limit is reported before the IP limit when both are tripped", () => {
  const both = [...fails(MAX_FAILURES_PER_EMAIL), ...fails(MAX_FAILURES_PER_IP, { email: "x@d1zmedia.com" })];
  assert.equal(throttleState(both, EMAIL, IP, NOW).scope, "email");
});

test("an unparseable timestamp is ignored rather than counted as now", () => {
  const junk = Array.from({ length: MAX_FAILURES_PER_EMAIL }, () => ({
    email: EMAIL, ip: IP, createdAt: "not a date",
  }));
  assert.equal(throttleState(junk, EMAIL, IP, NOW).locked, false);
});

test("pruneBefore returns exactly one window back", () => {
  assert.equal(pruneBefore(NOW).getTime(), NOW - THROTTLE_WINDOW_MS);
});

test("clientIpFrom takes the client, not the proxies behind it", () => {
  const h = (v: Record<string, string>) => ({ get: (k: string) => v[k] ?? null });
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "102.89.1.7, 10.0.0.1, 10.0.0.2" })), "102.89.1.7");
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "  102.89.1.7  " })), "102.89.1.7");
  assert.equal(clientIpFrom(h({ "x-real-ip": "41.58.2.9" })), "41.58.2.9");
  assert.equal(clientIpFrom(h({})), null);
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "   " })), null);
  assert.equal(clientIpFrom(null), null);
  // A forged, oversized header is truncated rather than stored whole.
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "x".repeat(500) }))?.length ?? 0, 64);
});
