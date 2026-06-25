"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
    avgMargin: number;
  };
  projects: Project[];
}

// ---------- Constants ----------
const ACTIVE_STATUSES = ["PLANNING", "CONFIRMED", "IN_PROGRESS"];

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
  const [data, setData] = useState<ProjectsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/projects")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((d: ProjectsData) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <ProjectsSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={<Clapperboard className="h-5 w-5" />}
          title="Projects & Event Operations"
          description="Deliver every event on time, on budget"
        />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't load projects"
          hint={error ?? "Unknown error"}
        />
      </div>
    );
  }

  const { stats, projects } = data;

  // Filter by tab
  const filtered = projects.filter((p) => {
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
        title="Projects & Event Operations"
        description={`${stats.total} projects · ${stats.active} active · ${stats.completed} delivered`}
      />

      {/* KPI ROW */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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

      {/* PROJECT LIST WITH TABS */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">All ({projects.length})</TabsTrigger>
            <TabsTrigger value="active" className="text-xs">Active ({projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length})</TabsTrigger>
            <TabsTrigger value="planning" className="text-xs">Planning ({projects.filter((p) => p.status === "PLANNING").length})</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">In Progress ({projects.filter((p) => p.status === "IN_PROGRESS").length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Completed ({projects.filter((p) => p.status === "COMPLETED").length})</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of {projects.length}
          </p>
        </div>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-8 w-8" />}
              title="No projects in this view"
              hint="Switch tabs to see other projects."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Project Card ----------
function ProjectCard({ project: p }: { project: Project }) {
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

          {/* Financial bar */}
          <div className="mt-3 space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold text-foreground">
                {formatNGN(p.revenue, true)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Budget</span>
              <span className="font-medium text-foreground">
                {formatNGN(p.budget, true)}
              </span>
            </div>
            <MiniBar
              value={p.expensesTotal}
              max={p.budget > 0 ? p.budget : p.revenue || 1}
              color={overBudgetWarn ? "bg-amber-500" : "bg-emerald-500"}
            />
            <div className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
              <span>Spent {formatNGN(p.expensesTotal, true)} ({budgetUtil.toFixed(0)}% budget)</span>
              {overBudgetWarn && (
                <span className="inline-flex items-center gap-1 font-medium text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  High burn
                </span>
              )}
            </div>
          </div>

          {/* Profit + margin */}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</p>
            <p className="mt-0.5 text-sm font-semibold">{formatNGN(p.revenue, true)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</p>
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
