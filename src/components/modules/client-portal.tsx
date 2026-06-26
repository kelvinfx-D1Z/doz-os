"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatNGN, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  FileText,
  CreditCard,
  Building2,
  Calendar,
  MapPin,
  ArrowLeft,
  Send,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Video,
  Camera,
  Radio,
  FileCheck,
  XCircle,
  Star,
  Inbox,
} from "lucide-react";

// ============================================================
// Client Portal — Digit One Zero Ltd
// Client-facing view (no DOZ OS login). Accessed via ?portal=TOKEN
// Light theme override (NOT the dark DOZ OS dashboard).
// ============================================================

interface PortalDeliverable {
  id: string;
  title: string;
  type: string | null;
  status: string;
  dueDate: string | null;
  clientApproved: boolean;
  clientApprovedAt: string | null;
  clientApprovalNote: string | null;
  clientRejectedAt: string | null;
  deliveredAt: string | null;
}

interface PortalProject {
  id: string;
  name: string;
  code: string | null;
  serviceType: string;
  status: string;
  eventDate: string | null;
  venue: string | null;
  progress: number;
  deliverables: PortalDeliverable[];
}

interface PortalPaymentConfirmation {
  id: string;
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

interface PortalInvoice {
  id: string;
  code: string | null;
  amount: number;
  tax: number;
  amountPaid: number;
  balance: number;
  status: string;
  issuedDate: string;
  dueDate: string | null;
  project: { name: string } | null;
  paymentConfirmations: PortalPaymentConfirmation[];
}

interface TopLevelConfirmation {
  id: string;
  invoiceCode: string;
  amount: number;
  method: string | null;
  reference: string | null;
  status: string;
  createdAt: string;
}

interface PortalData {
  account: {
    name: string;
    industry: string | null;
    isStrategic: boolean;
  };
  projects: PortalProject[];
  invoices: PortalInvoice[];
  paymentConfirmations: TopLevelConfirmation[];
}

// ---------- Status helpers (light-theme variants) ----------
function projectStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "PLANNING":
      return { label: "Planning", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
    case "CONFIRMED":
      return { label: "Confirmed", cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "IN_PROGRESS":
      return { label: "In Progress", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "COMPLETED":
      return { label: "Completed", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "ON_HOLD":
      return { label: "On Hold", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    case "CANCELLED":
      return { label: "Cancelled", cls: "bg-red-100 text-red-700 border-red-200" };
    default:
      return { label: status, cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  }
}

function deliverableStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "PENDING":
      return { label: "Pending", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
    case "IN_PROGRESS":
      return { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "REVIEW":
      return { label: "Awaiting Review", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    case "DELIVERED":
      return { label: "Delivered", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    default:
      return { label: status, cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  }
}

function invoiceStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
    case "SENT":
      return { label: "Sent", cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "PARTIAL":
      return { label: "Partial", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    case "PAID":
      return { label: "Paid", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "OVERDUE":
      return { label: "Overdue", cls: "bg-red-100 text-red-700 border-red-200" };
    default:
      return { label: status, cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  }
}

function confirmationStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "PENDING":
      return { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    case "VERIFIED":
      return { label: "Verified", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "REJECTED":
      return { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" };
    default:
      return { label: status, cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  }
}

function deliverableTypeIcon(type: string | null) {
  switch (type) {
    case "VIDEO":
      return <Video className="h-4 w-4 text-emerald-600" />;
    case "PHOTO":
      return <Camera className="h-4 w-4 text-emerald-600" />;
    case "LIVESTREAM":
      return <Radio className="h-4 w-4 text-emerald-600" />;
    case "DOCUMENT":
      return <FileCheck className="h-4 w-4 text-emerald-600" />;
    default:
      return <FileText className="h-4 w-4 text-emerald-600" />;
  }
}

function serviceTypeLabel(t: string): string {
  return t
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isInvoiceOverdue(inv: PortalInvoice): boolean {
  if (inv.status === "OVERDUE") return true;
  if (inv.dueDate && inv.balance > 0) {
    return new Date(inv.dueDate).getTime() < Date.now();
  }
  return false;
}

// ============================================================
// Main component
// ============================================================
export function ClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/doz/portal?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) {
          if (alive) {
            setError("invalid_token");
            setLoading(false);
          }
          return;
        }
        if (!res.ok) {
          if (alive) {
            setError("fetch_error");
            setLoading(false);
          }
          return;
        }
        const json = (await res.json()) as PortalData;
        if (alive) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError("fetch_error");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/doz/portal?token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as PortalData;
      setData(json);
      setError(null);
    } catch {
      // ignore refresh errors — keep existing data
    }
  }, [token]);

  if (loading) return <LoadingScreen />;
  if (error === "invalid_token") return <InvalidTokenScreen />;
  if (error || !data) return <InvalidTokenScreen />;

  const openInvoices = data.invoices.filter((i) => i.balance > 0).length;
  const pendingConfirmations = data.paymentConfirmations.filter(
    (c) => c.status === "PENDING"
  ).length;
  const pendingDeliverables = data.projects.reduce(
    (sum, p) =>
      sum +
      p.deliverables.filter(
        (d) =>
          (d.status === "REVIEW" || d.status === "DELIVERED") &&
          !d.clientApproved
      ).length,
    0
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* ---------- Header ---------- */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Logo10 />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-zinc-900">
                    Digit One Zero Ltd
                  </span>
                  <Badge className="border-emerald-200 bg-emerald-50 text-[10px] uppercase tracking-wider text-emerald-700">
                    Client Portal
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">
                  Event production &amp; media partner
                </p>
              </div>
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 self-start rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 sm:self-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Exit portal
            </a>
          </div>

          <div className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Welcome, {data.account.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Your project portal — track progress, approve deliverables,
              confirm payments.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {data.account.industry && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">
                  <Building2 className="h-3 w-3" />
                  {data.account.industry}
                </span>
              )}
              {data.account.isStrategic && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  Strategic partner
                </span>
              )}
            </div>
          </div>

          {/* Quick stat strip */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip
              icon={<FileText className="h-4 w-4" />}
              label="Active projects"
              value={String(
                data.projects.filter((p) =>
                  ["CONFIRMED", "IN_PROGRESS", "PLANNING"].includes(p.status)
                ).length
              )}
              tone="default"
            />
            <StatChip
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Awaiting your approval"
              value={String(pendingDeliverables)}
              tone={pendingDeliverables > 0 ? "amber" : "default"}
            />
            <StatChip
              icon={<CreditCard className="h-4 w-4" />}
              label="Open invoices"
              value={String(openInvoices)}
              tone={openInvoices > 0 ? "amber" : "default"}
            />
            <StatChip
              icon={<Clock className="h-4 w-4" />}
              label="Pending confirmations"
              value={String(pendingConfirmations)}
              tone={pendingConfirmations > 0 ? "amber" : "default"}
            />
          </div>
        </div>
      </header>

      {/* ---------- Main content ---------- */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="bg-zinc-100 p-1">
            <TabsTrigger
              value="projects"
              className="data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
            >
              Projects
            </TabsTrigger>
            <TabsTrigger
              value="invoices"
              className="data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
            >
              Invoices
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
            >
              Payment Confirmations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-6">
            <ProjectsTab data={data} refresh={refresh} token={token} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <InvoicesTab data={data} refresh={refresh} token={token} />
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <PaymentConfirmationsTab data={data} />
          </TabsContent>
        </Tabs>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="mt-12 border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>
                Secure client portal — your data is private to{" "}
                {data.account.name} and Digit One Zero Ltd.
              </span>
            </div>
            <span>
              © {new Date().getFullYear()} Digit One Zero Ltd. All rights
              reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Loading + Error screens
// ============================================================
function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 text-zinc-900">
      <Logo10 large pulsing />
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
        Loading your portal…
      </div>
    </div>
  );
}

function InvalidTokenScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-zinc-50 px-6 text-center text-zinc-900">
      <Logo10 large />
      <div className="max-w-md">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-6 w-6 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900">
          This portal link is no longer valid
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Please contact your Digit One Zero project lead for access. We&apos;ll
          be happy to issue a new secure link.
        </p>
        <a
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to homepage
        </a>
      </div>
    </div>
  );
}

// ============================================================
// Logo + small UI atoms
// ============================================================
function Logo10({
  large = false,
  pulsing = false,
}: {
  large?: boolean;
  pulsing?: boolean;
}) {
  const size = large ? "h-12 w-12 text-xl" : "h-9 w-9 text-base";
  return (
    <div
      className={`flex ${size} items-center justify-center rounded-xl bg-emerald-600 font-black tracking-tight text-white shadow-sm ${pulsing ? "animate-pulse" : ""}`}
    >
      10
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "amber";
}) {
  const ring =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-zinc-200 bg-white";
  const iconCls = tone === "amber" ? "text-amber-600" : "text-emerald-600";
  const valCls = tone === "amber" ? "text-amber-700" : "text-zinc-900";
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border ${ring} px-3 py-2.5`}>
      <div className={iconCls}>{icon}</div>
      <div>
        <div className={`text-base font-bold leading-none ${valCls}`}>
          {value}
        </div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Projects tab
// ============================================================
function ProjectsTab({
  data,
  refresh,
  token,
}: {
  data: PortalData;
  refresh: () => Promise<void>;
  token: string;
}) {
  if (data.projects.length === 0) {
    return <EmptyState icon={<FileText />} title="No projects yet" subtitle="Your active and past projects will appear here." />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.projects.map((p) => (
        <ProjectCard key={p.id} project={p} refresh={refresh} token={token} />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  refresh,
  token,
}: {
  project: PortalProject;
  refresh: () => Promise<void>;
  token: string;
}) {
  const sb = projectStatusBadge(project.status);
  return (
    <Card className="flex flex-col gap-4 border-zinc-200 bg-white p-5 shadow-sm">
      {/* header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {project.code && (
              <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                {project.code}
              </div>
            )}
            <h3 className="truncate text-base font-semibold text-zinc-900">
              {project.name}
            </h3>
          </div>
          <Badge className={`shrink-0 border ${sb.cls}`}>{sb.label}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3 text-emerald-600" />
            {serviceTypeLabel(project.serviceType)}
          </span>
          {project.eventDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 text-emerald-600" />
              {formatDate(project.eventDate)}
            </span>
          )}
          {project.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-emerald-600" />
              {project.venue}
            </span>
          )}
        </div>
      </div>

      {/* progress */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-zinc-600">Progress</span>
          <span className="font-semibold text-zinc-900">
            {project.progress}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
          />
        </div>
      </div>

      {/* deliverables */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Deliverables ({project.deliverables.length})
          </h4>
        </div>
        {project.deliverables.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
            No deliverables tracked yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {project.deliverables.map((d) => (
              <DeliverableRow
                key={d.id}
                deliverable={d}
                refresh={refresh}
                token={token}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DeliverableRow({
  deliverable,
  refresh,
  token,
}: {
  deliverable: PortalDeliverable;
  refresh: () => Promise<void>;
  token: string;
}) {
  const sb = deliverableStatusBadge(deliverable.status);
  const canAct =
    (deliverable.status === "REVIEW" || deliverable.status === "DELIVERED") &&
    !deliverable.clientApproved;

  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch("/api/doz/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "approve_deliverable",
          deliverableId: deliverable.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to approve");
      }
      toast.success("Deliverable approved — thank you!");
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not approve deliverable"
      );
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectNote.trim()) {
      toast.error("Please describe what needs to change.");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch("/api/doz/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "reject_deliverable",
          deliverableId: deliverable.id,
          note: rejectNote.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to submit request");
      }
      toast.success("Change request submitted — we'll be in touch shortly.");
      setRejectOpen(false);
      setRejectNote("");
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not submit change request"
      );
    } finally {
      setRejecting(false);
    }
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0">
            {deliverableTypeIcon(deliverable.type)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-900">
              {deliverable.title}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              {deliverable.dueDate && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due {formatDate(deliverable.dueDate)}
                </span>
              )}
              {deliverable.deliveredAt && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Delivered {formatDate(deliverable.deliveredAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <Badge className={`shrink-0 border ${sb.cls}`}>{sb.label}</Badge>
      </div>

      {/* Approval state */}
      {deliverable.clientApproved && deliverable.clientApprovedAt && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            Approved on {formatDate(deliverable.clientApprovedAt)}
            {deliverable.clientApprovalNote && (
              <span className="block text-emerald-700">
                “{deliverable.clientApprovalNote}”
              </span>
            )}
          </span>
        </div>
      )}
      {!deliverable.clientApproved && deliverable.clientRejectedAt && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            Changes requested on {formatDate(deliverable.clientRejectedAt)}
            {deliverable.clientApprovalNote && (
              <span className="block text-amber-700">
                “{deliverable.clientApprovalNote}”
              </span>
            )}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {canAct && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            onClick={handleApprove}
            disabled={approving}
            size="sm"
            className="h-8 bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve
          </Button>
          <Button
            onClick={() => setRejectOpen(true)}
            disabled={approving}
            size="sm"
            variant="outline"
            className="h-8 border-amber-300 bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Request Changes
          </Button>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="border-zinc-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">
              Request changes — {deliverable.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Let us know what needs to change. We&apos;ll get back to you
              within one business day.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-note" className="text-zinc-700">
                Notes <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. The logo is too small in the lower-third. Please increase by 20%."
                rows={4}
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-emerald-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={rejecting}
              className="border-zinc-200 text-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting || !rejectNote.trim()}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {rejecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

// ============================================================
// Invoices tab
// ============================================================
function InvoicesTab({
  data,
  refresh,
  token,
}: {
  data: PortalData;
  refresh: () => Promise<void>;
  token: string;
}) {
  if (data.invoices.length === 0) {
    return (
      <EmptyState
        icon={<CreditCard />}
        title="No invoices"
        subtitle="Invoices issued to your account will appear here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {data.invoices.map((inv) => (
        <InvoiceRow key={inv.id} invoice={inv} refresh={refresh} token={token} />
      ))}
    </div>
  );
}

function InvoiceRow({
  invoice,
  refresh,
  token,
}: {
  invoice: PortalInvoice;
  refresh: () => Promise<void>;
  token: string;
}) {
  const sb = invoiceStatusBadge(invoice.status);
  const overdue = isInvoiceOverdue(invoice);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card className="border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* left: invoice meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-900">
              {invoice.code ?? "—"}
            </span>
            <Badge className={`border ${sb.cls}`}>{sb.label}</Badge>
            {overdue && invoice.status !== "PAID" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                <AlertCircle className="h-3 w-3" />
                Past due
              </span>
            )}
          </div>
          {invoice.project && (
            <div className="mt-1 text-sm text-zinc-600">
              {invoice.project.name}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Issued {formatDate(invoice.issuedDate)}
            </span>
            {invoice.dueDate && (
              <span
                className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-red-600" : ""}`}
              >
                <Clock className="h-3 w-3" />
                Due {formatDate(invoice.dueDate)}
              </span>
            )}
          </div>
        </div>

        {/* right: amounts + action */}
        <div className="flex flex-row flex-wrap items-end gap-x-6 gap-y-2 lg:flex-col lg:items-end lg:gap-1">
          <Amount label="Total" value={formatNGN(invoice.amount)} cls="text-zinc-900" />
          <Amount
            label="Paid"
            value={formatNGN(invoice.amountPaid)}
            cls="text-emerald-700"
          />
          <Amount
            label="Balance"
            value={formatNGN(invoice.balance)}
            cls={invoice.balance > 0 ? "text-amber-700" : "text-emerald-700"}
          />
        </div>
      </div>

      {invoice.balance > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-500">
            Made a payment? Submit a confirmation and our team will verify it.
          </p>
          <Button
            onClick={() => setConfirmOpen(true)}
            size="sm"
            className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <CreditCard className="h-4 w-4" />
            Confirm Payment
          </Button>
        </div>
      )}

      {/* Existing confirmations */}
      {invoice.paymentConfirmations.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Payment confirmations ({invoice.paymentConfirmations.length})
          </div>
          <ul className="flex flex-col gap-1.5">
            {invoice.paymentConfirmations.map((pc) => {
              const cs = confirmationStatusBadge(pc.status);
              return (
                <li
                  key={pc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-zinc-900">
                      {formatNGN(pc.amount)}
                    </span>
                    {pc.method && (
                      <span className="text-zinc-500">{pc.method.replace("_", " ")}</span>
                    )}
                    {pc.reference && (
                      <span className="font-mono text-zinc-500">
                        Ref: {pc.reference}
                      </span>
                    )}
                    <span className="text-zinc-400">
                      {relativeTime(pc.createdAt)}
                    </span>
                  </div>
                  <Badge className={`border ${cs.cls}`}>{cs.label}</Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmPaymentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        invoice={invoice}
        refresh={refresh}
        token={token}
      />
    </Card>
  );
}

function Amount({
  label,
  value,
  cls,
}: {
  label: string;
  value: string;
  cls: string;
}) {
  return (
    <div className="text-right">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`text-sm font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function ConfirmPaymentDialog({
  open,
  onOpenChange,
  invoice,
  refresh,
  token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: PortalInvoice;
  refresh: () => Promise<void>;
  token: string;
}) {
  const [amount, setAmount] = useState<string>(String(invoice.balance || ""));
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset fields whenever this invoice changes / dialog opens
  useEffect(() => {
    if (open) {
      setAmount(String(invoice.balance || ""));
      setMethod("BANK_TRANSFER");
      setReference("");
      setNote("");
    }
  }, [open, invoice.balance]);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "confirm_payment",
          invoiceId: invoice.id,
          amount: amt,
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to submit confirmation");
      }
      toast.success(
        "Payment confirmation submitted — we'll verify and update your invoice."
      );
      onOpenChange(false);
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not submit confirmation"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-900">
            Confirm payment — {invoice.code}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <div className="flex items-center justify-between">
              <span>Outstanding balance</span>
              <span className="font-bold">{formatNGN(invoice.balance)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-zinc-700">
              Amount paid (₦) <span className="text-red-600">*</span>
            </Label>
            <Input
              id="pay-amount"
              type="number"
              min={1}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-zinc-200 bg-white text-zinc-900 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-700">
              Payment method <span className="text-red-600">*</span>
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="border-zinc-200 bg-white text-zinc-900 focus-visible:ring-emerald-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref" className="text-zinc-700">
              Payment reference / Transaction ID
            </Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. GTB/INV/0042/25"
              className="border-zinc-200 bg-white text-zinc-900 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-note" className="text-zinc-700">
              Note (optional)
            </Label>
            <Textarea
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional information for our finance team"
              rows={3}
              className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="flex items-start gap-1.5 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>
              Your confirmation will be reviewed by our team. The invoice
              status will update once verified.
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-zinc-200 text-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit confirmation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Payment confirmations tab
// ============================================================
function PaymentConfirmationsTab({ data }: { data: PortalData }) {
  const list = data.paymentConfirmations;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          Confirmations are reviewed by our team. Once verified, your invoice
          will be updated automatically.
        </span>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No payment confirmations yet"
          subtitle="When you submit a payment confirmation, it will appear here for tracking."
        />
      ) : (
        <Card className="overflow-hidden border-zinc-200 bg-white p-0 shadow-sm">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list.map((pc) => {
                  const cs = confirmationStatusBadge(pc.status);
                  return (
                    <tr key={pc.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                        {pc.invoiceCode}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">
                        {formatNGN(pc.amount)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {pc.method ? pc.method.replace("_", " ") : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {pc.reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {relativeTime(pc.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`border ${cs.cls}`}>{cs.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <ul className="divide-y divide-zinc-100 md:hidden">
            {list.map((pc) => {
              const cs = confirmationStatusBadge(pc.status);
              return (
                <li key={pc.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-zinc-500">
                        {pc.invoiceCode}
                      </div>
                      <div className="text-base font-bold text-zinc-900">
                        {formatNGN(pc.amount)}
                      </div>
                    </div>
                    <Badge className={`border ${cs.cls}`}>{cs.label}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                    {pc.method && (
                      <span>{pc.method.replace("_", " ")}</span>
                    )}
                    {pc.reference && (
                      <span className="font-mono">Ref: {pc.reference}</span>
                    )}
                    <span>{relativeTime(pc.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Empty state
// ============================================================
function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
        {icon}
      </div>
      <div>
        <div className="text-base font-semibold text-zinc-900">{title}</div>
        <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      </div>
    </div>
  );
}
