"use client";
import { useSession } from "next-auth/react";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  /** Per-user module permissions. When null, the role-based defaults apply. */
  permissions?: string[] | null;
  /** True when the founder is viewing the app as this person. */
  impersonated?: boolean;
}

import { readViewAsInfo } from "@/lib/view-as-cookie";

// While the founder is viewing as someone else, the server already shapes every
// response as that person — money stripped, projects scoped. The NextAuth
// session, however, still says FOUNDER, so without this the client renders the
// founder layout against data that no longer contains revenue or margin, and
// crashes on undefined.
//
// Read synchronously from a cookie rather than fetched, so there is never a
// render with the wrong role. This is display only: the httpOnly cookie is the
// server's authority, and tampering here just gives you a wrong-looking UI in
// your own browser.
// Parsing lives in src/lib/view-as-cookie.ts alongside the writer, so the two
// halves cannot drift apart again. They already did once: the route
// pre-encoded the value, the cookie layer encoded it a second time, and this
// hook's single decode could never parse it — so it silently returned null and
// the founder's own shell rendered over someone else's data.
function readImpersonation(): CurrentUser | null {
  if (typeof document === "undefined") return null;
  const info = readViewAsInfo(document.cookie);
  return info ? ({ ...info, impersonated: true } as CurrentUser) : null;
}

export function useCurrentUser(): { user: CurrentUser | null; status: "loading" | "authenticated" | "unauthenticated" } {
  const { data: session, status } = useSession();
  const sessionUser = session?.user as CurrentUser | undefined;

  if (status === "authenticated") {
    const viewingAs = readImpersonation();
    if (viewingAs) return { user: viewingAs, status };
  }

  return { user: sessionUser ?? null, status };
}
