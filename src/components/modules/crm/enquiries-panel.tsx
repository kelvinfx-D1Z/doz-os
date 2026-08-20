"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Inbox, Target, Trash2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Everything captured by the one-line box at the top of the page lands here.
// Before this existed, an enquiry was written to the database and then became
// invisible — there was no tab rendering leads at all, so the capture box
// looked like it did nothing.
export type Enquiry = {
  id: string;
  contactName: string;
  company: string | null;
  source: string;
  sourceDetail: string | null;
  status: string;
  value: number;
  serviceInterest: string | null;
  direction?: string;
  createdAt: string;
};

type Filter = "ALL" | "INBOUND" | "OUTBOUND" | "OPEN";

const STATUS_TONE: Record<string, string> = {
  NEW: "bg-sky-500/15 text-sky-300",
  QUALIFIED: "bg-amber-500/15 text-amber-300",
  CONVERTED: "bg-emerald-500/15 text-emerald-300",
  LOST: "bg-muted text-muted-foreground",
};

export function EnquiriesPanel({
  enquiries,
  onChanged,
  canEdit,
}: {
  enquiries: Enquiry[];
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    ALL: enquiries.length,
    OPEN: enquiries.filter((e) => e.status === "NEW" || e.status === "QUALIFIED").length,
    INBOUND: enquiries.filter((e) => (e.direction ?? "INBOUND") === "INBOUND").length,
    OUTBOUND: enquiries.filter((e) => e.direction === "OUTBOUND").length,
  }), [enquiries]);

  const shown = useMemo(() => {
    const list = enquiries.filter((e) => {
      if (filter === "ALL") return true;
      if (filter === "OPEN") return e.status === "NEW" || e.status === "QUALIFIED";
      return (e.direction ?? "INBOUND") === filter;
    });
    // Newest first — an enquiry logged today is the one you act on.
    return list.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [enquiries, filter]);

  async function act(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusyId(id);
    try {
      const r = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(okMsg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "OPEN", label: "Open" },
    { key: "INBOUND", label: "They asked" },
    { key: "OUTBOUND", label: "I'm chasing" },
    { key: "ALL", label: "All" },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={<Inbox className="h-4 w-4" />}
          title="Enquiries"
          description={`${counts.OPEN} open · ${counts.INBOUND} came to us · ${counts.OUTBOUND} we're chasing`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={filter === "OPEN" ? "Nothing open" : "No enquiries yet"}
            hint="Use the box at the top of this page: type a name, press Enter."
          />
        </div>
      ) : (
        <div className="scroll-thin mt-4 max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Who</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>How</TableHead>
                <TableHead>Logged</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Move it on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((e) => {
                const busy = busyId === e.id;
                const closed = e.status === "CONVERTED" || e.status === "LOST";
                return (
                  <TableRow key={e.id} className={cn(closed && "opacity-60")}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {e.direction === "OUTBOUND" && <Target className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{e.contactName}</span>
                      </div>
                      {e.serviceInterest && (
                        <p className="text-[11px] text-muted-foreground">{e.serviceInterest}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.company ?? "—"}</TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground">
                        {e.source?.toLowerCase().replace("_", " ")}
                        {e.sourceDetail ? ` · ${e.sourceDetail}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{relativeTime(e.createdAt)}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]", STATUS_TONE[e.status] ?? "bg-muted")}>
                        {e.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {!closed && e.status === "NEW" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                              onClick={() => act(e.id, { action: "update_lead", leadId: e.id, status: "QUALIFIED" }, "Marked as worth chasing")}>
                              Worth chasing
                            </Button>
                          )}
                          {!closed && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-400" disabled={busy}
                                onClick={() => act(e.id, { action: "update_lead", leadId: e.id, status: "CONVERTED" }, "Marked as won")}>
                                <Check className="h-3 w-3" /> Won
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy}
                                onClick={() => act(e.id, { action: "update_lead", leadId: e.id, status: "LOST" }, "Marked as lost")}>
                                <X className="h-3 w-3" /> Lost
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={busy}
                            aria-label={`Delete enquiry from ${e.contactName}`}
                            onClick={() => {
                              if (!window.confirm(`Delete the enquiry from ${e.contactName}?\n\nThis cannot be undone.`)) return;
                              act(e.id, { action: "delete_lead", leadId: e.id }, "Enquiry deleted");
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
