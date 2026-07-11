"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Truck,
  FileText,
  Star,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Users2,
  Clock,
  Wallet,
  TrendingUp,
  ChevronDown,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorApplications } from "@/components/doz/vendor-applications";
import { AddVendorForm } from "@/components/doz/vendor-apply";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatCard, StatusBadge, SectionHeader, EmptyState, MiniBar } from "@/components/doz/ui-primitives";
import { formatNGN, formatDate, relativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================
interface Stats {
  pendingApprovals: number;
  pendingPaymentsValue: number;
  openRfqs: number;
  totalVendorSpend: number;
  activeVendors: number;
  overduePayments: number;
  segregationViolations: number;
  avgVendorRating: number;
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
  _count: { quotes: number; pos: number };
}

interface Quote {
  id: string;
  amount: number;
  deliveryDays: number | null;
  notes: string | null;
  isRecommended: boolean;
  isApproved: boolean;
  vendor: { name: string; rating: number };
}

interface Rfq {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  budget: number | null;
  status: string;
  neededBy: string | null;
  project: { name: string } | null;
  quotes: Quote[];
}

interface PurchaseOrder {
  id: string;
  code: string | null;
  vendor: { name: string };
  project: { name: string } | null;
  amount: number;
  description: string | null;
  status: string;
  issuedAt: string | null;
}

interface Person {
  name: string;
  role: string;
}

interface PaymentRequest {
  id: string;
  code: string | null;
  amount: number;
  description: string | null;
  status: string;
  requesterId: string;
  approverId: string | null;
  payerId: string | null;
  requester: Person;
  approver: Person | null;
  payer: Person | null;
  project: { name: string } | null;
  purchaseOrder: { code: string | null } | null;
  requestedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
}

interface Approval {
  id: string;
  entityType: string;
  entityId: string;
  decision: string;
  comment: string | null;
  approver: { name: string };
  createdAt: string;
}

interface ProcurementData {
  stats: Stats;
  vendors: Vendor[];
  rfqs: Rfq[];
  purchaseOrders: PurchaseOrder[];
  paymentRequests: PaymentRequest[];
  approvals: Approval[];
}

// ============================================================
// Helpers
// ============================================================
const ROLE_LABEL: Record<string, string> = {
  FOUNDER: "Founder",
  STAFF: "Staff",
  INTERN: "Intern",
  FREELANCER: "Freelancer",
};

function RoleBadge({ role }: { role: string }) {
  const color =
    role === "FOUNDER"
      ? "bg-primary/15 text-primary"
      : role === "STAFF"
      ? "bg-teal-500/15 text-teal-300"
      : role === "INTERN"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", color)}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(
            i <= rating ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/40"
          )}
        />
      ))}
    </span>
  );
}

// ============================================================
// 3-step segregation indicator
// ============================================================
function SegregationSteps({ pr }: { pr: PaymentRequest }) {
  const reqDone = true; // requester always filled
  const apprDone = pr.status === "APPROVED" || pr.status === "PAID";
  const payDone = pr.status === "PAID";

  return (
    <div className="flex items-center gap-2">
      {/* REQUEST */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold",
            reqDone
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-muted bg-muted text-muted-foreground"
          )}
        >
          {reqDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : "1"}
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold leading-tight">{pr.requester.name.split(" ")[0]}</p>
          <RoleBadge role={pr.requester.role} />
        </div>
      </div>

      <div className={cn("h-0.5 flex-1", apprDone ? "bg-primary/40" : "bg-muted")} />

      {/* APPROVE */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold",
            apprDone
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400"
          )}
        >
          {apprDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : "2"}
        </div>
        <div className="text-center">
          {pr.approver ? (
            <>
              <p className="text-[10px] font-semibold leading-tight">{pr.approver.name.split(" ")[0]}</p>
              <RoleBadge role={pr.approver.role} />
            </>
          ) : (
            <>
              <p className="text-[10px] font-semibold leading-tight text-muted-foreground">Pending</p>
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                Awaiting
              </span>
            </>
          )}
        </div>
      </div>

      <div className={cn("h-0.5 flex-1", payDone ? "bg-primary/40" : "bg-muted")} />

      {/* PAY */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold",
            payDone
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-muted bg-muted text-muted-foreground"
          )}
        >
          {payDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : "3"}
        </div>
        <div className="text-center">
          {pr.payer ? (
            <>
              <p className="text-[10px] font-semibold leading-tight">{pr.payer.name.split(" ")[0]}</p>
              <RoleBadge role={pr.payer.role} />
            </>
          ) : (
            <>
              <p className="text-[10px] font-semibold leading-tight text-muted-foreground">Awaiting</p>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                Pay
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Payment request card
// ============================================================
function PaymentRequestCard({
  pr,
  onAction,
  acting,
}: {
  pr: PaymentRequest;
  onAction: (id: string, action: "APPROVE" | "REJECT" | "PAY") => void;
  acting: string | null;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{pr.code}</span>
            <StatusBadge status={pr.status} />
            {pr.purchaseOrder?.code && (
              <span className="text-[10px] text-muted-foreground">PO: {pr.purchaseOrder.code}</span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-semibold">{pr.description ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {pr.project?.name ?? "No project"} · requested {relativeTime(pr.requestedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight text-primary">{formatNGN(pr.amount)}</p>
          {pr.paidAt && <p className="text-[10px] text-muted-foreground">paid {formatDate(pr.paidAt)}</p>}
          {pr.approvedAt && !pr.paidAt && (
            <p className="text-[10px] text-muted-foreground">approved {formatDate(pr.approvedAt)}</p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <SegregationSteps pr={pr} />
      </div>

      {pr.status === "PENDING" && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            disabled={acting === pr.id}
            onClick={() => onAction(pr.id, "REJECT")}
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={acting === pr.id}
            onClick={() => onAction(pr.id, "APPROVE")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      )}
      {pr.status === "APPROVED" && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={acting === pr.id}
            onClick={() => onAction(pr.id, "PAY")}
          >
            <Banknote className="h-3.5 w-3.5" /> Mark Paid
          </Button>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Workflow visualization (3-column flow header)
// ============================================================
function WorkflowFlow({ requests }: { requests: PaymentRequest[] }) {
  const counts = {
    pending: requests.filter((r) => r.status === "PENDING").length,
    approved: requests.filter((r) => r.status === "APPROVED").length,
    paid: requests.filter((r) => r.status === "PAID").length,
  };
  const stages = [
    {
      label: "Request",
      icon: <FileText className="h-4 w-4" />,
      count: requests.length,
      desc: "Raised by Ops / Freelancer",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/30",
    },
    {
      label: "Approve",
      icon: <Shield className="h-4 w-4" />,
      count: counts.approved + counts.paid,
      desc: "Founder reviews & signs off",
      color: "text-teal-300",
      bg: "bg-teal-500/10 border-teal-500/30",
    },
    {
      label: "Pay",
      icon: <Banknote className="h-4 w-4" />,
      count: counts.paid,
      desc: "Finance executes payment",
      color: "text-primary",
      bg: "bg-primary/10 border-primary/30",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
      {stages.map((s, i) => (
        <div key={s.label} className="contents">
          <Card className={cn("flex items-center gap-3 p-4", s.bg, "border")}>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-background/60", s.color)}>
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{s.label}</p>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {s.count}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.desc}</p>
            </div>
          </Card>
          {i < stages.length - 1 && (
            <div className="hidden items-center justify-center md:flex">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Approvals Tab
// ============================================================
function ApprovalsTab({
  paymentRequests,
  onAction,
  acting,
}: {
  paymentRequests: PaymentRequest[];
  onAction: (id: string, action: "APPROVE" | "REJECT" | "PAY") => void;
  acting: string | null;
}) {
  const pending = paymentRequests.filter((p) => p.status === "PENDING");
  const approved = paymentRequests.filter((p) => p.status === "APPROVED");
  const paid = paymentRequests.filter((p) => p.status === "PAID");
  const rejected = paymentRequests.filter((p) => p.status === "REJECTED");

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader
          title="Workflow"
          description="Every payment moves through three independent hands"
          icon={<ArrowRight className="h-5 w-5" />}
        />
        <div className="mt-4">
          <WorkflowFlow requests={paymentRequests} />
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <SectionHeader
            title={`Pending Approval — ${pending.length}`}
            description="Awaiting founder / approver decision"
            icon={<Clock className="h-5 w-5 text-amber-400" />}
          />
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {pending.map((pr) => (
              <PaymentRequestCard key={pr.id} pr={pr} onAction={onAction} acting={acting} />
            ))}
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <SectionHeader
            title={`Approved — Awaiting Payment (${approved.length})`}
            description="Cleared for finance to execute"
            icon={<Banknote className="h-5 w-5 text-teal-300" />}
          />
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {approved.map((pr) => (
              <PaymentRequestCard key={pr.id} pr={pr} onAction={onAction} acting={acting} />
            ))}
          </div>
        </div>
      )}

      {paid.length > 0 && (
        <div>
          <SectionHeader
            title={`Paid — ${paid.length}`}
            description="Completed transactions"
            icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
          />
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {paid.map((pr) => (
              <PaymentRequestCard key={pr.id} pr={pr} onAction={onAction} acting={acting} />
            ))}
          </div>
        </div>
      )}

      {rejected.length > 0 && (
        <div>
          <SectionHeader
            title={`Rejected — ${rejected.length}`}
            description="Declined payment requests"
            icon={<XCircle className="h-5 w-5 text-rose-400" />}
          />
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {rejected.map((pr) => (
              <PaymentRequestCard key={pr.id} pr={pr} onAction={onAction} acting={acting} />
            ))}
          </div>
        </div>
      )}

      {paymentRequests.length === 0 && (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No payment requests"
          hint="New payment requests will appear here for approval."
        />
      )}
    </div>
  );
}

// ============================================================
// RFQs Tab
// ============================================================
function RfqCard({ rfq }: { rfq: Rfq }) {
  const [open, setOpen] = useState(rfq.status === "QUOTES_RECEIVED");
  const sorted = [...rfq.quotes].sort((a, b) => a.amount - b.amount);
  const lowest = sorted.length > 0 ? sorted[0].amount : null;
  const recommended = rfq.quotes.find((q) => q.isRecommended);
  const budgetVariance =
    rfq.budget && lowest !== null ? rfq.budget - lowest : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="p-4">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary">{rfq.code}</span>
                <StatusBadge status={rfq.status} />
                {rfq.category && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {rfq.category.replace(/_/g, " ")}
                  </Badge>
                )}
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {rfq.quotes.length} quote{rfq.quotes.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-semibold">{rfq.title}</p>
              <p className="text-xs text-muted-foreground">
                {rfq.project?.name ?? "No project"} · needed {rfq.neededBy ? relativeTime(rfq.neededBy) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</p>
              <p className="font-mono text-sm font-semibold">{rfq.budget ? formatNGN(rfq.budget) : "—"}</p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-4 border-t border-border pt-4">
            {rfq.description && (
              <p className="mb-3 text-xs text-muted-foreground">{rfq.description}</p>
            )}

            {sorted.length === 0 ? (
              <EmptyState
                icon={<Truck className="h-6 w-6" />}
                title="No quotes yet"
                hint="Distribute RFQ to vendors and capture quotes here."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-[10px]">Vendor</TableHead>
                      <TableHead className="h-8 text-[10px]">Amount</TableHead>
                      <TableHead className="h-8 text-[10px]">Delivery</TableHead>
                      <TableHead className="h-8 text-[10px]">Rating</TableHead>
                      <TableHead className="h-8 text-[10px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((q) => {
                      const isLowest = q.amount === lowest;
                      return (
                        <TableRow key={q.id} className={cn(isLowest && "bg-primary/5")}>
                          <TableCell className="py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold">{q.vendor.name}</span>
                              {isLowest && (
                                <Badge className="h-5 gap-0.5 bg-primary/15 px-1.5 text-[9px] text-primary">
                                  <TrendingUp className="h-2.5 w-2.5" /> LOWEST
                                </Badge>
                              )}
                              {q.isRecommended && (
                                <Badge className="h-5 gap-0.5 bg-amber-500/15 px-1.5 text-[9px] text-amber-400">
                                  <Star className="h-2.5 w-2.5 fill-amber-400" /> RECOMMENDED
                                </Badge>
                              )}
                              {q.isApproved && (
                                <Badge className="h-5 gap-0.5 bg-primary/15 px-1.5 text-[9px] text-primary">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> APPROVED
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="font-mono text-xs font-semibold">{formatNGN(q.amount)}</span>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {q.deliveryDays ? `${q.deliveryDays}d` : "—"}
                          </TableCell>
                          <TableCell className="py-2">
                            <Stars rating={q.vendor.rating} />
                          </TableCell>
                          <TableCell className="max-w-[260px] py-2 text-xs text-muted-foreground">
                            {q.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {budgetVariance !== null && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                    <span className="text-muted-foreground">Budget vs lowest:</span>
                    <span
                      className={cn(
                        "font-semibold",
                        budgetVariance >= 0 ? "text-primary" : "text-rose-400"
                      )}
                    >
                      {budgetVariance >= 0 ? "+" : "-"}
                      {formatNGN(Math.abs(budgetVariance))}
                    </span>
                    <span className="text-muted-foreground">
                      ({budgetVariance >= 0 ? "under budget" : "OVER budget"})
                    </span>
                    {recommended && (
                      <span className="ml-auto text-muted-foreground">
                        Recommended:{" "}
                        <span className="font-semibold text-amber-400">{recommended.vendor.name}</span> ·{" "}
                        {formatNGN(recommended.amount)}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function RfqsTab({ rfqs }: { rfqs: Rfq[] }) {
  return (
    <div className="space-y-3">
      {rfqs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No RFQs"
          hint="Raise a new RFQ to start collecting vendor quotes."
        />
      ) : (
        rfqs.map((r) => <RfqCard key={r.id} rfq={r} />)
      )}
    </div>
  );
}

// ============================================================
// Purchase Orders Tab
// ============================================================
function PurchaseOrdersTab({ pos }: { pos: PurchaseOrder[] }) {
  if (pos.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="No purchase orders"
        hint="Approved quotes can be converted to purchase orders."
      />
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px]">PO Code</TableHead>
            <TableHead className="text-[10px]">Vendor</TableHead>
            <TableHead className="text-[10px]">Project</TableHead>
            <TableHead className="text-[10px]">Description</TableHead>
            <TableHead className="text-right text-[10px]">Amount</TableHead>
            <TableHead className="text-[10px]">Status</TableHead>
            <TableHead className="text-[10px]">Issued</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pos.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="py-2.5">
                <span className="font-mono text-xs font-semibold text-primary">{p.code}</span>
              </TableCell>
              <TableCell className="py-2.5 text-xs font-medium">{p.vendor.name}</TableCell>
              <TableCell className="py-2.5 text-xs text-muted-foreground">
                {p.project?.name ?? "—"}
              </TableCell>
              <TableCell className="max-w-[280px] py-2.5 text-xs text-muted-foreground">
                {p.description ?? "—"}
              </TableCell>
              <TableCell className="py-2.5 text-right font-mono text-xs font-semibold">
                {formatNGN(p.amount)}
              </TableCell>
              <TableCell className="py-2.5">
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="py-2.5 text-xs text-muted-foreground">
                {p.issuedAt ? formatDate(p.issuedAt) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ============================================================
// Vendors Tab
// ============================================================
function VendorsTab({ vendors }: { vendors: Vendor[] }) {
  const [sortBy, setSortBy] = useState<"totalSpent" | "rating" | "name" | "category">("category");
  const sorted = useMemo(() => {
    const copy = [...vendors];
    if (sortBy === "totalSpent") copy.sort((a, b) => b.totalSpent - a.totalSpent);
    if (sortBy === "rating") copy.sort((a, b) => b.rating - a.rating);
    if (sortBy === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "category") copy.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return copy;
  }, [vendors, sortBy]);

  const maxSpent = Math.max(1, ...vendors.map((v) => v.totalSpent));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(["category", "totalSpent", "rating", "name"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={sortBy === k ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSortBy(k)}
          >
            {k === "category" ? "Category" : k === "totalSpent" ? "Total Spend" : k === "rating" ? "Rating" : "Name (A-Z)"}
          </Button>
        ))}
      </div>

      {sortBy === "category" ? (
        // Grouped by category
        <div className="space-y-4">
          {Object.entries(
            sorted.reduce<Record<string, typeof sorted>>((acc, v) => {
              (acc[v.category] ||= []).push(v);
              return acc;
            }, {})
          ).map(([cat, catVendors]) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="h-6 px-2 text-xs font-semibold">{cat.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-muted-foreground">{catVendors.length} vendor{catVendors.length > 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {catVendors.map((v) => (
                  <VendorCard key={v.id} v={v} maxSpent={maxSpent} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((v) => (
            <VendorCard key={v.id} v={v} maxSpent={maxSpent} />
          ))}
        </div>
      )}

      {vendors.length === 0 && (
        <EmptyState
          icon={<Users2 className="h-8 w-8" />}
          title="No vendors"
          hint="Add vendors to start raising RFQs and POs."
        />
      )}
    </div>
  );
}

// ============================================================
// Vendor Card (extracted for reuse in grouped + flat views)
// ============================================================
function VendorCard({ v, maxSpent }: { v: Vendor; maxSpent: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{v.name}</p>
          <Badge variant="outline" className="mt-1 h-5 px-1.5 text-[10px]">
            {v.category.replace(/_/g, " ")}
          </Badge>
        </div>
        {v.isActive ? (
          <Badge className="h-5 gap-1 bg-primary/15 px-1.5 text-[9px] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> ACTIVE
          </Badge>
        ) : (
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
            INACTIVE
          </Badge>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Stars rating={v.rating} />
        <span className="text-[10px] text-muted-foreground">{v.rating.toFixed(1)} / 5</span>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {v.contactName && <p className="truncate">{v.contactName}</p>}
        {v.phone && <p className="truncate font-mono">{v.phone}</p>}
        {v.email && <p className="truncate">{v.email}</p>}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total spent</span>
          <span className="font-mono font-semibold text-primary">{formatNGN(v.totalSpent, true)}</span>
        </div>
        <div className="mt-1.5">
          <MiniBar value={v.totalSpent} max={maxSpent} color="bg-primary" />
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{v._count.quotes} quotes</span>
          <span>·</span>
          <span>{v._count.pos} POs</span>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Control banner
// ============================================================
function ControlBanner({ violations }: { violations: number }) {
  const ok = violations === 0;
  return (
    <Card
      className={cn(
        "relative overflow-hidden border p-5",
        ok ? "border-primary/30 bg-primary/[0.04]" : "border-rose-500/40 bg-rose-500/[0.05]"
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            ok ? "bg-primary/15 text-primary" : "bg-rose-500/15 text-rose-400"
          )}
        >
          {ok ? <Shield className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">Procurement Control</h3>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                ok ? "bg-primary/15 text-primary" : "bg-rose-500/20 text-rose-400"
              )}
            >
              {ok ? "Policy Enforced" : "Violation Detected"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">Requester ≠ Approver ≠ Payer.</span>{" "}
            No single person may request, approve, AND pay a transaction. Every payment in DOZ OS is routed
            through three independent hands.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              {ok ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400" />
              )}
              <span className="text-muted-foreground">Segregation violations</span>
              <span
                className={cn(
                  "font-mono font-bold",
                  ok ? "text-primary" : "text-rose-400"
                )}
              >
                {violations}
              </span>
            </div>
            <div className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
              <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              <span>Request</span>
              <ArrowRight className="h-3.5 w-3.5 text-teal-300" />
              <span>Approve</span>
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              <span>Pay</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Loading skeleton
// ============================================================
function SkeletonGrid() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================
export function Procurement() {
  const [data, setData] = useState<ProcurementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/doz/procurement", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      toast.error("Failed to load procurement data");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // acting user for approve/pay — pick the Founder (Kelvin Keshy) by default
  // resolved from any existing payment request where she acted as approver.
  const actingApproverId = useMemo(() => {
    if (!data) return null;
    const paid = data.paymentRequests.find((p) => p.approverId && p.approver?.role === "FOUNDER");
    return paid?.approverId ?? null;
  }, [data]);

  // acting payer — Finance Officer (Ngozi Eze, STAFF) — resolved from a PAID request
  const actingPayerId = useMemo(() => {
    if (!data) return null;
    const paid = data.paymentRequests.find((p) => p.status === "PAID" && p.payerId);
    return paid?.payerId ?? null;
  }, [data]);

  async function handleAction(id: string, action: "APPROVE" | "REJECT" | "PAY") {
    if (!data) return;
    const pr = data.paymentRequests.find((p) => p.id === id);
    if (!pr) return;

    // Validate segregation client-side first (the API will re-validate).
    if (action === "APPROVE" || action === "REJECT") {
      if (!actingApproverId) {
        toast.error("No acting approver resolved");
        return;
      }
      if (actingApproverId === pr.requesterId) {
        toast.error("Segregation violation: requester cannot approve their own request", {
          description: "Choose a different approver.",
        });
        return;
      }
    }
    if (action === "PAY") {
      if (!actingPayerId) {
        toast.error("No acting payer resolved");
        return;
      }
      if (actingPayerId === pr.requesterId || actingPayerId === pr.approverId) {
        toast.error("Segregation violation: payer must differ from requester and approver");
        return;
      }
    }

    setActing(id);
    try {
      const payload: Record<string, unknown> = { id, action };
      if (action === "APPROVE" || action === "REJECT") {
        payload.approverId = actingApproverId;
        payload.comment = action === "APPROVE" ? "Approved from DOZ OS" : "Rejected from DOZ OS";
      }
      if (action === "PAY") {
        payload.payerId = actingPayerId;
      }

      const res = await fetch("/api/doz/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? `Failed to ${action.toLowerCase()}`);
        return;
      }

      const actionLabel = action === "APPROVE" ? "approved" : action === "REJECT" ? "rejected" : "marked paid";
      toast.success(`${pr.code} ${actionLabel}`, {
        description:
          action === "APPROVE"
            ? "Routed to finance for payment"
            : action === "PAY"
            ? "Payment recorded"
            : "Request declined",
      });
      await load();
    } catch (e) {
      toast.error("Network error — please retry");
      console.error(e);
    } finally {
      setActing(null);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Procurement & Vendor Management" />
        <SkeletonGrid />
      </div>
    );
  }

  const { stats, vendors, rfqs, purchaseOrders, paymentRequests } = data;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Procurement & Vendor Management"
        description="RFQs, quotes, purchase orders, and 3-way segregated payments"
        icon={<Truck className="h-5 w-5" />}
        action={
          <Button
            size="sm"
            onClick={() => setShowApply(true)}
            className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Vendor
          </Button>
        }
      />

      <ControlBanner violations={stats.segregationViolations} />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Pending Approvals"
          value={stats.pendingApprovals}
          sub={`${formatNGN(stats.pendingPaymentsValue, true)} awaiting`}
          icon={<Clock className="h-4 w-4 text-amber-400" />}
          accent="warning"
        />
        <StatCard
          label="Open RFQs"
          value={stats.openRfqs}
          sub="Awaiting quotes"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Active Vendors"
          value={stats.activeVendors}
          sub={`Avg rating ${stats.avgVendorRating.toFixed(1)}★`}
          icon={<Users2 className="h-4 w-4" />}
        />
        <StatCard
          label="Total Vendor Spend"
          value={formatNGN(stats.totalVendorSpend, true)}
          sub="Lifetime"
          icon={<Wallet className="h-4 w-4 text-primary" />}
          accent="primary"
        />
        <StatCard
          label="Overdue Payments"
          value={stats.overduePayments}
          sub={stats.overduePayments === 0 ? "All on schedule" : "Needs attention"}
          icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
          accent={stats.overduePayments > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Avg Vendor Rating"
          value={`${stats.avgVendorRating.toFixed(1)}★`}
          sub={`Across ${vendors.length} vendors`}
          icon={<Star className="h-4 w-4 text-amber-400" />}
        />
      </div>

      <Tabs defaultValue="approvals" className="w-full">
        <TabsList className="h-9 w-full justify-start overflow-x-auto">
          <TabsTrigger value="approvals" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Approvals
            {stats.pendingApprovals > 0 && (
              <Badge className="ml-1 h-4 bg-amber-500/20 px-1 text-[9px] text-amber-400">
                {stats.pendingApprovals}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rfqs" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />
            RFQs & Quotes
          </TabsTrigger>
          <TabsTrigger value="pos" className="gap-1.5 text-xs">
            <Truck className="h-3.5 w-3.5" />
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-1.5 text-xs">
            <Users2 className="h-3.5 w-3.5" />
            Vendors
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-4">
          <ApprovalsTab
            paymentRequests={paymentRequests}
            onAction={handleAction}
            acting={acting}
          />
        </TabsContent>

        <TabsContent value="rfqs" className="mt-4">
          <RfqsTab rfqs={rfqs} />
        </TabsContent>

        <TabsContent value="pos" className="mt-4">
          <PurchaseOrdersTab pos={purchaseOrders} />
        </TabsContent>

        <TabsContent value="vendors" className="mt-4">
          <VendorsTab vendors={vendors} />
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4">
          <VendorApplications />
        </TabsContent>
      </Tabs>

      {showApply && <AddVendorForm onClose={() => setShowApply(false)} onSaved={load} />}
    </div>
  );
}
