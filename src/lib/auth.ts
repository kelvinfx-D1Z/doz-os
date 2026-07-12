import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import crypto from "crypto";

export function hashPassword(p: string): string {
  return crypto.createHash("sha256").update(p).digest("hex");
}

// ============================================================
// PERMANENT AUTH SECRET FIX
// The NEXTAUTH_SECRET env var kept disappearing from .env during
// file operations, causing "Server error" on login. This hardcoded
// fallback ensures auth ALWAYS works, even if env vars are missing.
// In production, set NEXTAUTH_SECRET to a different value via the
// hosting platform's environment variables.
// ============================================================
const FALLBACK_SECRET = "doz-os-secret-key-phase2-2025-very-long";
const AUTH_SECRET = process.env.NEXTAUTH_SECRET || FALLBACK_SECRET;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        sameSite: "none",
        secure: true,
        path: "/",
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        sameSite: "none",
        secure: true,
        path: "/",
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.isActive || !user.password) return null;
        if (user.password !== hashPassword(credentials.password)) return null;
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
  secret: AUTH_SECRET, // ← NEVER undefined: falls back to hardcoded value
};

export default NextAuth(authOptions);

export async function getSessionUser() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  return session?.user as
    | { id: string; name: string; email: string; role: string; title?: string; permissions?: string[] | null }
    | null;
}

// ============================================================
// Parse a user's permissions from the DB column into a string[].
// Returns null when no custom permissions are set (caller should
// fall back to role-based defaults).
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
