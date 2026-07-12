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
  // Legacy format: unsalted sha256 hex — verify then mark for upgrade
  const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
  return legacyHash === stored;
}

/** Returns true if the stored hash is the legacy unsalted sha256 format (needs upgrade). */
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
  trustHost: true,
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();
        // Basic email format check — reject obviously malformed input early.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        const user = await db.user.findUnique({
          where: { email },
        });
        if (!user || !user.isActive || !user.password) return null;
        if (!verifyPassword(credentials.password, user.password)) return null;

        // Transparent upgrade: if the stored hash is legacy sha256, re-hash
        // with scrypt now that we have the plaintext password in memory.
        if (isLegacyHash(user.password)) {
          try {
            const newHash = hashPassword(credentials.password);
            await db.user.update({ where: { id: user.id }, data: { password: newHash } });
          } catch (e) {
            console.error("[AUTH] Failed to upgrade password hash for", user.email, e);
            // Non-blocking — login still succeeds.
          }
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
};

/** Returns the authenticated user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser) ?? null;
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
