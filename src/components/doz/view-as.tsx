"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PickUser = { id: string; name: string; email: string; role: string; title?: string | null };
type State = {
  impersonating: boolean;
  viewingAs: { id: string; name: string; role: string } | null;
  users: PickUser[];
};

const ROLE_ORDER = ["FOUNDER", "STAFF", "PRODUCTION_MANAGER", "INTERN", "FREELANCER"];

async function fetchState(): Promise<State> {
  const r = await fetch("/api/doz/view-as", { cache: "no-store" });
  if (!r.ok) return { impersonating: false, viewingAs: null, users: [] };
  return r.json();
}

/** Persistent banner shown whenever the founder is viewing as someone else. */
export function ViewAsBanner() {
  const [state, setState] = useState<State | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchState().then((s) => { if (!cancelled) setState(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!state?.impersonating || !state.viewingAs) return null;

  async function stop() {
    setStopping(true);
    try {
      const r = await fetch("/api/doz/view-as", { method: "DELETE" });
      if (!r.ok) throw new Error();
      // Full reload: the server shapes every response by session user, so the
      // whole app must be re-fetched as the founder again.
      window.location.reload();
    } catch {
      toast.error("Couldn't stop — try reloading the page");
      setStopping(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-100 backdrop-blur">
      <Eye className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        You&apos;re viewing as <strong>{state.viewingAs.name}</strong>{" "}
        <span className="opacity-70">({state.viewingAs.role.replace("_", " ").toLowerCase()})</span>
        <span className="ml-2 hidden text-[11px] opacity-70 sm:inline">
          Read-only — nothing can be changed while viewing as someone else.
        </span>
      </p>
      <Button size="sm" variant="outline" onClick={stop} disabled={stopping} className="gap-1.5 border-amber-400/50">
        {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
        Back to my account
      </Button>
    </div>
  );
}

/** Founder-only picker. */
export function ViewAsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchState().then((s) => { if (!cancelled) setState(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  async function start(u: PickUser) {
    setBusyId(u.id);
    try {
      const r = await fetch("/api/doz/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch", { duration: 8000 });
      setBusyId(null);
    }
  }

  const users = (state?.users ?? []).slice().sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.role), rb = ROLE_ORDER.indexOf(b.role);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.name.localeCompare(b.name);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            View as someone else
          </DialogTitle>
          <DialogDescription>
            See exactly what they see — their modules, their dashboard, their data.
            Read-only: nothing can be changed while viewing as another person.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto scroll-thin">
          {state === null && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {state !== null && users.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No other active users to view as.
            </p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => start(u)}
              disabled={busyId !== null}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-border p-2.5 text-left transition-colors",
                "hover:border-primary/40 hover:bg-accent disabled:opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {u.title ? `${u.title} · ` : ""}{u.email}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {u.role.replace("_", " ").toLowerCase()}
              </Badge>
              {busyId === u.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
