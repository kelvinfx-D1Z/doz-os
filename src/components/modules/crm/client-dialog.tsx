"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Add a client from the CRM Accounts tab. Only the name is required — a client
// that turns up as a referral often has nothing else known about them yet.
export function ClientDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [isStrategic, setIsStrategic] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setIndustry("");
    setWebsite("");
    setIsStrategic(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_account",
          name: name.trim(),
          industry: industry.trim() || undefined,
          website: website.trim() || undefined,
          isStrategic,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success(`${name.trim()} added`);
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't add client", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            Only the name is required. Industry helps you see which sectors pay best.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cl-name">Client name *</Label>
            <Input
              id="cl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Shell Nigeria"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-industry">Industry</Label>
              <Input
                id="cl-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Energy"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-website">Website</Label>
              <Input
                id="cl-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="shell.com.ng"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <div>
              <Label htmlFor="cl-strategic" className="text-sm">Strategic account</Label>
              <p className="text-[11px] text-muted-foreground">
                Marks the client with a star across the app.
              </p>
            </div>
            <Switch id="cl-strategic" checked={isStrategic} onCheckedChange={setIsStrategic} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
