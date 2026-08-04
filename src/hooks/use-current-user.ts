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

const VIEW_AS_INFO_COOKIE = "doz-view-as-info";

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
function readImpersonation(): CurrentUser | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${VIEW_AS_INFO_COOKIE}=`))
    ?.slice(VIEW_AS_INFO_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const u = JSON.parse(decodeURIComponent(raw));
    if (!u?.id || !u?.role) return null;
    return { ...u, impersonated: true } as CurrentUser;
  } catch {
    return null;
  }
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
