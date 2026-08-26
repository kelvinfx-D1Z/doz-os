"use client";
import { useSearchParam } from "@/hooks/use-search-param";
import { AppShell } from "@/components/doz/app-shell";
import { ClientPortal } from "@/components/modules/client-portal";
import { CLIENT_PORTAL_ENABLED } from "@/lib/feature-flags";

export function HomeRouter() {
  const portalToken = useSearchParam("portal");

  // If ?portal=TOKEN is in the URL, render the client portal (no DOZ OS login needed).
  // Kill switch: clients never use the OS (download-and-email delivery), so a
  // stray/old portal link falls through to the normal app instead of a dead portal.
  if (portalToken && CLIENT_PORTAL_ENABLED) {
    return <ClientPortal token={portalToken} />;
  }

  // Otherwise, render the normal DOZ OS app (auth-gated)
  return <AppShell />;
}
