// ============================================================
// LOGIN THROTTLE — how many wrong passwords before we stop listening
//
// Until this existed, sign-in had no rate limit at all: no attempt counter, no
// lockout, nothing slowing a guess. That matters here more than it would
// elsewhere, because nine seeded accounts share one password that is
// permanently in this repository's git history, and the only thing holding
// them shut is an isActive flag.
//
// TWO LIMITS, DELIBERATELY DIFFERENT
//   per email  — small and strict. Stops someone hammering one known account.
//   per IP     — larger. Stops someone spraying one password across every
//                address they can think of, which the email limit never sees
//                because each address only fails once.
//
// THE DENIAL-OF-SERVICE TRADE, STATED PLAINLY
// Any per-email lockout lets a stranger lock a colleague out by failing on
// their address on purpose. The window is therefore short (15 minutes) and
// rolling, not an administrative lock someone has to come and undo. For an
// internal tool with eleven users that is the right balance: a brute-force
// attempt is stopped dead, and the worst nuisance case costs a real user a
// quarter of an hour, not a support call.
//
// THE BUG THIS SHAPE AVOIDS
// A locked-out attempt must NOT be recorded as a new failure. Recording it
// would push the window forward on every retry, so an impatient person — or
// any retrying client — could never get back in. Lockout must expire on its
// own. `shouldRecordFailure` exists to make that explicit rather than implied.
// ============================================================

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
/** Wrong passwords for one address before that address goes quiet. */
export const MAX_FAILURES_PER_EMAIL = 5;
/** Wrong passwords from one address-of-origin, across every account. */
export const MAX_FAILURES_PER_IP = 20;

export interface FailedAttempt {
  email: string;
  ip?: string | null;
  createdAt: Date | string | number;
}

export interface ThrottleDecision {
  locked: boolean;
  /** Whole seconds until the oldest counted failure leaves the window. */
  retryAfterSeconds: number;
  /** Which limit tripped — useful for logs, never shown to the person. */
  scope: "email" | "ip" | null;
}

function ms(at: Date | string | number): number | null {
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Normalises an address the same way sign-in does, so the two cannot disagree. */
export function normaliseEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Decide whether this sign-in attempt should even be considered.
 *
 * `attempts` is every failure recorded recently — the caller may pass a wider
 * set than the window and this will ignore the stale ones, so the query does
 * not have to be exact.
 */
export function throttleState(
  attempts: FailedAttempt[],
  email: string,
  ip: string | null | undefined,
  now: number = Date.now(),
): ThrottleDecision {
  const cutoff = now - THROTTLE_WINDOW_MS;
  const target = normaliseEmail(email);

  const inWindow = attempts
    .map((a) => ({ ...a, at: ms(a.createdAt) }))
    .filter((a): a is FailedAttempt & { at: number } => a.at !== null && a.at > cutoff);

  const forEmail = inWindow.filter((a) => normaliseEmail(a.email) === target);
  // An absent IP is not a match for another absent IP: two people behind a
  // proxy that strips the header must not share a budget.
  const forIp = ip ? inWindow.filter((a) => a.ip === ip) : [];

  const decide = (rows: { at: number }[], max: number, scope: "email" | "ip"): ThrottleDecision | null => {
    if (rows.length < max) return null;
    // The lock lifts when the oldest failure still being counted ages out.
    const oldestCounted = rows.map((r) => r.at).sort((a, b) => a - b)[rows.length - max];
    const until = oldestCounted + THROTTLE_WINDOW_MS;
    return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)), scope };
  };

  return (
    decide(forEmail, MAX_FAILURES_PER_EMAIL, "email") ??
    decide(forIp, MAX_FAILURES_PER_IP, "ip") ?? { locked: false, retryAfterSeconds: 0, scope: null }
  );
}

/**
 * Whether a rejected attempt should be written down.
 *
 * False while already locked — see the note above. Counting a blocked attempt
 * would keep pushing the window forward and turn a 15-minute pause into a
 * permanent one for anyone who retries.
 */
export function shouldRecordFailure(decision: ThrottleDecision): boolean {
  return !decision.locked;
}

/** Oldest timestamp still worth keeping. Everything before it can be deleted. */
export function pruneBefore(now: number = Date.now()): Date {
  return new Date(now - THROTTLE_WINDOW_MS);
}

/**
 * First forwarded address, which is the client. Later entries are proxies and
 * are trivially forgeable, so only the first is used — and it is only ever a
 * rate-limit key, never an authorisation decision.
 */
export function clientIpFrom(headers: {
  get(name: string): string | null | undefined;
} | null | undefined): string | null {
  if (!headers) return null;
  const fwd = headers.get("x-forwarded-for");
  if (typeof fwd === "string" && fwd.trim()) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip");
  return typeof real === "string" && real.trim() ? real.trim().slice(0, 64) : null;
}
