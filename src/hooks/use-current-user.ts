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
}

export function useCurrentUser(): { user: CurrentUser | null; status: "loading" | "authenticated" | "unauthenticated" } {
  const { data: session, status } = useSession();
  const user = session?.user as CurrentUser | undefined;
  return { user: user ?? null, status };
}
