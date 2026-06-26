"use client";
import { useSearchParam } from "@/hooks/use-search-param";
import { AppShell } from "@/components/doz/app-shell";
import { ClientPortal } from "@/components/modules/client-portal";

export function HomeRouter() {
  const portalToken = useSearchParam("portal");

  // If ?portal=TOKEN is in the URL, render the client portal (no DOZ OS login needed)
  if (portalToken) {
    return <ClientPortal token={portalToken} />;
  }

  // Otherwise, render the normal DOZ OS app (auth-gated)
  return <AppShell />;
}
