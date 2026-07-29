"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"] as const;

export interface ContractAccount {
  id: string;
  name: string;
  contract: {
    id: string;
    title: string;
    status: string;
    isRecurring: boolean;
    renewalDate: string | null;
    value: number;
  } | null;
}

export function ContractDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: ContractAccount | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const existing = account?.contract ?? null;

  const [title, setTitle] = useState("Annual Retainer");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [startDate, setStartDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form state when a different account opens. Canonical
  // "store info from previous renders" pattern — avoids setState in an effect,
  // which the lint baseline forbids.
  const [prevId, setPrevId] = useState<string | null>(account?.id ?? null);
  if ((account?.id ?? null) !== prevId) {
    setPrevId(account?.id ?? null);
    setTitle(existing?.title ?? "Annual Retainer");
    setValue(existing ? String(existing.value) : "");
    setStatus(existing?.status ?? "DRAFT");
    setStartDate("");
    setRenewalDate(existing?.renewalDate ? existing.renewalDate.slice(0, 10) : "");
    setSaving(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!account || !title.trim() || saving) return;
    setSaving(true);
    try {
      const body = existing
        ? {
            action: "update_contract",
            contractId: existing.id,
            title: title.trim(),
            value: Number(value) || 0,
            status,
            isRecurring: true,
            startDate: startDate || undefined,
            renewalDate: renewalDate || undefined,
          }
        : {
            action: "create_contract",
            accountId: account.id,
            title: title.trim(),
            value: Number(value) || 0,
            status,
            isRecurring: true,
            startDate: startDate || undefined,
            renewalDate: renewalDate || undefined,
          };

      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success("Retainer saved", {
        description:
          status === "ACTIVE"
            ? "Counts toward contracted revenue."
            : "Set it to Active once signed so it counts.",
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save retainer", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit retainer" : "Add a retainer"} — {account?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            Only contracts marked Active count toward contracted revenue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="k-title">Title *</Label>
            <Input id="k-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-value">Annual value (NGN)</Label>
              <Input id="k-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="k-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-start">Start date</Label>
              <Input id="k-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-renew">Renews on</Label>
              <Input id="k-renew" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save retainer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
