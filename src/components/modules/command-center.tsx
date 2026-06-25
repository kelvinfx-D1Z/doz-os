"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
  PriorityDot,
} from "@/components/doz/ui-primitives";
import {
  formatNGN,
  formatDate,
  relativeTime,
  avatarColor,
  initials,
  daysUntil,
  isOverdue,
} from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Target,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  Sparkles,
  Calendar,
  Users,
  CircleDollarSign,
  ListTodo,
  ArrowRight,
  Check,
  X,
  ClipboardList,
  Receipt,
  CalendarClock,
  Megaphone,
  Zap,
  FileWarning,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types — mirror the API contract                                     */
/* ------------------------------------------------------------------ */
interface DashboardData {
  founder: { name: string; title: string; role: string } | null;
  stats: {
    pipelineValue: number;
    weightedPipeline: number;
    openOpps: number;
    wonOpps: number;
    proposalsSent: number;
    proposalsAccepted: number;
    conversionRate: number;
    totalRevenue: number;
    totalExpenses: number;
    grossProfit: number;
    marginPct: number;
    outstandingAmount: number;
    overdueAmount: number;
    overdueCount: number;
    cashPosition: number;
    pendingApprovals: number;
    pendingPaymentsValue: number;
    openTasks: number;
    overdueTasks: number;
    activeProjects: number;
    internsReporting: number;
    totalInterns: number;
    openRfqs: number;
    distractions: number;
  };
  topPriorities: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    category: string | null;
    isDistraction: boolean;
    assignee: { name: string } | null;
  }>;
  weeklyGoal: { id: string; title: string; progress: number; dueDate: string | null } | null;
  goals: Array<{ id: string; title: string; type: string; progress: number; status: string }>;
  pendingApprovals: Array<{
    id: string;
    code: string;
    amount: number;
    description: string | null;
    status: string;
    requester: { name: string } | null;
    project: { name: string } | null;
  }>;
  upcoming: Array<{ type: "TASK" | "EVENT" | "INVOICE"; title: string; due: string; id: string }>;
  openOpps: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    probability: number;
    account: { name: string } | null;
    expectedClose: string | null;
  }>;
  outstandingInvoices: Array<{
    id: string;
    code: string;
    amount: number;
    amountPaid: number;
    status: string;
    dueDate: string | null;
    account: { name: string } | null;
  }>;
  overdueInvoices: Array<{
    id: string;
    code: string;
    amount: number;
    amountPaid: number;
    status: string;
    dueDate: string | null;
    account: { name: string } | null;
  }>;
  serviceMix: Array<{ name: string; value: number; pct: number }>;
  interns: Array<{ id: string; name: string; role: string; title: string | null }>;
  todayReports: Array<{
    id: string;
    user: { name: string; title: string | null };
    reportDate: string;
    tasksDone: string | null;
    blockers: string | null;
    hoursWorked: number;
    mood: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    detail: string | null;
    user: { name: string } | null;
    createdAt: string;
  }>;
  aiInsights: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    isRead: boolean;
  }>;
  pendingRfqs: Array<{ id: string; code: string; title: string; status: string; neededBy: string | null }>;
  followUpsDue: Array<{
    id: string;
    type: string;
    subject: string;
    dueDate: string;
    contact: { name: string } | null;
    opportunity: { account: { name: string } | null } | null;
  }>;
  lostOpps: unknown[];
  tasks: unknown[];
}

/* ------------------------------------------------------------------ */
/* Service-mix palette (NO indigo, NO blue)                            */
/* ------------------------------------------------------------------ */
const SERVICE_COLORS = [
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-orange-500",
];

const MOOD_EMOJI: Record<string, string> = {
  GREAT: "🟢",
  GOOD: "🙂",
  OKAY: "😐",
  STRESSED: "😟",
  BAD: "🔴",
};

function severityColor(sev: string): string {
  switch (sev) {
    case "CRITICAL":
      return "bg-red-500";
    case "WARNING":
      return "bg-amber-500";
    case "INFO":
      return "bg-teal-500";
    default:
      return "bg-zinc-500";
  }
}

function severityRing(sev: string): string {
  switch (sev) {
    case "CRITICAL":
      return "border-red-500/40 bg-red-500/[0.06]";
    case "WARNING":
      return "border-amber-500/40 bg-amber-500/[0.06]";
    case "INFO":
      return "border-teal-500/40 bg-teal-500/[0.06]";
    default:
      return "border-border bg-muted/40";
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(full: string | undefined | null): string {
  if (!full) return "Founder";
  return full.split(" ")[0];
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function CommandCenterSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export function CommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/doz/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DashboardData;
        if (alive) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleApproval = useCallback(
    (action: "approve" | "reject", code: string) => {
      toast({
        title: action === "approve" ? "Approval recorded" : "Request rejected",
        description:
          action === "approve"
            ? `${code} has been queued for payment.`
            : `${code} has been returned to requester.`,
      });
    },
    [toast],
  );

  if (loading) return <CommandCenterSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't load your command center"
          hint={error ?? "Unknown error. Try refreshing the page."}
        />
      </div>
    );
  }

  const { stats, founder } = data;
  const founderName = founder?.name ?? "Adaeze Okonkwo";

  // First critical AI insight -> alert banner
  const criticalInsight =
    data.aiInsights.find((i) => i.severity === "CRITICAL") ?? data.aiInsights[0] ?? null;

  // AI summary line for header
  const summaryParts: string[] = [];
  summaryParts.push(`${data.topPriorities.length} priorities`);
  if (stats.pendingApprovals > 0) summaryParts.push(`${stats.pendingApprovals} pending approvals`);
  if (stats.overdueCount > 0) summaryParts.push(`${formatNGN(stats.overdueAmount, true)} overdue`);
  if (stats.overdueTasks > 0) summaryParts.push(`${stats.overdueTasks} overdue tasks`);
  const aiSummary = summaryParts.join(", ");

  return (
    <div className="space-y-6">
      {/* ---------- Greeting header ---------- */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {todayLong()}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}, <span className="text-primary">{firstName(founderName)}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {aiSummary ? <>You have {aiSummary}. </> : null}
              <span className="text-muted-foreground/70">
                Here&apos;s your company at a glance.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Live
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <Zap className="h-3 w-3" />
              {stats.activeProjects} active projects
            </Badge>
          </div>
        </div>

        {/* Critical insight banner */}
        {criticalInsight && (
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3",
              severityRing(criticalInsight.severity),
            )}
          >
            <div className="mt-0.5 shrink-0">
              {criticalInsight.severity === "CRITICAL" ? (
                <AlertTriangle className="h-4 w-4 text-red-400" />
              ) : criticalInsight.severity === "WARNING" ? (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              ) : (
                <Sparkles className="h-4 w-4 text-teal-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{criticalInsight.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {criticalInsight.message}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </Button>
          </div>
        )}
      </header>

      {/* ---------- KPI row ---------- */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Pipeline Value"
          value={formatNGN(stats.pipelineValue, true)}
          sub={`${stats.openOpps} open · ${formatNGN(stats.weightedPipeline, true)} weighted`}
          accent="primary"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Cash Position"
          value={formatNGN(stats.cashPosition, true)}
          sub={stats.cashPosition >= 0 ? "Healthy" : "Negative — review"}
          accent={stats.cashPosition >= 0 ? "primary" : "danger"}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Gross Profit"
          value={formatNGN(stats.grossProfit, true)}
          sub={`${stats.marginPct.toFixed(1)}% margin`}
          accent="primary"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Outstanding Invoices"
          value={formatNGN(stats.outstandingAmount, true)}
          sub={
            stats.overdueCount > 0
              ? `${stats.overdueCount} overdue · ${formatNGN(stats.overdueAmount, true)}`
              : "None overdue"
          }
          accent={stats.overdueCount > 0 ? "danger" : "default"}
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatCard
          label="Pending Approvals"
          value={stats.pendingApprovals}
          sub={
            stats.pendingPaymentsValue > 0
              ? `${formatNGN(stats.pendingPaymentsValue, true)} queued`
              : "Nothing waiting"
          }
          accent={stats.pendingApprovals > 0 ? "warning" : "default"}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatCard
          label="Active Projects"
          value={stats.activeProjects}
          sub={`${stats.openTasks} open tasks`}
          accent="default"
          icon={<ListTodo className="h-4 w-4" />}
        />
      </section>

      {/* ---------- Main grid ---------- */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN */}
        <div className="space-y-6 lg:col-span-2">
          {/* Top Priorities */}
          <Card className="p-5">
            <SectionHeader
              title="Today's Top Priorities"
              description="What needs your focus right now"
              icon={<Target className="h-4 w-4" />}
              action={
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            <div className="mt-3 space-y-1">
              {data.topPriorities.length === 0 && (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="Inbox zero for priorities"
                  hint="Nothing urgent due today. Use the headroom for deep work."
                />
              )}
              {data.topPriorities.map((p) => {
                const overdue = p.dueDate ? isOverdue(p.dueDate) : false;
                const done = p.status === "DONE";
                return (
                  <div
                    key={p.id}
                    className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <button
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 hover:border-primary",
                      )}
                      aria-label="Toggle complete"
                    >
                      {done && <Check className="h-3 w-3" />}
                    </button>
                    <span className="mt-1">
                      <PriorityDot priority={p.priority} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            done && "text-muted-foreground line-through",
                            overdue && !done && "text-red-400",
                          )}
                        >
                          {p.title}
                        </p>
                        {p.isDistraction && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-[9px] font-bold uppercase tracking-wide text-amber-400"
                          >
                            Distraction
                          </Badge>
                        )}
                        {p.category && (
                          <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                            {p.category.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {p.assignee && <span>{p.assignee.name}</span>}
                        {p.dueDate && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className={cn(overdue && !done && "text-red-400")}>
                              {relativeTime(p.dueDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Pending Approvals */}
          <Card className="p-5">
            <SectionHeader
              title="Pending Approvals"
              description="Payments waiting for your sign-off"
              icon={<ClipboardList className="h-4 w-4" />}
              action={
                stats.pendingApprovals > 0 ? (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                    {stats.pendingApprovals} pending
                  </Badge>
                ) : undefined
              }
            />
            <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
              {data.pendingApprovals.length === 0 && (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="Nothing waiting for approval"
                  hint="All payment requests have been actioned."
                />
              )}
              {data.pendingApprovals.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{a.code}</span>
                      <StatusBadge status={a.status} />
                      {a.project && (
                        <span className="text-[11px] text-muted-foreground">{a.project.name}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">
                      {a.description ?? "Payment request"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Requested by {a.requester?.name ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold">{formatNGN(a.amount)}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 gap-1 bg-primary px-2 text-xs hover:bg-primary/90"
                        onClick={() => handleApproval("approve", a.code)}
                      >
                        <Check className="h-3 w-3" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 border-red-500/40 px-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-400"
                        onClick={() => handleApproval("reject", a.code)}
                      >
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Revenue Pipeline / Service Mix */}
          <Card className="p-5">
            <SectionHeader
              title="Revenue by Service Line"
              description="Where your money comes from"
              icon={<CircleDollarSign className="h-4 w-4" />}
            />
            {data.serviceMix.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<CircleDollarSign className="h-6 w-6" />}
                  title="No project revenue recorded yet"
                  hint="Service mix appears once confirmed projects have revenue."
                />
              </div>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {data.serviceMix.map((s, i) => (
                    <div
                      key={s.name}
                      className={cn("h-full", SERVICE_COLORS[i % SERVICE_COLORS.length])}
                      style={{ width: `${s.pct}%` }}
                      title={`${s.name}: ${formatNGN(s.value, true)} (${s.pct.toFixed(1)}%)`}
                    />
                  ))}
                </div>
                {/* Legend list */}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {data.serviceMix.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-sm",
                          SERVICE_COLORS[i % SERVICE_COLORS.length],
                        )}
                      />
                      <span className="truncate text-xs font-medium">{s.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatNGN(s.value, true)}
                      </span>
                      <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground/70">
                        {s.pct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Weekly Objective */}
          <Card className="p-5">
            <SectionHeader
              title="Weekly Objective"
              icon={<Target className="h-4 w-4" />}
              action={
                data.weeklyGoal?.dueDate ? (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {relativeTime(data.weeklyGoal.dueDate)}
                  </Badge>
                ) : undefined
              }
            />
            {data.weeklyGoal ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">{data.weeklyGoal.title}</p>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-primary">
                      {data.weeklyGoal.progress.toFixed(0)}% complete
                    </span>
                  </div>
                  <MiniBar value={data.weeklyGoal.progress} max={100} color="bg-primary" />
                </div>
                {data.weeklyGoal.dueDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(data.weeklyGoal.dueDate)}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  icon={<Target className="h-6 w-6" />}
                  title="No weekly goal set"
                  hint="Set a single objective for this week to anchor your priorities."
                />
              </div>
            )}
          </Card>

          {/* Upcoming Deadlines */}
          <Card className="p-5">
            <SectionHeader
              title="Upcoming Deadlines"
              description="Next 7 days"
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-1 pr-1">
              {data.upcoming.length === 0 && (
                <EmptyState
                  icon={<Calendar className="h-6 w-6" />}
                  title="Nothing due this week"
                  hint="Your calendar is clear for the next 7 days."
                />
              )}
              {data.upcoming.map((u) => {
                const overdue = isOverdue(u.due);
                const Icon =
                  u.type === "TASK" ? ListTodo : u.type === "EVENT" ? Calendar : Receipt;
                return (
                  <div
                    key={`${u.type}-${u.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.title}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {u.type}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        overdue ? "text-red-400" : "text-muted-foreground",
                      )}
                    >
                      {relativeTime(u.due)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* AI Chief of Staff preview */}
          <Card className="p-5">
            <SectionHeader
              title="AI Chief of Staff"
              description="Today's reads"
              icon={<Sparkles className="h-4 w-4" />}
              action={
                <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                  <Sparkles className="h-3 w-3" /> AI
                </Badge>
              }
            />
            <div className="mt-3 space-y-2">
              {data.aiInsights.length === 0 && (
                <EmptyState
                  icon={<Sparkles className="h-6 w-6" />}
                  title="No insights yet"
                  hint="The AI will surface opportunities and risks as your data grows."
                />
              )}
              {data.aiInsights.slice(0, 3).map((ins) => (
                <div
                  key={ins.id}
                  className="flex items-start gap-2.5 rounded-md border border-border bg-card/40 p-2.5"
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      severityColor(ins.severity),
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{ins.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {ins.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open AI Chief of Staff
            </Button>
          </Card>

          {/* Intern Reports Today */}
          <Card className="p-5">
            <SectionHeader
              title="Intern Reports Today"
              icon={<Users className="h-4 w-4" />}
              action={
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {stats.internsReporting}/{stats.totalInterns} reported
                </Badge>
              }
            />
            {stats.totalInterns > 0 && stats.internsReporting < stats.totalInterns && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300/90">
                  {stats.totalInterns - stats.internsReporting} of {stats.totalInterns} interns
                  haven&apos;t submitted today&apos;s report.
                </p>
              </div>
            )}
            <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
              {data.todayReports.length === 0 && (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="No reports submitted today"
                  hint="Reports will appear here as interns submit them."
                />
              )}
              {data.todayReports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-2.5"
                >
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarFallback
                      className={cn("text-[10px] font-semibold", avatarColor(r.user.name))}
                    >
                      {initials(r.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{r.user.name}</p>
                      <span className="text-xs">{MOOD_EMOJI[r.mood ?? ""] ?? "·"}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.tasksDone?.split("\n")[0] ?? "No tasks logged"}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {r.hoursWorked.toFixed(1)}h
                      </span>
                      {r.blockers && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          blocker
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-xs text-primary hover:bg-primary/10"
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* ---------- Bottom row ---------- */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Open Opportunities */}
        <Card className="p-5">
          <SectionHeader
            title="Open Opportunities"
            description={`${stats.openOpps} active · ${formatNGN(stats.pipelineValue, true)} pipeline`}
            icon={<TrendingUp className="h-4 w-4" />}
            action={
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                Pipeline <ArrowRight className="h-3 w-3" />
              </Button>
            }
          />
          <div className="mt-3 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Account</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 text-right font-medium">Value</th>
                  <th className="px-2 py-2 text-right font-medium">Prob.</th>
                </tr>
              </thead>
              <tbody>
                {data.openOpps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-6">
                      <EmptyState
                        icon={<TrendingUp className="h-6 w-6" />}
                        title="No open opportunities"
                        hint="Add leads and opportunities to build your pipeline."
                      />
                    </td>
                  </tr>
                )}
                {data.openOpps.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
                  >
                    <td className="px-2 py-2.5">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.account?.name ?? "—"}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusBadge status={o.stage} />
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                      {formatNGN(o.value, true)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="ml-auto flex w-14 items-center gap-1.5">
                        <MiniBar
                          value={o.probability}
                          max={100}
                          color={
                            o.probability >= 70
                              ? "bg-primary"
                              : o.probability >= 40
                                ? "bg-amber-500"
                                : "bg-zinc-500"
                          }
                        />
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                          {o.probability}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-5">
          <SectionHeader
            title="Recent Activity"
            description="Last actions across DOZ OS"
            icon={<Megaphone className="h-4 w-4" />}
          />
          <div className="mt-3 max-h-96 overflow-y-auto scroll-thin pr-1">
            <ScrollArea className="h-[360px]">
              {data.recentActivity.length === 0 && (
                <EmptyState
                  icon={<Megaphone className="h-6 w-6" />}
                  title="No activity yet"
                  hint="Actions taken across the platform will show up here."
                />
              )}
              <ol className="relative space-y-3">
                {data.recentActivity.map((a, idx) => (
                  <li key={a.id} className="relative flex items-start gap-3 pl-1">
                    {/* timeline line */}
                    {idx < data.recentActivity.length - 1 && (
                      <span className="absolute left-[15px] top-9 h-[calc(100%+0px)] w-px bg-border" />
                    )}
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarFallback
                        className={cn("text-[10px] font-semibold", avatarColor(a.user?.name ?? "??"))}
                      >
                        {initials(a.user?.name ?? "??")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{a.user?.name ?? "System"}</span>{" "}
                        <span className="text-muted-foreground">{a.action.toLowerCase()}</span>
                      </p>
                      {a.detail && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.detail}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {relativeTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </div>
        </Card>
      </section>
    </div>
  );
}
