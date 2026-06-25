"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Truck,
  CheckCircle2,
  XCircle,
  FileText,
  Building2,
  Star,
  Clock,
  Phone,
  Mail,
  Banknote,
  Users,
  Plus,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, formatNGN } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// VendorApplications — staff/founder review panel
// Renders inside Procurement "Onboarding" tab. Calls /api/doz/vendors.
// ============================================================

interface VendorApplication {
  id: string;
  companyName: string;
  category: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  cacNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  references: string | null;
  notes: string | null;
  status: string;
  vendorId: string | null;
  createdAt: string;
}

interface Vendor {
  id: string;
  name: string;
  category: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  rating: number;
  totalSpent: number;
  isActive: boolean;
  createdAt: string;
}

interface VendorsData {
  applications: VendorApplication[];
  vendors: Vendor[];
  stats: {
    pending: number;
    approved: number;
    rejected: number;
    totalVendors: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipment",
  CATERING: "Catering",
  DECOR: "Decor",
  PRINTING: "Printing",
  TRANSPORT: "Transport",
  SOUND: "Sound",
  LIGHTING: "Lighting",
  LED_SCREEN: "LED Screen",
  STAGE: "Stage",
  OTHER: "Other",
};

function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c.replace(/_/g, " ");
}

function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(
            i <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground/40"
          )}
        />
      ))}
    </span>
  );
}

// ------------------------------------------------------------
// Application Card
// ------------------------------------------------------------
function ApplicationCard({
  app,
  acting,
  onAction,
}: {
  app: VendorApplication;
  acting: string | null;
  onAction: (id: string, action: "APPROVE" | "REJECT") => void;
}) {
  const refs = app.references
    ? app.references
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean)
    : [];

  const isPending = app.status === "PENDING";
  const isApproved = app.status === "APPROVED";
  const isRejected = app.status === "REJECTED";

  return (
    <Card
      className={cn(
        "p-4 transition-colors sm:p-5",
        isPending && "ring-1 ring-amber-500/20",
        isApproved && "ring-1 ring-primary/20",
        isRejected && "opacity-80"
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold tracking-tight">{app.companyName}</p>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {categoryLabel(app.category)}
            </Badge>
            <StatusBadge status={app.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Submitted {relativeTime(app.createdAt)} · {formatDate(app.createdAt)}
          </p>
        </div>

        {/* Status pill */}
        {isApproved && (
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            APPROVED → VENDOR CREATED
          </div>
        )}
        {isRejected && (
          <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-400">
            <XCircle className="h-3.5 w-3.5" />
            REJECTED
          </div>
        )}
        {isPending && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            AWAITING REVIEW
          </div>
        )}
      </div>

      {/* Body grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Contact */}
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Contact
          </p>
          <p className="text-xs font-medium">{app.contactName}</p>
          {app.phone && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="font-mono">{app.phone}</span>
            </p>
          )}
          {app.email && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span className="truncate">{app.email}</span>
            </p>
          )}
        </div>

        {/* Business */}
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-3 w-3" /> Business
          </p>
          {app.cacNumber ? (
            <p className="text-xs text-muted-foreground">
              CAC: <span className="font-mono text-foreground">{app.cacNumber}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">CAC: —</p>
          )}
          {app.bankName || app.bankAccount ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Banknote className="h-3 w-3" />
              <span className="truncate">
                {app.bankName ?? "—"} — {app.bankAccount ?? "—"}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Banknote className="h-3 w-3" />
              Bank: —
            </p>
          )}
        </div>
      </div>

      {/* References */}
      {refs.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Star className="h-3 w-3" /> Past Clients / References
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {refs.map((r, i) => (
              <li
                key={i}
                className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/80"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {app.notes && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notes / Capabilities
          </p>
          <p className="whitespace-pre-wrap text-xs text-foreground/80">{app.notes}</p>
        </div>
      )}

      {/* Approved: vendor link */}
      {isApproved && app.vendorId && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Vendor record created:</span>
          <span className="font-mono font-semibold text-primary">{app.vendorId.slice(-8)}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <ExternalLink className="h-3 w-3" /> See Vendors tab
          </span>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            disabled={acting === app.id}
            onClick={() => onAction(app.id, "REJECT")}
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={acting === app.id}
            onClick={() => onAction(app.id, "APPROVE")}
          >
            {acting === app.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve &amp; Create Vendor
          </Button>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Vendors table (existing vendors, compact)
// ------------------------------------------------------------
function VendorsTable({ vendors }: { vendors: Vendor[] }) {
  const maxSpent = Math.max(1, ...vendors.map((v) => v.totalSpent));
  if (vendors.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="h-8 w-8" />}
        title="No active vendors yet"
        hint="Approve applications to build your vendor network."
      />
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px]">Vendor</TableHead>
            <TableHead className="text-[10px]">Category</TableHead>
            <TableHead className="text-[10px]">Rating</TableHead>
            <TableHead className="text-right text-[10px]">Total Spent</TableHead>
            <TableHead className="text-[10px]">Status</TableHead>
            <TableHead className="text-[10px]">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="py-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{v.name}</span>
                  {v.contactName && (
                    <span className="text-[10px] text-muted-foreground">{v.contactName}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {categoryLabel(v.category)}
                </Badge>
              </TableCell>
              <TableCell className="py-2.5">
                <div className="flex items-center gap-1.5">
                  <Stars rating={v.rating} />
                  <span className="text-[10px] text-muted-foreground">{v.rating.toFixed(1)}</span>
                </div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {formatNGN(v.totalSpent, true)}
                  </span>
                  <div className="w-20">
                    <MiniBar value={v.totalSpent} max={maxSpent} color="bg-primary" />
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                {v.isActive ? (
                  <Badge className="h-5 gap-1 bg-primary/15 px-1.5 text-[9px] text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" /> ACTIVE
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
                    INACTIVE
                  </Badge>
                )}
              </TableCell>
              <TableCell className="py-2.5 text-xs text-muted-foreground">
                {formatDate(v.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ------------------------------------------------------------
// Loading skeleton
// ------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------
export function VendorApplications() {
  const [data, setData] = useState<VendorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doz/vendors", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VendorsData;
      setData(json);
    } catch (e) {
      console.error(e);
      setError("Failed to load vendor applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(id: string, action: "APPROVE" | "REJECT") {
    const app = data?.applications.find((a) => a.id === id);
    if (!app) return;

    setActing(id);
    try {
      const res = await fetch("/api/doz/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id, action }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? `Failed to ${action.toLowerCase()} application`);
        return;
      }

      const json = await res.json();
      if (action === "APPROVE") {
        toast.success(`${app.companyName} approved`, {
          description: `Vendor "${json.vendor?.name ?? app.companyName}" created and linked.`,
        });
      } else {
        toast.success(`${app.companyName} rejected`, {
          description: "Application marked as rejected.",
        });
      }
      await load();
    } catch {
      toast.error("Network error — please retry");
    } finally {
      setActing(null);
    }
  }

  // ---------- Loading ----------
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Vendor Onboarding"
          description="Review applications and grow your vendor network"
          icon={<Truck className="h-5 w-5" />}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  // ---------- Error ----------
  if (error || !data) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Vendor Onboarding"
          description="Review applications and grow your vendor network"
          icon={<Truck className="h-5 w-5" />}
        />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title={error ?? "Could not load applications"}
          hint="Please try again."
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={load} className="h-8 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const { applications, vendors, stats } = data;
  const filtered =
    filter === "ALL" ? applications : applications.filter((a) => a.status === filter);
  const activeVendors = vendors.filter((v) => v.isActive);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Vendor Onboarding"
        description="Review applications and grow your vendor network"
        icon={<Truck className="h-5 w-5" />}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          sub="Awaiting review"
          icon={<Clock className="h-4 w-4 text-amber-400" />}
          accent="warning"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          sub="Converted to vendors"
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          accent="primary"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          sub="Declined applications"
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
          accent="danger"
        />
        <StatCard
          label="Total Vendors"
          value={stats.totalVendors}
          sub={`${activeVendors.length} active`}
          icon={<Truck className="h-4 w-4 text-primary" />}
        />
      </div>

      {/* Applications */}
      <div>
        <SectionHeader
          title={`Applications — ${filtered.length}`}
          description="Public submissions from prospective vendors"
          icon={<FileText className="h-5 w-5" />}
        />

        {/* Filter pills */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => {
            const count =
              f === "ALL"
                ? applications.length
                : applications.filter((a) => a.status === f).length;
            return (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                className={cn(
                  "h-7 gap-1.5 text-xs",
                  filter === f && "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
                onClick={() => setFilter(f)}
              >
                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-4 px-1 text-[9px]",
                    filter === f
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={
                filter === "ALL"
                  ? "No applications yet"
                  : `No ${filter.toLowerCase()} applications`
              }
              hint={
                filter === "ALL"
                  ? "Open the Vendor Apply Form to invite suppliers to apply."
                  : "Try a different filter or refresh the list."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {filtered.map((app) => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  acting={acting}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Existing vendors */}
      <div>
        <SectionHeader
          title={`Active Vendor Network — ${vendors.length}`}
          description="Vendors created from approved applications or seeded"
          icon={<Truck className="h-5 w-5" />}
        />
        <div className="mt-4">
          <VendorsTable vendors={vendors} />
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <span>
          Use the <span className="font-medium text-foreground">Vendor Apply Form</span>{" "}
          button in the procurement header to open the public application form for
          prospective suppliers.
        </span>
      </div>
    </div>
  );
}
