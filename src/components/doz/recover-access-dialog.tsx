"use client";

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// Reached from the sign-in screen, so necessarily unauthenticated. The API
// gives the same answer for an unknown email, a wrong code and a used code, so
// nothing here can be used to discover which accounts exist.
export function RecoverAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const busyRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPassword !== confirm) { toast.error("Passwords don't match"); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/doz/recovery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      setDone(true);
      toast.success("Password reset", { description: "Sign in with your new password." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't recover", { duration: 9000 });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setDone(false); setCode(""); setNewPassword(""); setConfirm(""); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Recover your account
          </DialogTitle>
          <DialogDescription>
            Enter one of your recovery codes to set a new password.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="text-sm">Your password has been reset.</p>
            <p className="text-xs text-muted-foreground">
              That code is now used up. Generate a fresh set once you&apos;re back in.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Back to sign in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-email">Your email</Label>
              <Input id="rec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-code">Recovery code</Label>
              <Input
                id="rec-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-new">New password</Label>
              <Input id="rec-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-confirm">Confirm new password</Label>
              <Input id="rec-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !email || !code || newPassword.length < 8 || newPassword !== confirm} className="gap-1.5">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Reset password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
