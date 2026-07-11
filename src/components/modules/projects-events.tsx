"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Calendar,
  MapPin,
  Users,
  Film,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Star,
  Clapperboard,
  TrendingUp,
  Wallet,
  CircleDollarSign,
  Trophy,
  FolderKanban,
  Plus,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  Pencil,
  Trash2,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import {
  formatNGN,
  formatDate,
  relativeTime,
  avatarColor,
  initials,
} from "@/lib/format";

// ---------- Types ----------
interface CrewMember {
  id: string;
  role: string;
  status: string;
  dayRate: number;
  user: { name: string };
}
interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  completedAt: string | null;
}
interface Deliverable {
  id: string;
  title: string;
  type: string | null;
  status: string;
  dueDate: string | null;
  clientApproved: boolean;
  deliveredAt: string | null;
}
interface Project {
  id: string;
  name: string;
  code: string | null;
  serviceType: string;
  status: string;
  eventDate: string | null;
  venue: string | null;
  budget: number;
  revenue: number;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  account: { name: string; isStrategic: boolean } | null;
  manager: { name: string } | null;
  crew: CrewMember[];
  milestones: Milestone[];
  deliverables: Deliverable[];
  _count: { tasks: number; invoices: number; expenses: number };
  expensesTotal: number;
  received: number;
  balance: number;
  profit: number;
  margin: number;
}
interface ProjectsData {
  stats: {
    total: number;
    active: number;
    completed: number;
    totalRevenue: number;
    totalExpenses: number;
    totalProfit: number;
    totalReceived: number;
    totalBalance: number;
    avgMargin: number;
  };
  projects: Project[];
}

interface AccountOption {
  id: string;
  name: string;
  isStrategic?: boolean;
}

// ---------- Constants ----------
const ACTIVE_STATUSES = ["PLANNING", "CONFIRMED", "IN_PROGRESS"];

// Service types selectable in the New Project form. Kept in sync with the
// backend VALID_SERVICE_TYPES list in /api/doz/projects/route.ts.
const SERVICE_TYPES = [
  "EVENT_PRODUCTION",
  "EVENT_MANAGEMENT",
  "CONFERENCE_PRODUCTION",
  "VIDEO_PRODUCTION",
  "CORPORATE_VIDEO",
  "DOCUMENTARY",
  "TITLE_SEQUENCE",
  "COLOR_GRADING",
  "PHOTOGRAPHY",
  "MOTION_GRAPHICS",
  "LIVESTREAM",
  "POST_PRODUCTION",
] as const;

// Statuses offered when creating a new project (post-create, IN_PROGRESS can
// be set later). Defaults to PLANNING.
const CREATE_STATUSES = ["PLANNING", "CONFIRMED", "IN_PROGRESS"] as const;

const SERVICE_ICON: Record<string, React.ReactNode> = {
  EVENT_PRODUCTION: <Clapperboard className="h-3.5 w-3.5" />,
  EVENT_MANAGEMENT: <Clapperboard className="h-3.5 w-3.5" />,
  VIDEO_PRODUCTION: <Film className="h-3.5 w-3.5" />,
  CONFERENCE_PRODUCTION: <Users className="h-3.5 w-3.5" />,
  TITLE_SEQUENCE: <Film className="h-3.5 w-3.5" />,
  COLOR_GRADING: <Film className="h-3.5 w-3.5" />,
};

function serviceLabel(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function deliverableStatusKey(s: string): string {
  return s.toLowerCase();
}

function deliverableSummary(deliverables: Deliverable[]): string {
  if (deliverables.length === 0) return "No deliverables";
  const counts: Record<string, number> = {};
  for (const d of deliverables) {
    const k = deliverableStatusKey(d.status);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const order = ["pending", "in_progress", "review", "delivered"];
  const labels: Record<string, string> = {
    pending: "pending",
    in_progress: "in progress",
    review: "in review",
    delivered: "delivered",
  };
  return order
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${labels[k]}`)
    .join(", ");
}

// ---------- Main ----------
export function ProjectsEvents() {
  const { user } = useCurrentUser();
  const isPM = user?.role === "FREELANCER";
  const [data, setData] = useState<ProjectsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    // Note: we intentionally do NOT call setLoading(true) here synchronously
    // — the initial `loading` state is `true` already and we only flip it to
    // false once data arrives. Refreshes (after create) keep the existing
    // data on screen and avoid a cascading-render lint warning.
    fetch("/api/doz/projects")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((d: ProjectsData) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        setError(e.message || "Failed to load projects");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <ProjectsSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={<Clapperboard className="h-5 w-5" />}
          title="Projects & Event Operations"
          description="Deliver every event on time, on budget"
          action={
            <NewProjectButton onClick={() => setCreateOpen(true)} />
          }
        />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't load projects"
          hint={error ?? "Unknown error"}
        />
        <NewProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={load}
        />
      </div>
    );
  }

  const { stats, projects } = data;

  // PM: only show projects where they are the manager
  const scopedProjects = isPM && user
    ? projects.filter(p => p.managerId === user.id)
    : projects;

  // Filter by tab
  const filtered = scopedProjects.filter((p) => {
    if (tab === "all") return true;
    if (tab === "active") return ACTIVE_STATUSES.includes(p.status);
    if (tab === "planning") return p.status === "PLANNING";
    if (tab === "in_progress") return p.status === "IN_PROGRESS";
    if (tab === "completed") return p.status === "COMPLETED";
    return true;
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Clapperboard className="h-5 w-5" />}
        title={isPM ? "My Production Projects" : "Projects & Event Operations"}
        description={isPM
          ? `${scopedProjects.length} project(s) assigned to you`
          : `${stats.total} projects · ${stats.active} active · ${stats.completed} delivered`}
        action={isPM ? undefined : <NewProjectButton onClick={() => setCreateOpen(true)} />}
      />

      {/* KPI ROW — hidden for PMs (they don't see company financials) */}
      {!isPM && (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard
          label="Total Projects"
          value={stats.total}
          sub={`${stats.active} active`}
          icon={<FolderKanban className="h-4 w-4" />}
          accent="default"
        />
        <StatCard
          label="Active"
          value={stats.active}
          sub="in progress"
          icon={<Clapperboard className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Revenue"
          value={formatNGN(stats.totalRevenue, true)}
          sub="booked"
          icon={<CircleDollarSign className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Received"
          value={formatNGN(stats.totalReceived, true)}
          sub="collected"
          icon={<ArrowDownCircle className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Balance Owed"
          value={formatNGN(stats.totalBalance, true)}
          sub="outstanding"
          icon={<ArrowUpCircle className="h-4 w-4" />}
          accent={stats.totalBalance > 0 ? "warning" : "primary"}
        />
        <StatCard
          label="Profit"
          value={formatNGN(stats.totalProfit, true)}
          sub={`exp ${formatNGN(stats.totalExpenses, true)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent={stats.totalProfit >= 0 ? "primary" : "danger"}
        />
        <StatCard
          label="Avg Margin"
          value={`${stats.avgMargin.toFixed(1)}%`}
          sub="per project"
          icon={<Wallet className="h-4 w-4" />}
          accent={stats.avgMargin >= 30 ? "primary" : stats.avgMargin >= 15 ? "warning" : "danger"}
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          sub="delivered"
          icon={<Trophy className="h-4 w-4" />}
          accent="default"
        />
      </div>
      )}

      {/* PROJECT LIST WITH TABS */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">All ({scopedProjects.length})</TabsTrigger>
            <TabsTrigger value="active" className="text-xs">Active ({scopedProjects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length})</TabsTrigger>
            <TabsTrigger value="planning" className="text-xs">Planning ({scopedProjects.filter((p) => p.status === "PLANNING").length})</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">In Progress ({scopedProjects.filter((p) => p.status === "IN_PROGRESS").length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Completed ({scopedProjects.filter((p) => p.status === "COMPLETED").length})</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of {scopedProjects.length}
          </p>
        </div>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-8 w-8" />}
              title="No projects in this view"
              hint="Switch tabs to see other projects, or create a new one."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} isPM={isPM} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
    </div>
  );
}

// ---------- New Project Button ----------
function NewProjectButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} size="sm" className="gap-1">
      <Plus className="h-4 w-4" />
      New Project
    </Button>
  );
}

// ---------- New Project Dialog ----------
function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [serviceType, setServiceType] = useState<string>("");
  const [status, setStatus] = useState<string>("PLANNING");
  const [accountId, setAccountId] = useState<string>("");
  const [eventDate, setEventDate] = useState<string>("");
  const [venue, setVenue] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [revenue, setRevenue] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load accounts (from CRM endpoint) once when the dialog first opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAccountsLoading(true);
    fetch("/api/doz/crm")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list: AccountOption[] = (d.accounts ?? []).map(
          (a: { id: string; name: string; isStrategic?: boolean }) => ({
            id: a.id,
            name: a.name,
            isStrategic: a.isStrategic,
          })
        );
        setAccounts(list);
      })
      .catch(() => {
        // Non-fatal — the field stays as an empty select.
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset form fields whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setName("");
      setServiceType("");
      setStatus("PLANNING");
      setAccountId("");
      setEventDate("");
      setVenue("");
      setBudget("");
      setRevenue("");
    }
  }, [open]);

  const budgetNum = useMemo(() => {
    const n = Number(budget);
    return isNaN(n) ? 0 : n;
  }, [budget]);
  const revenueNum = useMemo(() => {
    const n = Number(revenue);
    return isNaN(n) ? 0 : n;
  }, [revenue]);
  const projectedProfit = revenueNum - budgetNum;
  const projectedMargin =
    revenueNum > 0 ? (projectedProfit / revenueNum) * 100 : 0;

  const canSubmit =
    name.trim().length > 0 &&
    serviceType.length > 0 &&
    budget.trim().length > 0 &&
    Number(budget) >= 0 &&
    revenue.trim().length > 0 &&
    Number(revenue) >= 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        serviceType,
        status,
        budget: budgetNum,
        revenue: revenueNum,
      };
      if (accountId) payload.accountId = accountId;
      if (eventDate) payload.eventDate = eventDate;
      if (venue.trim()) payload.venue = venue.trim();

      const res = await fetch("/api/doz/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.project) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }
      toast.success("Project created", {
        description: `${json.project.name} (${json.project.code ?? "no code"})`,
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error("Couldn't create project", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Create New Project
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Add a project with its cost, contract value, and key details.
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="scroll-thin flex max-h-[calc(90vh-9rem)] flex-col"
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="np-name">
                Project Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="np-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GTBank Annual Gala 2025"
                required
                autoFocus
              />
            </div>

            {/* Service Type + Status */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-service">
                  Service Type <span className="text-rose-500">*</span>
                </Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger id="np-service">
                    <SelectValue placeholder="Select service…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {serviceLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="np-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {serviceLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account + Event Date */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-account">Client / Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="np-account">
                    <SelectValue
                      placeholder={
                        accountsLoading ? "Loading…" : "Optional — select client"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.length === 0 && !accountsLoading ? (
                      <SelectItem value="__none__" disabled>
                        No accounts available
                      </SelectItem>
                    ) : (
                      accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.isStrategic ? "★ " : ""}
                          {a.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-date">Event Date</Label>
                <Input
                  id="np-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>

            {/* Venue */}
            <div className="space-y-1.5">
              <Label htmlFor="np-venue">Venue</Label>
              <Input
                id="np-venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Eko Hotel Convention Center"
              />
            </div>

            {/* Budget + Revenue */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-budget">
                  Project Cost (Budget) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="np-budget"
                  type="number"
                  min={0}
                  step="1000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="5,000,000"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  What will this project cost us to deliver?
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-revenue">
                  Total Contract Value <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="np-revenue"
                  type="number"
                  min={0}
                  step="1000"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="8,000,000"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Total amount the client will pay.
                </p>
              </div>
            </div>

            {/* Live profit calculation */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Projected Profit (if client pays in full)
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span
                  className={`text-lg font-semibold ${
                    projectedProfit >= 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {formatNGN(projectedProfit)}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    projectedProfit >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {revenueNum > 0 ? `${projectedMargin.toFixed(1)}% margin` : "—"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Contract {formatNGN(revenueNum, true)} − Cost {formatNGN(budgetNum, true)}
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Project Card ----------
function ProjectCard({ project: p, isPM = false }: { project: Project; isPM?: boolean }) {
  const overBudgetWarn =
    p.revenue > 0 && p.expensesTotal / p.revenue > 0.8;
  const budgetUtil = p.budget > 0 ? Math.min(100, (p.expensesTotal / p.budget) * 100) : 0;

  // Next 2 upcoming milestones: not DONE, sorted by dueDate asc
  const upcomingMilestones = p.milestones
    .filter((m) => m.status !== "DONE")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 2);

  const positiveProfit = p.profit >= 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="group cursor-pointer p-4 transition-all hover:border-primary/40 hover:bg-accent/20 lg:p-5">
          {/* Header: code + name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {p.code && (
                  <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {p.code}
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 truncate text-sm font-semibold leading-tight">
                {p.name}
              </h3>
            </div>
            <StatusBadge status={p.status} />
          </div>

          {/* Service type + account */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
              {SERVICE_ICON[p.serviceType] ?? <Film className="h-3.5 w-3.5" />}
              {serviceLabel(p.serviceType)}
            </Badge>
            {p.account && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {p.account.isStrategic && (
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                )}
                {p.account.name}
              </span>
            )}
          </div>

          {/* Event date + venue */}
          {p.eventDate && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(p.eventDate)}
              </span>
              {p.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {p.venue}
                </span>
              )}
            </div>
          )}

          {/* Financial summary strip — hidden for PMs */}
          {!isPM && (
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <CircleDollarSign className="h-3 w-3" />
                Earned
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-primary" title={formatNGN(p.revenue)}>
                {formatNGN(p.revenue, true)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <ArrowDownCircle className="h-3 w-3" />
                Received
              </p>
              <p
                className="mt-0.5 truncate text-sm font-semibold text-emerald-500"
                title={formatNGN(p.received)}
              >
                {formatNGN(p.received, true)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <ArrowUpCircle className="h-3 w-3" />
                Balance
              </p>
              <p
                className={`mt-0.5 truncate text-sm font-semibold ${
                  p.balance > 0 ? "text-amber-500" : "text-emerald-500"
                }`}
                title={formatNGN(p.balance)}
              >
                {formatNGN(p.balance, true)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Wallet className="h-3 w-3" />
                Cost
              </p>
              <p
                className="mt-0.5 truncate text-sm font-semibold text-muted-foreground"
                title={formatNGN(p.budget)}
              >
                {formatNGN(p.budget, true)}
              </p>
            </div>
          </div>
          )}

          {/* Budget burn bar — hidden for PMs */}
          {!isPM && (
          <div className="mt-2 space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Budget burn</span>
              <span>
                Spent <span className="font-medium text-foreground">{formatNGN(p.expensesTotal, true)}</span> · {budgetUtil.toFixed(0)}% of budget
              </span>
            </div>
            <MiniBar
              value={p.expensesTotal}
              max={p.budget > 0 ? p.budget : p.revenue || 1}
              color={overBudgetWarn ? "bg-amber-500" : "bg-emerald-500"}
            />
            {/* Collection progress: received / revenue */}
            <div className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
              <span>Collected</span>
              <span>
                <span className="font-medium text-emerald-500">
                  {formatNGN(p.received, true)}
                </span>
                {" / "}
                {formatNGN(p.revenue, true)} ·{" "}
                <span className="font-medium text-foreground">
                  {p.revenue > 0 ? ((p.received / p.revenue) * 100).toFixed(0) : 0}%
                </span>
              </span>
            </div>
            <MiniBar
              value={p.received}
              max={p.revenue > 0 ? p.revenue : 1}
              color="bg-emerald-500"
            />
            {overBudgetWarn && (
              <div className="flex items-center justify-end gap-1 pt-0.5 text-[11px] font-medium text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                High burn
              </div>
            )}
          </div>
          )}

          {/* Profit + margin — hidden for PMs */}
          {!isPM && (
          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Profit</span>
              <span
                className={`text-sm font-semibold ${
                  positiveProfit ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {formatNGN(p.profit, true)}
              </span>
            </div>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                positiveProfit
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {p.margin.toFixed(1)}% margin
            </span>
          </div>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Project progress</span>
              <span className="font-medium text-foreground">{p.progress}%</span>
            </div>
            <Progress value={p.progress} className="mt-1 h-1.5" />
          </div>

          {/* Crew summary with avatar stack */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {p.crew.length} crew assigned
              </span>
            </div>
            {p.crew.length > 0 && (
              <div className="flex -space-x-2">
                {p.crew.slice(0, 3).map((c) => (
                  <Avatar
                    key={c.id}
                    className="h-6 w-6 border-2 border-background ring-0"
                  >
                    <AvatarFallback
                      className={`h-6 w-6 text-[9px] font-semibold ${avatarColor(c.user.name)}`}
                    >
                      {initials(c.user.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {p.crew.length > 3 && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold text-muted-foreground">
                    +{p.crew.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upcoming milestones */}
          {upcomingMilestones.length > 0 && (
            <div className="mt-3 border-t border-border/60 pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming milestones
              </p>
              <div className="space-y-1">
                {upcomingMilestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{m.title}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relativeTime(m.dueDate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deliverables summary */}
          {p.deliverables.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{deliverableSummary(p.deliverables)}</span>
            </div>
          )}

          {/* Footer hint */}
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
            <span>{p._count.tasks} tasks · {p._count.invoices} invoices · {p._count.expenses} expenses</span>
            <span className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              View details →
            </span>
          </div>
        </Card>
      </DialogTrigger>

      <ProjectDialog project={p} />
    </Dialog>
  );
}

// ---------- Project Detail Dialog ----------
function ProjectDialog({ project: p }: { project: Project }) {
  const milestones = [...p.milestones].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
  const deliverables = [...p.deliverables].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  return (
    <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
      <DialogHeader className="border-b border-border px-5 py-4 pr-12">
        <div className="flex items-center gap-2">
          {p.code && (
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {p.code}
            </span>
          )}
          <StatusBadge status={p.status} />
        </div>
        <DialogTitle className="text-base">{p.name}</DialogTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {SERVICE_ICON[p.serviceType] ?? <Film className="h-3.5 w-3.5" />}
            {serviceLabel(p.serviceType)}
          </span>
          {p.account && (
            <span className="inline-flex items-center gap-1">
              {p.account.isStrategic && (
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              )}
              {p.account.name}
            </span>
          )}
          {p.manager && <span>· PM: {p.manager.name}</span>}
        </div>
      </DialogHeader>

      <div className="scroll-thin max-h-[calc(88vh-9rem)] overflow-y-auto px-5 py-4">
        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned (Contract)</p>
            <p className="mt-0.5 text-sm font-semibold text-primary">{formatNGN(p.revenue, true)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Received</p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-500">{formatNGN(p.received, true)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance Owed</p>
            <p className={`mt-0.5 text-sm font-semibold ${p.balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {formatNGN(p.balance, true)}
            </p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget (Cost)</p>
            <p className="mt-0.5 text-sm font-semibold">{formatNGN(p.budget, true)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expenses</p>
            <p className="mt-0.5 text-sm font-semibold">{formatNGN(p.expensesTotal, true)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit / Margin</p>
            <p className={`mt-0.5 text-sm font-semibold ${p.profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {formatNGN(p.profit, true)} · {p.margin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Vendor Costs & Financials — project-level vendor tracking */}
        <VendorCostsSection projectId={p.id} revenue={p.revenue} />

        {/* Equipment List — production equipment with vendor attachment */}
        <EquipmentSection projectId={p.id} />

        {/* Event + dates */}
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {p.eventDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Event:</span>
              <span className="font-medium">{formatDate(p.eventDate)}</span>
            </div>
          )}
          {p.venue && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Venue:</span>
              <span className="font-medium">{p.venue}</span>
            </div>
          )}
          {p.startDate && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Start:</span>
              <span className="font-medium">{formatDate(p.startDate)}</span>
            </div>
          )}
          {p.endDate && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">End:</span>
              <span className="font-medium">{formatDate(p.endDate)}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Progress</span>
            <span className="font-semibold text-primary">{p.progress}%</span>
          </div>
          <Progress value={p.progress} className="mt-1.5 h-2" />
        </div>

        {/* Crew */}
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Crew ({p.crew.length})
          </h4>
          {p.crew.length === 0 ? (
            <p className="text-xs text-muted-foreground">No crew assigned yet.</p>
          ) : (
            <div className="scroll-thin max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {p.crew.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback
                        className={`h-6 w-6 text-[9px] font-semibold ${avatarColor(c.user.name)}`}
                      >
                        {initials(c.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{c.user.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {c.role.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatNGN(c.dayRate, true)}/day
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Milestones */}
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Milestones ({milestones.length})
          </h4>
          {milestones.length === 0 ? (
            <p className="text-xs text-muted-foreground">No milestones defined.</p>
          ) : (
            <div className="scroll-thin max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {milestones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2
                      className={`h-3.5 w-3.5 shrink-0 ${
                        m.status === "DONE" ? "text-emerald-500" : "text-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className={`truncate text-xs ${m.status === "DONE" ? "line-through text-muted-foreground" : "font-medium"}`}>
                        {m.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Due {formatDate(m.dueDate)} · {relativeTime(m.dueDate)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deliverables */}
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Film className="h-3.5 w-3.5" />
            Deliverables ({deliverables.length})
          </h4>
          {deliverables.length === 0 ? (
            <p className="text-xs text-muted-foreground">No deliverables defined.</p>
          ) : (
            <div className="scroll-thin max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {deliverables.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {d.type ? d.type.replace(/_/g, " ").toLowerCase() : "deliverable"}
                        {d.dueDate && ` · due ${formatDate(d.dueDate)}`}
                        {d.clientApproved && " · approved"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer counts */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <span>{p._count.tasks} tasks</span>
          <span>·</span>
          <span>{p._count.invoices} invoices</span>
          <span>·</span>
          <span>{p._count.expenses} expenses</span>
        </div>
      </div>
    </DialogContent>
  );
}

// ============================================================
// VENDOR COSTS & FINANCIALS — project-level vendor tracking
// ============================================================

interface VendorCost {
  id: string;
  projectId: string;
  vendorId: string | null;
  vendorName: string;
  item: string;
  fee: number;
  amountPaid: number;
  balance: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
  notes: string | null;
  vendor: { name: string; category: string; phone: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

interface VendorCostsPayload {
  vendorCosts: VendorCost[];
  summary: {
    totalFee: number;
    totalPaid: number;
    totalBalance: number;
    receivedFromClient: number;
    projectProfit: number;
  };
}

interface VendorOption {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
}

const MANUAL_VENDOR_VALUE = "__manual__";

function VendorCostStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    UNPAID: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    PARTIAL: "bg-teal-500/15 text-teal-400 border-teal-500/20",
    PAID: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  const cls = styles[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function SummaryCell({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  valueClass: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-muted/30 p-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-bold ${valueClass}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

// ---------- Vendor Costs Section (mounted inside ProjectDialog) ----------
function VendorCostsSection({
  projectId,
  revenue,
}: {
  projectId: string;
  revenue: number;
}) {
  const [data, setData] = useState<VendorCostsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorCost | null>(null);

  const load = useCallback(() => {
    fetch(
      `/api/doz/project-vendors?projectId=${encodeURIComponent(projectId)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VendorCostsPayload | null) => {
        if (d) {
          setData(d);
          setError(null);
        } else {
          setError("Failed to load vendor costs");
        }
      })
      .catch(() => setError("Failed to load vendor costs"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function handleEdit(c: VendorCost) {
    setEditing(c);
    setFormOpen(true);
  }
  async function handleDelete(c: VendorCost) {
    if (
      !confirm(
        `Delete vendor cost?\n\n${c.vendorName} — ${c.item}\n${formatNGN(
          c.fee
        )} (paid ${formatNGN(c.amountPaid)})`
      )
    )
      return;
    try {
      const res = await fetch("/api/doz/project-vendors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costId: c.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      toast.success("Vendor cost deleted");
      load();
    } catch (e) {
      toast.error("Couldn't delete", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const summary = data?.summary;
  const costs = data?.vendorCosts ?? [];
  const profit = summary?.projectProfit ?? 0;
  const balanceOwed = summary?.totalBalance ?? 0;
  const receivedFromClient = summary?.receivedFromClient ?? 0;
  const paidToVendors = summary?.totalPaid ?? 0;

  return (
    <div className="mt-4 rounded-md border border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Vendor Costs & Financials
        </h4>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Vendor Cost
        </Button>
      </div>

      <div className="p-3">
        {/* Financial Summary Strip — 5 cells */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCell
              label="Contract Value"
              value={formatNGN(revenue, true)}
              valueClass="text-primary"
              icon={<CircleDollarSign className="h-3 w-3" />}
            />
            <SummaryCell
              label="Received"
              value={formatNGN(receivedFromClient, true)}
              valueClass="text-emerald-500"
              icon={<ArrowDownCircle className="h-3 w-3" />}
            />
            <SummaryCell
              label="Paid to Vendors"
              value={formatNGN(paidToVendors, true)}
              valueClass="text-amber-500"
              icon={<ArrowUpCircle className="h-3 w-3" />}
            />
            <SummaryCell
              label="Balance Owed"
              value={formatNGN(balanceOwed, true)}
              valueClass={
                balanceOwed > 0 ? "text-rose-500" : "text-emerald-500"
              }
            />
            <SummaryCell
              label="Project Profit"
              value={formatNGN(profit, true)}
              valueClass={profit >= 0 ? "text-emerald-500" : "text-rose-500"}
              icon={<TrendingUp className="h-3 w-3" />}
            />
          </div>
        )}

        {/* Vendor Costs List */}
        <div className="mt-3">
          {error ? (
            <p className="text-xs text-rose-500">{error}</p>
          ) : loading ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : costs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-4 text-center">
              <Wallet className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-1.5 text-xs font-medium text-foreground">
                No vendor costs tracked yet
              </p>
              <p className="text-[11px] text-muted-foreground">
                Add LED screens, audio, lights, decor — anything you&apos;re
                paying vendors for.
              </p>
            </div>
          ) : (
            <div className="scroll-thin max-h-72 overflow-y-auto rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2.5 py-1.5 font-medium">Vendor / Item</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Fee
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Paid
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Balance
                    </th>
                    <th className="px-2.5 py-1.5 text-center font-medium">
                      Status
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border/40 align-top"
                    >
                      <td className="px-2.5 py-2">
                        <div className="font-medium">{c.vendorName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.item}
                          {c.vendor?.category &&
                            ` · ${c.vendor.category
                              .replace(/_/g, " ")
                              .toLowerCase()}`}
                        </div>
                        {c.notes && (
                          <div className="mt-0.5 line-clamp-1 text-[10px] italic text-muted-foreground">
                            {c.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right font-medium">
                        {formatNGN(c.fee, true)}
                      </td>
                      <td className="px-2.5 py-2 text-right text-emerald-500">
                        {formatNGN(c.amountPaid, true)}
                      </td>
                      <td
                        className={`px-2.5 py-2 text-right font-medium ${
                          c.balance > 0 ? "text-amber-500" : "text-emerald-500"
                        }`}
                      >
                        {formatNGN(c.balance, true)}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <VendorCostStatusBadge status={c.status} />
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                            aria-label={`Edit ${c.vendorName} vendor cost`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-rose-500"
                            aria-label={`Delete ${c.vendorName} vendor cost`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Procurement note */}
        <div className="mt-3 flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            For formal procurement with RFQs and approval workflows, use the{" "}
            <span className="font-medium text-foreground">
              Procurement module
            </span>
            .
          </span>
        </div>
      </div>

      <VendorCostFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
}

// ---------- Vendor Cost Add/Edit Dialog ----------
function VendorCostFormDialog({
  open,
  onOpenChange,
  projectId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  editing: VendorCost | null;
  onSaved: () => void;
}) {
  const [vendorMode, setVendorMode] = useState<"pick" | "manual">("pick");
  const [vendorId, setVendorId] = useState<string>("");
  const [manualName, setManualName] = useState<string>("");
  const [item, setItem] = useState("");
  const [fee, setFee] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load vendors when dialog opens (so the dropdown is populated).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVendorsLoading(true);
    fetch("/api/doz/vendors")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list: VendorOption[] = (d.vendors ?? []).map(
          (v: {
            id: string;
            name: string;
            category: string | null;
            phone: string | null;
          }) => ({
            id: v.id,
            name: v.name,
            category: v.category,
            phone: v.phone,
          })
        );
        setVendors(list);
      })
      .catch(() => {
        // Non-fatal — the user can still enter a vendor manually.
      })
      .finally(() => {
        if (!cancelled) setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Prefill fields whenever the dialog opens (for add or edit).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      if (editing.vendorId) {
        setVendorMode("pick");
        setVendorId(editing.vendorId);
        setManualName("");
      } else {
        setVendorMode("manual");
        setVendorId("");
        setManualName(editing.vendorName);
      }
      setItem(editing.item);
      setFee(String(editing.fee));
      setAmountPaid(String(editing.amountPaid));
      setNotes(editing.notes ?? "");
    } else {
      setVendorMode("pick");
      setVendorId("");
      setManualName("");
      setItem("");
      setFee("");
      setAmountPaid("0");
      setNotes("");
    }
  }, [open, editing]);

  const feeNum = useMemo(() => {
    const n = Number(fee);
    return isNaN(n) ? 0 : n;
  }, [fee]);
  const paidNum = useMemo(() => {
    const n = Number(amountPaid);
    return isNaN(n) ? 0 : n;
  }, [amountPaid]);
  const balance = Math.max(0, feeNum - paidNum);
  const liveStatus =
    paidNum <= 0 ? "UNPAID" : paidNum >= feeNum ? "PAID" : "PARTIAL";

  const vendorSelected =
    vendorMode === "pick" ? !!vendorId : manualName.trim().length > 0;

  const canSubmit =
    vendorSelected &&
    item.trim().length > 0 &&
    fee.trim().length > 0 &&
    Number(fee) >= 0 &&
    Number(amountPaid) >= 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        projectId,
        item: item.trim(),
        fee: feeNum,
        amountPaid: paidNum,
        notes: notes.trim() || undefined,
      };
      if (vendorMode === "pick" && vendorId) {
        payload.vendorId = vendorId;
      } else {
        payload.vendorName = manualName.trim();
      }

      const method = editing ? "PATCH" : "POST";
      if (editing) payload.costId = editing.id;

      const res = await fetch("/api/doz/project-vendors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.vendorCost) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }
      toast.success(editing ? "Vendor cost updated" : "Vendor cost added", {
        description: `${json.vendorCost.vendorName} — ${json.vendorCost.item}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save vendor cost", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // The Select value: when in manual mode, we show the MANUAL sentinel
  // selected; when in pick mode but no vendor chosen, the placeholder shows.
  const selectValue =
    vendorMode === "manual"
      ? MANUAL_VENDOR_VALUE
      : vendorId || "";

  function handleSelectChange(v: string) {
    if (v === MANUAL_VENDOR_VALUE) {
      setVendorMode("manual");
      setVendorId("");
    } else {
      setVendorMode("pick");
      setVendorId(v);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            {editing ? "Edit Vendor Cost" : "Add Vendor Cost"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Track what this vendor is charging the project, advances paid, and
            the balance owed.
          </p>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="scroll-thin flex max-h-[calc(90vh-9rem)] flex-col"
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {/* Vendor select (with "Enter manually" sentinel option) */}
            <div className="space-y-1.5">
              <Label htmlFor="vc-vendor">Vendor</Label>
              <Select value={selectValue} onValueChange={handleSelectChange}>
                <SelectTrigger id="vc-vendor">
                  <SelectValue
                    placeholder={
                      vendorsLoading
                        ? "Loading vendors…"
                        : vendors.length === 0
                          ? "No vendors yet — enter manually ↓"
                          : "Pick a vendor…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.category
                        ? ` · ${v.category
                            .replace(/_/g, " ")
                            .toLowerCase()}`
                        : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL_VENDOR_VALUE}>
                    + Enter vendor manually
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Manual name input — only shown in manual mode */}
            {vendorMode === "manual" && (
              <div className="space-y-1.5">
                <Label htmlFor="vc-name">
                  Vendor Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="vc-name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. AViti Productions"
                  required
                  autoFocus
                />
              </div>
            )}

            {/* Item / Service */}
            <div className="space-y-1.5">
              <Label htmlFor="vc-item">
                Item / Service <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="vc-item"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="e.g. LED Screen 6x4m, Sound system, Lighting package"
                required
                autoFocus={vendorMode === "pick"}
              />
            </div>

            {/* Fee + Amount Paid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vc-fee">
                  Vendor Fee (₦) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="vc-fee"
                  type="number"
                  min={0}
                  step="1000"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="1500000"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Total amount the vendor is charging.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vc-paid">Amount Paid (Advance)</Label>
                <Input
                  id="vc-paid"
                  type="number"
                  min={0}
                  step="1000"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Advance or payments already made. Default 0.
                </p>
              </div>
            </div>

            {/* Computed balance + live status */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Balance owed
                </span>
                <span
                  className={`text-sm font-bold ${
                    balance > 0 ? "text-amber-500" : "text-emerald-500"
                  }`}
                >
                  {formatNGN(balance)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Status (auto)
                </span>
                <VendorCostStatusBadge status={liveStatus} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="vc-notes">Notes</Label>
              <Textarea
                id="vc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — e.g. delivery date, deposit terms, what's included"
                rows={3}
              />
            </div>

            {/* Procurement note */}
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This is a lightweight project-level tracker. For formal
                procurement with RFQs and approval workflows, use the{" "}
                <span className="font-semibold">Procurement module</span>.
              </span>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editing ? "Saving…" : "Adding…"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {editing ? "Save Changes" : "Add Cost"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Skeleton ----------
function ProjectsSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Clapperboard className="h-5 w-5" />}
        title="Projects & Event Operations"
        description="Loading projects…"
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Equipment Section — production equipment list with vendor attachment
// ============================================================
interface EquipmentItem { id: string; name: string; isCustom: boolean; }
interface EquipmentCategory { id: string; name: string; icon: string | null; items: EquipmentItem[]; }
interface ProjectEquip {
  id: string; projectId: string; itemName: string; category: string;
  quantity: number; unitPrice: number; totalPrice: number;
  vendorId: string | null; vendorName: string | null; vendorContact: string | null;
  vendorPhone: string | null; vendorEmail: string | null; vendorBankDetails: string | null;
  status: string; notes: string | null; createdBy: string; createdAt: string;
}
interface EquipmentPayload {
  categories: EquipmentCategory[];
  projectEquipment: ProjectEquip[];
  totals: { items: number; totalValue: number; priced: number; approved: number; paid: number; };
  canManage: boolean;
}

function EquipmentSection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<EquipmentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectEquip | null>(null);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/doz/equipment?projectId=${projectId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch { toast.error("Couldn't load equipment"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    load();
    fetch("/api/doz/vendors").then(r => r.json()).then(d => {
      setVendors((d.vendors || []).map((v: any) => ({ id: v.id, name: v.name })));
    }).catch(() => {});
  }, [load]);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const { projectEquipment: items, totals, categories, canManage } = data;

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Equipment List</h4>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setEditingItem(null); setShowAdd(true); }}>
            <Plus className="h-3 w-3" /> Add Equipment
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Items</p>
          <p className="text-sm font-bold">{totals.items}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Value</p>
          <p className="text-sm font-bold text-primary">₦{(totals.totalValue / 1000000).toFixed(1)}M</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Priced</p>
          <p className="text-sm font-bold text-amber-400">{totals.priced}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Approved</p>
          <p className="text-sm font-bold text-emerald-400">{totals.approved}</p>
        </div>
      </div>

      {/* Equipment List */}
      {items.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">No equipment added yet. Click "Add Equipment" to build the production list.</p>
      ) : (
        <div className="scroll-thin max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium truncate">{item.itemName}</p>
                    <Badge variant="outline" className="text-[9px] shrink-0">{item.category}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Qty: {item.quantity}</span>
                    {item.unitPrice > 0 && <span>₦{item.unitPrice.toLocaleString()}/unit</span>}
                    {item.totalPrice > 0 && <span className="font-semibold text-foreground">Total: ₦{item.totalPrice.toLocaleString()}</span>}
                  </div>
                  {item.vendorName && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      📦 {item.vendorName}
                      {item.vendorPhone && ` · 📞 ${item.vendorPhone}`}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge className={`text-[9px] ${
                    item.status === "PAID" ? "bg-emerald-500/15 text-emerald-400" :
                    item.status === "APPROVED" ? "bg-teal-500/15 text-teal-400" :
                    item.status === "PRICED" ? "bg-amber-500/15 text-amber-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{item.status}</Badge>
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditingItem(item); setShowAdd(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Equipment Dialog */}
      {showAdd && (
        <EquipmentFormDialog
          projectId={projectId}
          categories={categories}
          vendors={vendors}
          editing={editingItem}
          onClose={() => { setShowAdd(false); setEditingItem(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ============================================================
// Equipment Form Dialog — add or edit equipment with vendor
// ============================================================
function EquipmentFormDialog({ projectId, categories, vendors, editing, onClose, onSaved }: {
  projectId: string;
  categories: EquipmentCategory[];
  vendors: { id: string; name: string }[];
  editing: ProjectEquip | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedCat, setSelectedCat] = useState(editing?.category || "");
  const [itemName, setItemName] = useState(editing?.itemName || "");
  const [quantity, setQuantity] = useState(String(editing?.quantity || 1));
  const [unitPrice, setUnitPrice] = useState(String(editing?.unitPrice || ""));
  const [vendorId, setVendorId] = useState(editing?.vendorId || "");
  const [vendorName, setVendorName] = useState(editing?.vendorName || "");
  const [vendorContact, setVendorContact] = useState(editing?.vendorContact || "");
  const [vendorPhone, setVendorPhone] = useState(editing?.vendorPhone || "");
  const [vendorEmail, setVendorEmail] = useState(editing?.vendorEmail || "");
  const [vendorBank, setVendorBank] = useState(editing?.vendorBankDetails || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [status, setStatus] = useState(editing?.status || "LISTED");
  const [customItem, setCustomItem] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName) { toast.error("Item name is required"); return; }
    setSubmitting(true);
    try {
      const body: any = {
        action: editing ? "update_equipment" : "add_equipment",
        projectId,
        itemName,
        category: selectedCat || "Other",
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitPrice) || 0,
        vendorId: vendorId || null,
        vendorName: vendorId ? undefined : (vendorName || undefined),
        vendorContact: vendorContact || undefined,
        vendorPhone: vendorPhone || undefined,
        vendorEmail: vendorEmail || undefined,
        vendorBankDetails: vendorBank || undefined,
        status,
        notes: notes || undefined,
      };
      if (editing) body.equipmentId = editing.id;

      const res = await fetch("/api/doz/equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Equipment updated" : "Equipment added");
      onSaved(); onClose();
    } catch { toast.error("Failed to save equipment"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm("Delete this equipment item?")) return;
    try {
      await fetch("/api/doz/equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_equipment", equipmentId: editing.id }),
      });
      toast.success("Equipment deleted");
      onSaved(); onClose();
    } catch { toast.error("Failed to delete"); }
  }

  // When vendor is selected, auto-fill vendor name
  function onVendorChange(id: string) {
    setVendorId(id);
    if (id) {
      const v = vendors.find(v => v.id === id);
      if (v) setVendorName(v.name);
    } else {
      setVendorName("");
    }
  }

  // When category changes, reset item
  function onCategoryChange(catName: string) {
    setSelectedCat(catName);
    setItemName("");
    setShowCustom(false);
  }

  // When item selected from library
  function onItemSelect(name: string) {
    if (name === "__custom__") {
      setShowCustom(true);
      setItemName("");
    } else {
      setShowCustom(false);
      setItemName(name);
    }
  }

  const currentCat = categories.find(c => c.name === selectedCat);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Category */}
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={selectedCat} onValueChange={onCategoryChange}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Item selection */}
          {selectedCat && (
            <div>
              <Label className="text-xs">Item</Label>
              {!showCustom ? (
                <Select value={itemName} onValueChange={onItemSelect}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {currentCat?.items.map(i => <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>)}
                    <SelectItem value="__custom__">+ Add custom item...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Enter custom item name" />
                  <Button type="button" variant="outline" size="sm" onClick={() => { setShowCustom(false); setItemName(""); }}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="1" />
            </div>
            <div>
              <Label className="text-xs">Unit Price (₦)</Label>
              <Input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Vendor */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Vendor Details</p>
            <div>
              <Label className="text-xs">Select Vendor (from database)</Label>
              <Select value={vendorId} onValueChange={onVendorChange}>
                <SelectTrigger><SelectValue placeholder="Pick existing vendor or enter manually" /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!vendorId && (
              <div>
                <Label className="text-xs">Or enter vendor name manually</Label>
                <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Vendor name" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Contact Person</Label><Input value={vendorContact} onChange={e => setVendorContact(e.target.value)} placeholder="Name" /></div>
              <div><Label className="text-xs">Phone</Label><Input value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} placeholder="+234..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Email</Label><Input value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} placeholder="email@vendor.com" /></div>
              <div><Label className="text-xs">Bank Details</Label><Input value={vendorBank} onChange={e => setVendorBank(e.target.value)} placeholder="Bank — Account" /></div>
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LISTED">Listed</SelectItem>
                <SelectItem value="PRICED">Priced</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="ORDERED">Ordered</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes" />
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-2">
            {editing ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting || !itemName}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Add Equipment"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
