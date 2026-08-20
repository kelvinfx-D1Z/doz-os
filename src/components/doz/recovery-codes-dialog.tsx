"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Generating a set invalidates any previous one, and the plaintext exists for
// exactly one render — there is no way to see them again afterwards.
export function RecoveryCodesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<{ unused: number; total: number } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/doz/recovery", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setStatus(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  async function generate() {
    if (!window.confirm(
      "Generate a new set of recovery codes?\n\nAny codes you already have will stop working immediately.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/doz/recovery", { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setCodes(j.codes);
      setStatus({ unused: j.count, total: j.count });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate codes", { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    if (!codes) return;
    navigator.clipboard?.writeText(codes.join("\n"));
    toast.success("Codes copied — paste them somewhere safe now");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setCodes(null); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Recovery codes
          </DialogTitle>
          <DialogDescription>
            If you lose your laptop or forget your password, one of these gets you back in.
            Nobody can reset your account for you — you are the founder.
          </DialogDescription>
        </DialogHeader>

        {codes ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs">
                This is the only time these are shown. Print them, or write them down and keep
                them away from your laptop. Each works once.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-muted/30 p-3 font-mono text-sm">
              {codes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5" /> Copy all
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {status === null
                ? "Checking…"
                : status.total === 0
                  ? "You have no recovery codes. If you lose access today, there is no way back in without database access."
                  : `You have ${status.unused} unused code${status.unused === 1 ? "" : "s"} of ${status.total}.`}
            </p>
            <Button onClick={generate} disabled={busy} className="w-full gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {status && status.total > 0 ? "Generate a new set" : "Generate my recovery codes"}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {codes ? "I've saved them" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
