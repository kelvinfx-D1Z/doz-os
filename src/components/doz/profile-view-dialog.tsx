"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

// Read-only view of a team member's employment record, for the founder.
// Fetches /api/doz/profile?userId=… which returns bank details only to the
// founder, the record's owner, or someone explicitly granted access.
interface Props {
  userId: string | null;
  userName: string;
  onOpenChange: (open: boolean) => void;
}

interface Profile {
  name: string; email: string; role: string; title: string | null;
  phone: string | null; address: string | null;
  dateOfBirth: string | null; startDate: string | null; idNumber: string | null;
  emergencyName: string | null; emergencyPhone: string | null; emergencyRelationship: string | null;
  nextOfKinName: string | null; nextOfKinPhone: string | null; nextOfKinRelationship: string | null;
  guarantorName: string | null; guarantorPhone: string | null; guarantorAddress: string | null;
  bankName?: string | null; bankAccount?: string | null; bankAccountName?: string | null;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">
        {value ? value : <span className="text-muted-foreground/60">Not provided</span>}
      </span>
    </div>
  );
}

export function ProfileViewDialog({ userId, userName, onOpenChange }: Props) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`/api/doz/profile?userId=${encodeURIComponent(userId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
        return j;
      })
      .then((j) => { if (!cancelled) { setP(j.profile); setErr(null); } })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [userId]);

  const date = (v: string | null | undefined) => (v ? formatDate(v) : null);

  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{p?.name ?? userName}</DialogTitle>
          <DialogDescription>
            Employment record. They maintain this themselves from My Profile.
          </DialogDescription>
        </DialogHeader>

        {err ? (
          <p className="text-sm text-destructive">{err}</p>
        ) : !p ? (
          <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline">{p.role}</Badge>
                {p.title && <span className="text-xs text-muted-foreground">{p.title}</span>}
              </div>
              <Row label="Email (username)" value={p.email} />
              <Row label="Phone" value={p.phone} />
              <Row label="Date of birth" value={date(p.dateOfBirth)} />
              <Row label="Start date" value={date(p.startDate)} />
              <Row label="ID / NIN" value={p.idNumber} />
              <Row label="Address" value={p.address} />
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Emergency contact</p>
              <Row label="Name" value={p.emergencyName} />
              <Row label="Phone" value={p.emergencyPhone} />
              <Row label="Relationship" value={p.emergencyRelationship} />
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next of kin & guarantor</p>
              <Row label="Next of kin" value={p.nextOfKinName} />
              <Row label="Phone" value={p.nextOfKinPhone} />
              <Row label="Relationship" value={p.nextOfKinRelationship} />
              <Row label="Guarantor" value={p.guarantorName} />
              <Row label="Guarantor phone" value={p.guarantorPhone} />
              <Row label="Guarantor address" value={p.guarantorAddress} />
            </div>

            {("bankAccount" in p) && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bank details</p>
                <Row label="Bank" value={p.bankName} />
                <Row label="Account name" value={p.bankAccountName} />
                <Row label="Account number" value={p.bankAccount} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
