"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/doz/ui-primitives";
import { Loader2, User2, Phone, Landmark, ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string; name: string; email: string; role: string;
  title: string | null; phone: string | null; address: string | null;
  dateOfBirth: string | null; startDate: string | null; idNumber: string | null;
  emergencyName: string | null; emergencyPhone: string | null; emergencyRelationship: string | null;
  nextOfKinName: string | null; nextOfKinPhone: string | null; nextOfKinRelationship: string | null;
  guarantorName: string | null; guarantorPhone: string | null; guarantorAddress: string | null;
  bankName?: string | null; bankAccount?: string | null; bankAccountName?: string | null;
}

const dateVal = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export function MyProfile() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // setState only inside the async continuation — the repo lints against
  // calling it synchronously in an effect body.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/profile")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setP(j.profile);
        setForm({
          name: j.profile.name ?? "", title: j.profile.title ?? "",
          phone: j.profile.phone ?? "", address: j.profile.address ?? "",
          dateOfBirth: dateVal(j.profile.dateOfBirth), startDate: dateVal(j.profile.startDate),
          idNumber: j.profile.idNumber ?? "",
          emergencyName: j.profile.emergencyName ?? "", emergencyPhone: j.profile.emergencyPhone ?? "",
          emergencyRelationship: j.profile.emergencyRelationship ?? "",
          nextOfKinName: j.profile.nextOfKinName ?? "", nextOfKinPhone: j.profile.nextOfKinPhone ?? "",
          nextOfKinRelationship: j.profile.nextOfKinRelationship ?? "",
          guarantorName: j.profile.guarantorName ?? "", guarantorPhone: j.profile.guarantorPhone ?? "",
          guarantorAddress: j.profile.guarantorAddress ?? "",
          bankName: j.profile.bankName ?? "", bankAccount: j.profile.bankAccount ?? "",
          bankAccountName: j.profile.bankAccountName ?? "",
        });
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.name?.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/doz/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`);
      setP(j.profile);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save", { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <Card className="p-6"><p className="text-sm text-destructive">Could not load your profile. {error}</p></Card>;
  }
  if (!p) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const field = (k: string, label: string, type = "text", placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`p-${k}`}>{label}</Label>
      <Input id={`p-${k}`} type={type} value={form[k] ?? ""} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{p.name}</h2>
            <p className="text-xs text-muted-foreground">{p.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{p.role}</Badge>
            {p.title && <span className="text-xs text-muted-foreground">{p.title}</span>}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Your email is your sign-in username and your role are both managed by the founder.
          Everything below is yours to keep up to date.
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeader icon={<User2 className="h-4 w-4" />} title="Personal" description="Who you are" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("name", "Full name *")}
          {field("title", "Job title", "text", "e.g. Production Intern")}
          {field("dateOfBirth", "Date of birth", "date")}
          {field("startDate", "Start date", "date")}
          {field("idNumber", "ID / NIN")}
          {field("phone", "Phone")}
          <div className="sm:col-span-2">{field("address", "Home address")}</div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader icon={<ShieldAlert className="h-4 w-4" />} title="Emergency contact" description="Who we call if something happens on site" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("emergencyName", "Name")}
          {field("emergencyPhone", "Phone")}
          {field("emergencyRelationship", "Relationship", "text", "e.g. Sister")}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader icon={<Phone className="h-4 w-4" />} title="Next of kin & guarantor" description="For your employment record" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("nextOfKinName", "Next of kin")}
          {field("nextOfKinPhone", "Phone")}
          {field("nextOfKinRelationship", "Relationship")}
          {field("guarantorName", "Guarantor")}
          {field("guarantorPhone", "Guarantor phone")}
          {field("guarantorAddress", "Guarantor address")}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader icon={<Landmark className="h-4 w-4" />} title="Bank details" description="How you get paid" />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Only you and the founder can see these. Nobody else on the team can.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("bankName", "Bank")}
          {field("bankAccountName", "Account name")}
          {field("bankAccount", "Account number")}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save profile
        </Button>
      </div>
    </form>
  );
}
