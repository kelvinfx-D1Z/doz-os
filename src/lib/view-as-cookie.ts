// ============================================================
// VIEW-AS DISPLAY COOKIE — one owner for both sides of the wire
//
// When the founder views the app as someone else, two cookies are set:
//
//   doz-view-as       httpOnly, the id. The SERVER's authority — every
//                     response is shaped from it.
//   doz-view-as-info  readable, display only. Lets the client render that
//                     person's name, role and modules without a round trip,
//                     so there is never a frame showing the founder's shell
//                     over someone else's data.
//
// This module exists because the writer and the reader drifted apart and
// nothing caught it. The route did `encodeURIComponent(JSON.stringify(x))`,
// and Next's cookie layer then encoded that AGAIN, so the browser stored a
// doubly-encoded value. The client decoded once, `JSON.parse` threw on a
// string still starting `%7B`, the catch returned null, and the UI silently
// fell back to the NextAuth session — which is always the founder. View-as
// never worked in the shell, and failed silently enough to ship.
//
// So: the cookie layer does the encoding, exactly once. We hand it raw JSON
// and read it back with a single decode. Both halves live here, tested
// together, and neither side may hand-roll its own.
//
// NOT a security boundary. The httpOnly cookie is the authority and the
// server shapes every response from it; tampering here only gives the
// tamperer a wrong-looking UI in their own browser.
// ============================================================

export const VIEW_AS_INFO_COOKIE = "doz-view-as-info";

export interface ViewAsInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  /** Per-user module permissions. Null means the role defaults apply. */
  permissions?: string[] | null;
}

/**
 * The value to hand to `cookies().set()`. Deliberately NOT pre-encoded —
 * the cookie layer percent-encodes it on the way out, and pre-encoding is
 * exactly the bug this module was written to close.
 */
export function serialiseViewAsInfo(info: ViewAsInfo): string {
  return JSON.stringify(info);
}

/**
 * Parse one raw cookie value (as `document.cookie` hands it over: still
 * percent-encoded, never decoded by the browser) back into display info.
 *
 * Returns null for anything it cannot vouch for — absent, malformed, or the
 * legacy doubly-encoded value written before this module existed. A null
 * means "render the real session", which is the safe direction: it shows the
 * founder their own shell rather than someone else's.
 */
export function parseViewAsInfo(rawValue: string | null | undefined): ViewAsInfo | null {
  if (!rawValue) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    return null; // malformed percent-escapes
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null; // includes the legacy double-encoded value, still "%7B..."
  }
  if (!parsed || typeof parsed !== "object") return null;
  const u = parsed as Record<string, unknown>;
  if (typeof u.id !== "string" || !u.id) return null;
  if (typeof u.role !== "string" || !u.role) return null;
  return {
    id: u.id,
    name: typeof u.name === "string" ? u.name : "",
    email: typeof u.email === "string" ? u.email : "",
    role: u.role,
    title: typeof u.title === "string" ? u.title : undefined,
    permissions: Array.isArray(u.permissions)
      ? u.permissions.filter((p): p is string => typeof p === "string")
      : null,
  };
}

/**
 * Pull the display info out of a whole cookie header — `document.cookie` in
 * the browser, or a request's Cookie header. Taking the string rather than
 * touching `document` keeps this testable without a DOM.
 */
export function readViewAsInfo(cookieHeader: string | null | undefined): ViewAsInfo | null {
  if (!cookieHeader) return null;
  const prefix = `${VIEW_AS_INFO_COOKIE}=`;
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      return parseViewAsInfo(entry.slice(prefix.length));
    }
  }
  return null;
}
