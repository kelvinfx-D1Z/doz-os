import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import crypto from "crypto";
import { NextResponse } from "next/server";

// ============================================================
// PASSWORD HASHING — salted scrypt (backward compatible)
//
// New passwords are hashed with: scrypt$<saltHex>$<hashHex>
// Legacy passwords (unsalted sha256) are still recognized on
// sign-in and transparently upgraded to scrypt on the next
// successful login. This avoids a forced password reset while
// immediately securing every new login.
// ============================================================

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALTLEN = 16;
import {
  throttleState,
  shouldRecordFailure,
  pruneBefore,
  clientIpFrom,
  normaliseEmail,
  THROTTLE_WINDOW_MS,
} from "@/lib/login-throttle";

const SCRYPT_PREFIX = "scrypt$";

function scryptHash(password: string, salt: Buffer): string {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return SCRYPT_PREFIX + salt.toString("hex") + "$" + hash.toString("hex");
}

/** Hash a password for storage using a fresh random salt. */
export function hashPassword(p: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALTLEN);
  return scryptHash(p, salt);
}

/** Verify a password against a stored hash. Supports both new scrypt and legacy sha256. */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  // New format: scrypt$<saltHex>$<hashHex>
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const parts = stored.slice(SCRYPT_PREFIX.length).split("$");
    if (parts.length !== 2) return false;
    try {
      const salt = Buffer.from(parts[0], "hex");
      const expectedHash = Buffer.from(parts[1], "hex");
      const actualHash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
      // Use timingSafeEqual to prevent timing attacks
      if (actualHash.length !== expectedHash.length) return false;
      return crypto.timingSafeEqual(actualHash, expectedHash);
    } catch {
      return false;
    }
  }
  // Anything that is not scrypt is refused. The legacy format was unsalted
  // sha256, and every account still carrying one was seeded with a shared demo
  // password that is permanently in this repository's git history. Accepting
  // that format meant a leaked hash stayed usable the moment an account was
  // activated — with only an isActive flag in the way. Verified before
  // removing: 4 accounts on scrypt (every active user) and 9 on sha256, all
  // inactive, so nobody real is locked out. Reactivating one of those nine now
  // requires setting a real password, which is the correct outcome.
  return false;
}

/**
 * True if the stored hash is the legacy unsalted sha256 format. These can no
 * longer sign in — verifyPassword refuses them — so this is now a detector
 * for accounts that need a real password set, not an upgrade trigger.
 */
export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith(SCRYPT_PREFIX);
}

// ============================================================
// AUTH SECRET — must come from environment variable in production.
// No hardcoded fallback: if NEXTAUTH_SECRET is missing we generate
// a random ephemeral secret for THIS process so the app still boots,
// but all existing sessions are invalidated. This is loud-fail behavior
// — the deployment must set NEXTAUTH_SECRET for sessions to persist.
// ============================================================
function resolveAuthSecret(): string {
  const envSecret = process.env.NEXTAUTH_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  // Ephemeral random secret — sessions won't survive a restart, which is
  // the desired signal that NEXTAUTH_SECRET must be set in production.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[AUTH] CRITICAL: NEXTAUTH_SECRET is missing or too short (<32 chars) in production. " +
        "Generate one with `openssl rand -base64 32` and set it as an environment variable.",
    );
  }
  return crypto.randomBytes(32).toString("hex");
}

const AUTH_SECRET = resolveAuthSecret();

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: { signIn: "/" },
  // trustHost is required in NextAuth v4.24+ but not in the type defs;
  // cast to satisfy TypeScript without losing the runtime behavior.
  ...({ trustHost: true } as object),
  // Use NextAuth's default cookie settings (sameSite=lax, httpOnly=true).
  // Previously this used sameSite:"none" + secure:true which weakens CSRF
  // protection and is unnecessary for a same-origin app.
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = normaliseEmail(credentials.email);
        // Basic email format check — reject obviously malformed input early.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        // RATE LIMIT — before any password work, and before we reveal by
        // timing whether the address exists. Two limits: a strict one per
        // address, a looser one per origin to catch password spraying, which
        // no per-address count ever sees. See src/lib/login-throttle.ts.
        const ip = clientIpFrom((req as { headers?: Headers } | undefined)?.headers ?? null);
        let recent: { email: string; ip: string | null; createdAt: Date }[] = [];
        try {
          recent = await db.loginAttempt.findMany({
            where: {
              createdAt: { gt: new Date(Date.now() - THROTTLE_WINDOW_MS) },
              OR: [{ email }, ...(ip ? [{ ip }] : [])],
            },
            select: { email: true, ip: true, createdAt: true },
          });
        } catch (e) {
          // Never let the throttle's own failure become an outage. It fails
          // open on purpose: a login that cannot be rate-limited is worse than
          // one that is not, but a company locked out of its own OS is worse
          // than both.
          console.error("[AUTH] throttle lookup failed, allowing the attempt", e);
        }
        const decision = throttleState(recent, email, ip);
        if (decision.locked) {
          console.warn(
            `[AUTH] throttled sign-in for ${email} from ${ip ?? "unknown"} ` +
              `(${decision.scope} limit, ${decision.retryAfterSeconds}s remaining)`
          );
          return null;
        }

        const recordFailure = async () => {
          if (!shouldRecordFailure(decision)) return;
          try {
            await db.loginAttempt.create({ data: { email, ip } });
          } catch (e) {
            console.error("[AUTH] could not record a failed sign-in", e);
          }
        };

        const user = await db.user.findUnique({
          where: { email },
        });
        if (!user || !user.isActive || !user.password) {
          await recordFailure();
          return null;
        }
        if (!verifyPassword(credentials.password, user.password)) {
          await recordFailure();
          return null;
        }

        // Signed in: clear this address's failures so a person who simply
        // mistyped starts clean, and prune everyone's stale rows while here.
        try {
          await db.loginAttempt.deleteMany({
            where: { OR: [{ email }, { createdAt: { lt: pruneBefore() } }] },
          });
        } catch (e) {
          console.error("[AUTH] could not clear failed sign-in attempts", e);
        }


        // Parse permissions once at sign-in so the JWT carries the array
        // (avoids re-parsing the JSON column on every request).
        let perms: string[] | null = null;
        if (user.permissions) {
          try {
            const parsed = JSON.parse(user.permissions);
            if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
              perms = parsed;
            }
          } catch {
            perms = null;
          }
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          title: user.title ?? undefined,
          permissions: perms,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.title = (user as any).title;
        token.permissions = (user as any).permissions ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).title = token.title as string | undefined;
        (session.user as any).permissions = (token.permissions as string[] | null) ?? null;
      }
      return session;
    },
  },
  secret: AUTH_SECRET,
};

export default NextAuth(authOptions);

// ============================================================
// SESSION HELPERS — used by every API route to enforce auth + roles
// ============================================================

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  permissions?: string[] | null;
  /** Set when the founder is viewing the app as this person. */
  impersonated?: boolean;
};

// ============================================================
// "VIEW AS" — founder-only impersonation
//
// The founder needs to answer "what does Arome actually see?" without knowing
// his password. Passwords are salted scrypt hashes and cannot be read back, so
// signing in as someone is not an option — and should not be.
//
// This hooks the single chokepoint every API route already uses,
// getSessionUser(), so financial gating, project scoping and module
// permissions all shape themselves correctly with no per-route changes.
//
// Guards:
//  - only a FOUNDER can impersonate; for anyone else the cookie is ignored
//  - the target must exist and be active
//  - middleware.ts rejects every non-GET request while it is active, so the
//    founder can look but cannot act as someone else
// ============================================================
export const VIEW_AS_COOKIE = "doz-view-as";
/** Readable companion to VIEW_AS_COOKIE, carrying only UI display data. */
export const VIEW_AS_INFO_COOKIE = "doz-view-as-info";

/** The genuinely signed-in user, ignoring any impersonation. */
export async function getRealSessionUser(): Promise<SessionUser | null> {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser) ?? null;
}

/** Returns the authenticated user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const real = await getRealSessionUser();
  if (!real) return null;
  // Only a founder may view as someone else. Anyone else carrying the cookie
  // (copied, crafted, left over from a demotion) is simply themselves.
  if (real.role !== "FOUNDER") return real;

  let targetId: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    targetId = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  } catch {
    return real; // no request context (e.g. a script) — never impersonate
  }
  if (!targetId || targetId === real.id) return real;

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true, role: true, title: true, isActive: true, permissions: true },
  });
  if (!target || !target.isActive) return real;

  return {
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    title: target.title ?? undefined,
    permissions: parsePermissions(target.permissions),
    impersonated: true,
  };
}

/**
 * Require an authenticated session. Returns { user } on success, or
 * { error } with a 401 NextResponse if not authenticated.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if ("error" in auth) return auth.error;
 *   const user = auth.user;
 */
export async function requireAuth(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

/**
 * Require a FOUNDER session. Returns { user } on success, or { error }
 * with 401 (not signed in) or 403 (wrong role).
 */
export async function requireFounder(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (auth.user.role !== "FOUNDER") {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return auth;
}

/**
 * Require a FOUNDER or STAFF session. Returns { user } on success, or
 * { error } with 401/403.
 */
export async function requireStaff(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (auth.user.role !== "FOUNDER" && auth.user.role !== "STAFF") {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return auth;
}

// ============================================================
// FINANCIAL VISIBILITY — one rule, used everywhere
//
// ONLY the founder may see company money: revenue, budget, cost, profit,
// margin, cash position, outstanding balances, vendor bank details and
// lifetime spend. Not staff, not interns, not freelancers.
//
// This must be enforced in the API, not the UI. Module permissions only
// decide which nav items appear — every API route is reachable by any
// signed-in user who knows the URL, so hiding a figure on screen while the
// endpoint still returns it protects nothing.
//
// Operational cost a coordinator needs to do their job — what a specific
// vendor is owed on a job they are running — is handled case by case and is
// deliberately NOT covered by this flag.
// ============================================================
export function canSeeFinancials(role: string | undefined | null): boolean {
  return role === "FOUNDER";
}

// ============================================================
// PROJECT-RUNNING ROLES
//
// FREELANCER and PRODUCTION_MANAGER both run jobs on the ground: they see
// only the projects they manage, and they build the cost sheet. A
// PRODUCTION_MANAGER has more authority than a freelance crew member — they
// own a project's budget, add and remove lines, and bring in vendors — but
// neither ever sees company revenue, profit or margin. What they see is what
// the job COSTS, because that is the thing they are responsible for.
// ============================================================
export function isProjectManagerRole(role: string | undefined | null): boolean {
  return role === "FREELANCER" || role === "PRODUCTION_MANAGER";
}

/** Can this role build and submit a project cost sheet? */
export function canBuildBudget(role: string | undefined | null): boolean {
  return role === "FOUNDER" || role === "STAFF" || role === "PRODUCTION_MANAGER";
}

// ============================================================
// PERMISSIONS PARSER
// ============================================================
export function parsePermissions(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Who may create, view and download client documents.
 *
 * FOUNDER always. Anyone else only if the founder has explicitly granted them
 * the `documents` module through the per-user permissions override — granting
 * it exposes client pricing to that person, which is the founder's call.
 */
export function canIssueDocuments(user: {
  role: string;
  permissions?: string[] | null;
}): boolean {
  if (user.role === "FOUNDER") return true;
  return Array.isArray(user.permissions) && user.permissions.includes("documents");
}
