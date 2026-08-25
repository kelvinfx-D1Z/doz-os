"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

type Company = {
  legalName: string;
  tradingName: string | null;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  rcNumber: string | null;
  tin: string | null;
  vatRegistered: boolean;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  defaultPaymentTerms: string | null;
};

const EMPTY: Company = {
  legalName: "",
  tradingName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  rcNumber: "",
  tin: "",
  vatRegistered: true,
  bankName: "",
  bankAccount: "",
  bankAccountName: "",
  defaultPaymentTerms: "",
};

// Legal name, address, RC/TIN and bank details every quotation, invoice and
// receipt header reads from. FOUNDER-only to edit — the API enforces this
// too, so this dialog is only ever opened for a founder.
export function CompanySettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/doz/company", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        const c = j.company;
        setForm({
          legalName: c.legalName ?? "",
          tradingName: c.tradingName ?? "",
          address: c.address ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          website: c.website ?? "",
          rcNumber: c.rcNumber ?? "",
          tin: c.tin ?? "",
          vatRegistered: !!c.vatRegistered,
          bankName: c.bankName ?? "",
          bankAccount: c.bankAccount ?? "",
          bankAccountName: c.bankAccountName ?? "",
          defaultPaymentTerms: c.defaultPaymentTerms ?? "",
        });
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Couldn't load company details", { duration: 8000 });
      });
    return () => { cancelled = true; };
  }, [open]);

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success("Company details saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save company details", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  const f = form ?? EMPTY;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Company details
          </DialogTitle>
          <DialogDescription>
            The legal name, address and banking details printed on every quotation,
            invoice and receipt.
          </DialogDescription>
        </DialogHeader>

        {!form ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</p>
              <div className="space-y-1.5">
                <Label htmlFor="cs-legal">Legal name</Label>
                <Input id="cs-legal" value={f.legalName} onChange={(e) => set("legalName", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-trading">Trading name</Label>
                <Input id="cs-trading" value={f.tradingName ?? ""} onChange={(e) => set("tradingName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-address">Address</Label>
                <Input id="cs-address" value={f.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-phone">Phone</Label>
                <Input id="cs-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-email">Email</Label>
                <Input id="cs-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-website">Website</Label>
                <Input id="cs-website" value={f.website ?? ""} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Statutory</p>
              <div className="space-y-1.5">
                <Label htmlFor="cs-rc">RC number</Label>
                <Input id="cs-rc" value={f.rcNumber ?? ""} onChange={(e) => set("rcNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-tin">TIN</Label>
                <Input id="cs-tin" value={f.tin ?? ""} onChange={(e) => set("tin", e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.vatRegistered} onCheckedChange={(v) => set("vatRegistered", v === true)} />
                VAT registered
              </label>
              <p className="text-[11px] text-muted-foreground">
                These appear on every quotation, invoice and receipt. Leaving RC or TIN
                blank simply omits that line from the document.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
              <div className="space-y-1.5">
                <Label htmlFor="cs-bank-name">Bank name</Label>
                <Input id="cs-bank-name" value={f.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-bank-account">Account number</Label>
                <Input id="cs-bank-account" value={f.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-bank-account-name">Account name</Label>
                <Input id="cs-bank-account-name" value={f.bankAccountName ?? ""} onChange={(e) => set("bankAccountName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-terms">Default payment terms</Label>
                <Textarea id="cs-terms" value={f.defaultPaymentTerms ?? ""} onChange={(e) => set("defaultPaymentTerms", e.target.value)} rows={2} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !form || !f.legalName} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
