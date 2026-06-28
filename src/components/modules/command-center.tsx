"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { FocusScoreCard } from "@/components/doz/focus-score-card";
import { AiBriefingCard } from "@/components/doz/ai-briefing-card";
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
  Plus,
  Circle,
  Loader2,
  XCircle,
  GraduationCap,
  Briefcase,
  Film,
  BookOpen,
  Send,
  Award,
  Lightbulb,
  Clapperboard,
} from "lucide-react";
import { useAppStore, type ModuleId } from "@/lib/store";

/* ------------------------------------------------------------------ */
/* Types — mirror the API contract                                     */
/* ------------------------------------------------------------------ */
interface DashboardData {
  founder: { name: string; title: string; role: string } | null;
  currentUser: { id: string; name: string; email: string; role: string; title: string | null };
  myDay: MyDay;
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
/* Role-aware "myDay" types                                            */
/* ------------------------------------------------------------------ */
interface MyDayTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  isDistraction: boolean;
  dueDate: string | null;
  completedAt: string | null;
  assignee: { id: string; name: string; role: string } | null;
  goal: { id: string; title: string } | null;
  project: { id: string; name: string } | null;
}
interface MyDay {
  tasks: MyDayTask[];
  taskCount: number;
  overdueCount: number;
  doneToday: number;
  reportFiled: boolean;
  todayReportId: string | null;
  weeklyObjective: { id: string; title: string; progress: number; dueDate: string | null } | null;
  pendingApprovals: number;
  pendingApprovalItems: Array<{
    id: string;
    code: string;
    amount: number;
    description: string | null;
    status: string;
    requester: { name: string } | null;
    project: { name: string } | null;
  }>;
  myProjects: Array<{
    id: string;
    name: string;
    code: string | null;
    status: string;
    serviceType: string;
    eventDate: string | null;
    progress: number;
    account: { name: string } | null;
  }>;
  myPendingRequests: Array<{
    id: string;
    code: string;
    amount: number;
    status: string;
    description: string | null;
    project: { name: string } | null;
    approver: { name: string } | null;
  }>;
  crewAssignments: Array<{
    id: string;
    role: string;
    dayRate: number;
    status: string;
    project: {
      id: string;
      name: string;
      code: string | null;
      eventDate: string | null;
      venue: string | null;
      serviceType: string;
      status: string;
      account: { name: string } | null;
    };
  }>;
  deliverables: Array<{
    id: string;
    title: string;
    type: string | null;
    status: string;
    dueDate: string | null;
    deliveredAt: string | null;
    project: { id: string; name: string };
  }>;
  recentReports: Array<{
    id: string;
    reportDate: string;
    tasksDone: string | null;
    blockers: string | null;
    hoursWorked: number;
    mood: string | null;
  }>;
  learningPlan: Array<{ id: string; title: string; category: string; updatedAt: string }>;
  teamReportsToday: number;
  teamReportsTotal: number;
  teamActivity: Array<{
    id: string;
    action: string;
    detail: string | null;
    user: { name: string; role: string } | null;
    createdAt: string;
  }>;
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

/* ------------------------------------------------------------------ */
/* Tasks API types                                                     */
/* ------------------------------------------------------------------ */
interface TaskApi {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  isDistraction: boolean;
  dueDate: string | null;
  completedAt: string | null;
  assignee: { id: string; name: string; role: string } | null;
  creator: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  project: { id: string; name: string } | null;
}

function todayISODate(): string {
  // Local-date YYYY-MM-DD for <input type="date">
  const n = new Date();
  const y = n.getFullYear();
  const m = (n.getMonth() + 1).toString().padStart(2, "0");
  const d = n.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  const { user } = useCurrentUser();

  // Task interaction state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showMyDay, setShowMyDay] = useState(false);
  const [myDayTasks, setMyDayTasks] = useState<TaskApi[]>([]);
  const [myDayLoading, setMyDayLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/doz/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setLoading(false);
    }
  }, []);

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

  // Toggle a task's status via PATCH /api/doz/tasks
  // Optimistically updates the priorities list, then refreshes dashboard.
  const handleToggleTask = useCallback(
    async (taskId: string, currentlyDone: boolean) => {
      if (togglingId) return; // prevent double-clicks
      setTogglingId(taskId);

      // Optimistic update — flip the local priority status
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          topPriorities: prev.topPriorities.map((p) =>
            p.id === taskId
              ? {
                  ...p,
                  status: currentlyDone ? "TODO" : "DONE",
                }
              : p,
          ),
        };
      });
      // Also optimistic update for myDayTasks if present
      setMyDayTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: currentlyDone ? "TODO" : "DONE",
                completedAt: currentlyDone ? null : new Date().toISOString(),
              }
            : t,
        ),
      );

      try {
        const res = await fetch("/api/doz/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, action: "toggle" }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        sonnerToast.success(
          currentlyDone ? "Task reopened" : "Task completed",
          {
            description: currentlyDone
              ? "Marked as TODO again."
              : "Nice work — keep the momentum.",
          },
        );
        // Refresh dashboard data (non-blocking)
        loadData();
      } catch (e) {
        // Revert optimistic update
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            topPriorities: prev.topPriorities.map((p) =>
              p.id === taskId
                ? { ...p, status: currentlyDone ? "DONE" : "TODO" }
                : p,
            ),
          };
        });
        setMyDayTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: currentlyDone ? "DONE" : "TODO",
                  completedAt: currentlyDone ? new Date().toISOString() : null,
                }
              : t,
          ),
        );
        sonnerToast.error("Couldn't update task", {
          description: e instanceof Error ? e.message : "Try again.",
        });
      } finally {
        setTogglingId(null);
      }
    },
    [togglingId, loadData],
  );

  // Open the "My Daily Tasks" dialog and fetch the user's full day's tasks
  const openMyDay = useCallback(async () => {
    setShowMyDay(true);
    setMyDayLoading(true);
    try {
      const res = await fetch("/api/doz/tasks?scope=my-day", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { tasks: TaskApi[] };
      setMyDayTasks(json.tasks ?? []);
    } catch {
      setMyDayTasks([]);
      sonnerToast.error("Couldn't load your daily tasks");
    } finally {
      setMyDayLoading(false);
    }
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

  const { stats, founder, currentUser: apiUser } = data;
  // Prefer the session user's name (so interns/staff see THEIR name, not the
  // founder's). Fall back to the API's currentUser, then the founder record.
  const displayName = user?.name ?? apiUser?.name ?? founder?.name ?? "Kelvin Keshy";
  const role = user?.role ?? apiUser?.role ?? "FOUNDER";

  // Shared props passed to every role-specific view.
  const roleViewProps = {
    data,
    user: {
      id: user?.id ?? apiUser?.id ?? "",
      name: displayName,
      role,
      title: user?.title ?? apiUser?.title ?? null,
    },
    handleToggleTask,
    togglingId,
    openMyDay,
    loadData,
    defaultAssigneeId: user?.id ?? apiUser?.id,
    setShowQuickAdd,
    setShowMyDay,
    myDayTasks,
    myDayLoading,
    handleApproval,
  };

  // ---------- ROLE-AWARE EARLY RETURNS ----------
  // Each non-founder role gets its own focused dashboard. Founder keeps the
  // company-wide layout below.
  if (role === "INTERN") {
    return (
      <div className="space-y-6">
        <InternDashboard {...roleViewProps} />
        <QuickAddTaskDialog
          open={showQuickAdd}
          onOpenChange={setShowQuickAdd}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
          defaultDueDate={todayISODate()}
          onCreated={() => {
            setShowQuickAdd(false);
            loadData();
          }}
        />
        <MyDayDialog
          open={showMyDay}
          onOpenChange={setShowMyDay}
          tasks={myDayTasks}
          loading={myDayLoading}
          togglingId={togglingId}
          onToggle={handleToggleTask}
          onRefresh={openMyDay}
          userName={displayName}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
        />
      </div>
    );
  }

  if (role === "FREELANCER") {
    return (
      <div className="space-y-6">
        <FreelancerDashboard {...roleViewProps} />
        <QuickAddTaskDialog
          open={showQuickAdd}
          onOpenChange={setShowQuickAdd}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
          defaultDueDate={todayISODate()}
          onCreated={() => {
            setShowQuickAdd(false);
            loadData();
          }}
        />
        <MyDayDialog
          open={showMyDay}
          onOpenChange={setShowMyDay}
          tasks={myDayTasks}
          loading={myDayLoading}
          togglingId={togglingId}
          onToggle={handleToggleTask}
          onRefresh={openMyDay}
          userName={displayName}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
        />
      </div>
    );
  }

  if (role === "STAFF") {
    return (
      <div className="space-y-6">
        <StaffDashboard {...roleViewProps} />
        <QuickAddTaskDialog
          open={showQuickAdd}
          onOpenChange={setShowQuickAdd}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
          defaultDueDate={todayISODate()}
          onCreated={() => {
            setShowQuickAdd(false);
            loadData();
          }}
        />
        <MyDayDialog
          open={showMyDay}
          onOpenChange={setShowMyDay}
          tasks={myDayTasks}
          loading={myDayLoading}
          togglingId={togglingId}
          onToggle={handleToggleTask}
          onRefresh={openMyDay}
          userName={displayName}
          defaultAssigneeId={roleViewProps.defaultAssigneeId}
        />
      </div>
    );
  }

  // ---------- FOUNDER (or unknown role) — company-wide layout ----------
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
              {greeting()}, <span className="text-primary">{firstName(displayName)}</span>
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

        {/* ---------- Company Vision Banner ---------- */}
        <div className="relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Company North Star</p>
              <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">
                ₦500M+ revenue · 25%+ margin · 40+ clients · EventCo launch by 2028
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Year 1 target: ₦120M revenue · 15 clients · Founder operational time below 50%
              </p>
            </div>
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

      {/* ---------- AI Morning Briefing (founder & staff only) ---------- */}
      {(user?.role === "FOUNDER" || user?.role === "STAFF") && <AiBriefingCard />}

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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={openMyDay}
                >
                  My Daily Tasks <ArrowRight className="h-3 w-3" />
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
                const isToggling = togglingId === p.id;
                return (
                  <div
                    key={p.id}
                    className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTask(p.id, done)}
                      disabled={isToggling}
                      aria-label={done ? "Reopen task" : "Complete task"}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
                      )}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : done ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </button>
                    <span className="mt-1.5">
                      <PriorityDot priority={p.priority} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "truncate text-sm font-medium transition-all",
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

            {/* Quick add task button */}
            <div className="mt-3 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-dashed text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => setShowQuickAdd(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </Button>
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
          {/* Focus & Alignment (founder & staff only) */}
          {(user?.role === "FOUNDER" || user?.role === "STAFF") && (
            <FocusScoreCard />
          )}

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

      {/* ---------- Quick add task dialog ---------- */}
      <QuickAddTaskDialog
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        defaultAssigneeId={user?.id}
        defaultDueDate={todayISODate()}
        onCreated={() => {
          setShowQuickAdd(false);
          loadData();
        }}
      />

      {/* ---------- My Daily Tasks dialog ---------- */}
      <MyDayDialog
        open={showMyDay}
        onOpenChange={setShowMyDay}
        tasks={myDayTasks}
        loading={myDayLoading}
        togglingId={togglingId}
        onToggle={handleToggleTask}
        onRefresh={openMyDay}
        userName={user?.name}
        defaultAssigneeId={user?.id}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick Add Task Dialog                                                */
/* ------------------------------------------------------------------ */
function QuickAddTaskDialog({
  open,
  onOpenChange,
  defaultAssigneeId,
  defaultDueDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAssigneeId?: string;
  defaultDueDate: string;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog is opened
  useEffect(() => {
    if (open) {
      setTitle("");
      setPriority("MEDIUM");
      setDueDate(defaultDueDate);
      setDescription("");
    }
  }, [open, defaultDueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      sonnerToast.error("Title is required");
      return;
    }
    if (!defaultAssigneeId) {
      sonnerToast.error("You must be signed in to create a task");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          assigneeId: defaultAssigneeId,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      sonnerToast.success("Task added", {
        description: `"${title.trim()}" is on your list.`,
      });
      onCreated?.();
    } catch (e) {
      sonnerToast.error("Couldn't create task", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Add a task
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qt-title">Title</Label>
            <Input
              id="qt-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call GTBank to confirm event date"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qt-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="qt-priority">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-due">Due date</Label>
              <Input
                id="qt-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qt-desc">Description (optional)</Label>
            <Textarea
              id="qt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any context, links, or sub-steps..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !title.trim()}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* My Daily Tasks Dialog — full daily task list for the current user   */
/* ------------------------------------------------------------------ */
function MyDayDialog({
  open,
  onOpenChange,
  tasks,
  loading,
  togglingId,
  onToggle,
  onRefresh,
  userName,
  defaultAssigneeId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tasks: TaskApi[];
  loading: boolean;
  togglingId: string | null;
  onToggle: (taskId: string, currentlyDone: boolean) => void;
  onRefresh: () => void | Promise<void>;
  userName?: string;
  defaultAssigneeId?: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const pendingCount = tasks.length - doneCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            My Daily Tasks
            {tasks.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">
                {doneCount}/{tasks.length} done
              </Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {userName ? `Hi ${userName.split(" ")[0]}, ` : "Here's "}
            here's everything on your plate for today.
          </p>
        </DialogHeader>

        {/* Summary row */}
        {!loading && tasks.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border bg-muted/30 p-2 text-center">
              <p className="text-lg font-semibold">{tasks.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-center">
              <p className="text-lg font-semibold text-amber-400">{pendingCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/[0.06] p-2 text-center">
              <p className="text-lg font-semibold text-primary">{doneCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {!loading && tasks.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Today's progress</span>
              <span className="font-semibold text-primary">
                {Math.round((doneCount / Math.max(1, tasks.length)) * 100)}%
              </span>
            </div>
            <MiniBar
              value={doneCount}
              max={Math.max(1, tasks.length)}
              color="bg-primary"
            />
          </div>
        )}

        {/* Task list */}
        <div className="max-h-[400px] overflow-y-auto scroll-thin pr-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your tasks…
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" />}
              title="Nothing due today or overdue"
              hint="You're all caught up. Add a quick task if something comes up."
            />
          ) : (
            <div className="space-y-1">
              {tasks.map((t) => {
                const done = t.status === "DONE";
                const overdue = t.dueDate ? isOverdue(t.dueDate) : false;
                const isToggling = togglingId === t.id;
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-2.5 transition-colors hover:bg-accent/40"
                  >
                    <button
                      type="button"
                      onClick={() => onToggle(t.id, done)}
                      disabled={isToggling}
                      aria-label={done ? "Reopen task" : "Complete task"}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
                      )}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : done ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </button>
                    <span className="mt-1.5">
                      <PriorityDot priority={t.priority} />
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
                          {t.title}
                        </p>
                        {t.isDistraction && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-[9px] font-bold uppercase tracking-wide text-amber-400"
                          >
                            Distraction
                          </Badge>
                        )}
                        {t.category && (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                          >
                            {t.category.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {t.project && <span>{t.project.name}</span>}
                        {t.dueDate && (
                          <>
                            {t.project && <span className="text-muted-foreground/40">·</span>}
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                overdue && !done && "text-red-400",
                              )}
                            >
                              <Clock className="h-3 w-3" />
                              {relativeTime(t.dueDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onRefresh()}
            disabled={loading}
          >
            <Loader2 className={cn("h-3.5 w-3.5", !loading && "hidden")} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </DialogFooter>

        {/* Nested quick-add */}
        <QuickAddTaskDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          defaultAssigneeId={defaultAssigneeId}
          defaultDueDate={todayISODate()}
          onCreated={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* ROLE-AWARE DASHBOARDS — Intern, Staff, Freelancer                   */
/* ================================================================== */

interface RoleViewProps {
  data: DashboardData;
  user: { id: string; name: string; role: string; title?: string | null };
  handleToggleTask: (taskId: string, currentlyDone: boolean) => void;
  togglingId: string | null;
  openMyDay: () => void;
  loadData: () => void;
  defaultAssigneeId?: string;
  setShowQuickAdd: (v: boolean) => void;
  setShowMyDay: (v: boolean) => void;
  myDayTasks: TaskApi[];
  myDayLoading: boolean;
  handleApproval: (action: "approve" | "reject", code: string) => void;
}

/* ---------- Shared: Daily Report filing banner ------------------ */
function DailyReportBanner({
  filed,
  userName,
  onFile,
}: {
  filed: boolean;
  userName: string;
  onFile: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        filed
          ? "border-emerald-500/40 bg-emerald-500/[0.06]"
          : "border-amber-500/50 bg-amber-500/[0.08]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            filed
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400",
          )}
        >
          {filed ? <CheckCircle2 className="h-5 w-5" /> : <FileWarning className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", filed ? "text-emerald-300" : "text-amber-300")}>
            {filed ? "Daily report filed ✓" : "You haven't filed your daily report yet"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filed
              ? `Nice work, ${firstName(userName)} — your report for today is in. Keep the streak going.`
              : `Take 2 minutes to log what you did today, ${firstName(userName)}. It helps your team stay aligned.`}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={onFile}
        className={cn(
          "shrink-0 gap-1.5",
          filed
            ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            : "bg-amber-500 text-amber-950 hover:bg-amber-400",
        )}
      >
        {filed ? (
          <>
            <BookOpen className="h-3.5 w-3.5" /> View / Edit report
          </>
        ) : (
          <>
            <Send className="h-3.5 w-3.5" /> File Your Daily Report
          </>
        )}
      </Button>
    </div>
  );
}

/* ---------- Shared: My Tasks list (with checkboxes) ------------- */
function MyTasksList({
  tasks,
  handleToggleTask,
  togglingId,
  onAdd,
  emptyTitle = "Nothing due today",
  emptyHint = "You're all caught up.",
}: {
  tasks: MyDayTask[];
  handleToggleTask: (taskId: string, currentlyDone: boolean) => void;
  togglingId: string | null;
  onAdd?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (tasks.length === 0) {
    return (
      <div className="mt-3">
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title={emptyTitle}
          hint={emptyHint}
        />
        {onAdd && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full gap-1.5 border-dashed text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5" /> Add a task
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-1">
      {tasks.map((t) => {
        const done = t.status === "DONE";
        const overdue = t.dueDate ? isOverdue(t.dueDate) : false;
        const isToggling = togglingId === t.id;
        return (
          <div
            key={t.id}
            className="group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/40"
          >
            <button
              type="button"
              onClick={() => handleToggleTask(t.id, done)}
              disabled={isToggling}
              aria-label={done ? "Reopen task" : "Complete task"}
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-primary hover:bg-primary/10",
              )}
            >
              {isToggling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : done ? (
                <Check className="h-3 w-3" />
              ) : null}
            </button>
            <span className="mt-1.5">
              <PriorityDot priority={t.priority} />
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
                  {t.title}
                </p>
                {t.isDistraction && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-[9px] font-bold uppercase tracking-wide text-amber-400"
                  >
                    Distraction
                  </Badge>
                )}
                {t.category && (
                  <Badge
                    variant="outline"
                    className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t.category.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {t.project && <span>{t.project.name}</span>}
                {t.dueDate && (
                  <>
                    {t.project && <span className="text-muted-foreground/40">·</span>}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        overdue && !done && "text-red-400",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {relativeTime(t.dueDate)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {onAdd && (
        <div className="mt-2 border-t border-border pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-dashed text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5" /> Add a task
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Shared: small KPI row for role views ----------------- */
function RoleHeader({
  userName,
  subtitle,
  badges,
}: {
  userName: string;
  subtitle: string;
  badges?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {todayLong()}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, <span className="text-primary">{firstName(userName)}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {badges && <div className="flex items-center gap-2">{badges}</div>}
      </div>
    </header>
  );
}

/* ================================================================== */
/* INTERN DASHBOARD                                                    */
/* ================================================================== */
function InternDashboard({
  data,
  user,
  handleToggleTask,
  togglingId,
  setShowQuickAdd,
  setShowMyDay,
}: RoleViewProps) {
  const setModule = useAppStore((s) => s.setModule);
  const { myDay } = data;
  const myTasks = myDay.tasks;
  const doneToday = myDay.doneToday;
  const overdueCount = myDay.overdueCount;
  const weeklyPct = myDay.weeklyObjective?.progress ?? 0;

  return (
    <>
      <RoleHeader
        userName={user.name}
        subtitle="Here's your plan for today — stay focused, you've got this."
        badges={
          <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Intern
          </Badge>
        }
      />

      {/* File daily report — prominent banner */}
      <DailyReportBanner
        filed={myDay.reportFiled}
        userName={user.name}
        onFile={() => setModule("field" as ModuleId)}
      />

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Tasks Today"
          value={myTasks.length}
          sub={myTasks.length === 0 ? "Inbox zero 🎉" : `${myTasks.filter((t) => t.status !== "DONE").length} pending`}
          accent={myTasks.length > 0 ? "primary" : "default"}
          icon={<ListTodo className="h-4 w-4" />}
        />
        <StatCard
          label="Done Today"
          value={doneToday}
          sub={doneToday > 0 ? "Great momentum" : "Get one done today"}
          accent="primary"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          sub={overdueCount > 0 ? "Clear these first" : "None — you're on track"}
          accent={overdueCount > 0 ? "danger" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Weekly Goal"
          value={`${weeklyPct}%`}
          sub={myDay.weeklyObjective ? "of your weekly objective" : "No goal set"}
          accent="primary"
          icon={<Target className="h-4 w-4" />}
        />
      </section>

      {/* Main grid */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {/* Your Tasks Today */}
          <Card className="p-5">
            <SectionHeader
              title="Your Tasks Today"
              description="Check them off as you go"
              icon={<ListTodo className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setShowMyDay(true)}
                >
                  All my tasks <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            <MyTasksList
              tasks={myTasks}
              handleToggleTask={handleToggleTask}
              togglingId={togglingId}
              onAdd={() => setShowQuickAdd(true)}
              emptyTitle="No tasks due today"
              emptyHint="Ask your supervisor for assignments, or add one yourself."
            />
          </Card>

          {/* Your Weekly Objective */}
          <Card className="p-5">
            <SectionHeader
              title="Your Weekly Objective"
              icon={<Target className="h-4 w-4" />}
              action={
                myDay.weeklyObjective?.dueDate ? (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {relativeTime(myDay.weeklyObjective.dueDate)}
                  </Badge>
                ) : undefined
              }
            />
            {myDay.weeklyObjective ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">{myDay.weeklyObjective.title}</p>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-primary">
                      {myDay.weeklyObjective.progress.toFixed(0)}% complete
                    </span>
                  </div>
                  <MiniBar value={myDay.weeklyObjective.progress} max={100} color="bg-primary" />
                </div>
                {myDay.weeklyObjective.dueDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(myDay.weeklyObjective.dueDate)}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  icon={<Target className="h-6 w-6" />}
                  title="No weekly objective linked to you yet"
                  hint="Your supervisor will assign one. Meanwhile, focus on today's tasks."
                />
              </div>
            )}
          </Card>

          {/* Your Learning Plan */}
          <Card className="p-5">
            <SectionHeader
              title="Your Learning Plan"
              description="Training materials picked for you"
              icon={<GraduationCap className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setModule("sop" as ModuleId)}
                >
                  SOP & Knowledge <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            {myDay.learningPlan.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="No training materials yet"
                  hint="Check the SOP & Knowledge module for the full library."
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {myDay.learningPlan.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setModule("sop" as ModuleId)}
                    className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {s.category.replace(/_/g, " ")} · updated {relativeTime(s.updatedAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* Quick actions */}
          <Card className="p-5">
            <SectionHeader title="Quick Actions" icon={<Zap className="h-4 w-4" />} />
            <div className="mt-3 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => setModule("field" as ModuleId)}
              >
                <Send className="h-3.5 w-3.5" /> File daily report
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setModule("sop" as ModuleId)}
              >
                <BookOpen className="h-3.5 w-3.5" /> Browse SOPs & training
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setModule("projects" as ModuleId)}
              >
                <Briefcase className="h-3.5 w-3.5" /> View projects
              </Button>
            </div>
          </Card>

          {/* Your Recent Reports */}
          <Card className="p-5">
            <SectionHeader
              title="Your Recent Reports"
              description="Last 3 reports you filed"
              icon={<BookOpen className="h-4 w-4" />}
            />
            {myDay.recentReports.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="No reports filed yet"
                  hint="Your first report will appear here once you file it."
                />
              </div>
            ) : (
              <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
                {myDay.recentReports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-border bg-card/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatDate(r.reportDate)}
                      </p>
                      <span className="text-xs">{MOOD_EMOJI[r.mood ?? ""] ?? "·"}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
                      {r.tasksDone?.split("\n")[0] ?? "No tasks logged"}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {r.hoursWorked.toFixed(1)}h
                      </span>
                      {r.blockers && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> blocker
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Encouragement */}
          <Card className="border-primary/20 bg-primary/[0.04] p-5">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Daily rhythm</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show up, file your report, learn one new thing. Small consistent steps compound
                  into real expertise. Your team sees your effort.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}

/* ================================================================== */
/* STAFF DASHBOARD                                                     */
/* ================================================================== */
function StaffDashboard({
  data,
  user,
  handleToggleTask,
  togglingId,
  setShowQuickAdd,
  setShowMyDay,
  handleApproval,
}: RoleViewProps) {
  const setModule = useAppStore((s) => s.setModule);
  const { myDay } = data;
  const myTasks = myDay.tasks;
  const myProjects = myDay.myProjects;
  const approvals = myDay.pendingApprovalItems;
  const submitted = myDay.myPendingRequests;

  return (
    <>
      <RoleHeader
        userName={user.name}
        subtitle="Here's what needs your attention today."
        badges={
          <>
            <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {user.title ?? "Staff"}
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              {myProjects.length} projects
            </Badge>
          </>
        }
      />

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="My Open Tasks"
          value={myTasks.length}
          sub={myTasks.length === 0 ? "All clear" : `${myDay.overdueCount} overdue`}
          accent={myDay.overdueCount > 0 ? "danger" : "default"}
          icon={<ListTodo className="h-4 w-4" />}
        />
        <StatCard
          label="My Projects"
          value={myProjects.length}
          sub={myProjects.length === 0 ? "No active projects" : "Active assignments"}
          accent="primary"
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Approvals (I can action)"
          value={approvals.length}
          sub={
            approvals.length > 0
              ? `${formatNGN(approvals.reduce((s, a) => s + a.amount, 0), true)} queued`
              : "Nothing waiting"
          }
          accent={approvals.length > 0 ? "warning" : "default"}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatCard
          label="Team Reports Today"
          value={`${myDay.teamReportsToday}/${myDay.teamReportsTotal}`}
          sub={myDay.teamReportsToday < myDay.teamReportsTotal ? "Some pending" : "All in"}
          accent={myDay.teamReportsToday < myDay.teamReportsTotal ? "warning" : "primary"}
          icon={<Users className="h-4 w-4" />}
        />
      </section>

      {/* Main grid */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {/* My Tasks Today */}
          <Card className="p-5">
            <SectionHeader
              title="My Tasks Today"
              description="What's on your plate"
              icon={<ListTodo className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setShowMyDay(true)}
                >
                  All my tasks <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            <MyTasksList
              tasks={myTasks}
              handleToggleTask={handleToggleTask}
              togglingId={togglingId}
              onAdd={() => setShowQuickAdd(true)}
              emptyTitle="Nothing due today"
              emptyHint="You're all caught up — great headroom for deep work."
            />
          </Card>

          {/* Pending Approvals — I can action */}
          <Card className="p-5">
            <SectionHeader
              title="Pending Approvals"
              description="Requests waiting for your sign-off"
              icon={<ClipboardList className="h-4 w-4" />}
              action={
                approvals.length > 0 ? (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                    {approvals.length} pending
                  </Badge>
                ) : undefined
              }
            />
            <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
              {approvals.length === 0 && (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="Nothing waiting for your approval"
                  hint="Payment requests you can action will appear here."
                />
              )}
              {approvals.map((a) => (
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

          {/* My Projects */}
          <Card className="p-5">
            <SectionHeader
              title="My Projects"
              description="Projects you manage"
              icon={<Briefcase className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setModule("projects" as ModuleId)}
                >
                  All projects <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            {myProjects.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Briefcase className="h-6 w-6" />}
                  title="No active projects assigned to you"
                  hint="Projects you manage will show up here."
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {myProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setModule("projects" as ModuleId)}
                    className="rounded-md border border-border bg-card/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {p.code ?? "—"} · {p.serviceType.replace(/_/g, " ")}
                    </p>
                    {p.account && (
                      <p className="text-[11px] text-muted-foreground">{p.account.name}</p>
                    )}
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-semibold text-primary">{p.progress}%</span>
                      </div>
                      <MiniBar value={p.progress} max={100} color="bg-primary" />
                    </div>
                    {p.eventDate && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(p.eventDate)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* My submitted requests */}
          <Card className="p-5">
            <SectionHeader
              title="My Submitted Requests"
              description="Waiting for approval"
              icon={<Receipt className="h-4 w-4" />}
              action={
                submitted.length > 0 ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {submitted.length}
                  </Badge>
                ) : undefined
              }
            />
            {submitted.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Receipt className="h-6 w-6" />}
                  title="No requests waiting"
                  hint="Payment requests you submit will be tracked here."
                />
              </div>
            ) : (
              <div className="mt-3 max-h-64 overflow-y-auto scroll-thin space-y-2 pr-1">
                {submitted.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border border-border bg-card/40 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-primary">{p.code}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 truncate text-xs font-medium">
                      {p.description ?? "Payment request"}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{formatNGN(p.amount)}</span>
                      <span>
                        {p.status === "PENDING"
                          ? p.approver
                            ? `Awaiting ${p.approver.name}`
                            : "Awaiting approval"
                          : "Approved"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Weekly Objective */}
          <Card className="p-5">
            <SectionHeader
              title="Weekly Objective"
              icon={<Target className="h-4 w-4" />}
              action={
                myDay.weeklyObjective?.dueDate ? (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {relativeTime(myDay.weeklyObjective.dueDate)}
                  </Badge>
                ) : undefined
              }
            />
            {myDay.weeklyObjective ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">{myDay.weeklyObjective.title}</p>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-primary">
                      {myDay.weeklyObjective.progress.toFixed(0)}% complete
                    </span>
                  </div>
                  <MiniBar value={myDay.weeklyObjective.progress} max={100} color="bg-primary" />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  icon={<Target className="h-6 w-6" />}
                  title="No weekly goal linked"
                  hint="Set one with your manager to anchor your week."
                />
              </div>
            )}
          </Card>

          {/* Team Activity */}
          <Card className="p-5">
            <SectionHeader
              title="Team Activity"
              description="What your team is up to"
              icon={<Megaphone className="h-4 w-4" />}
            />
            {myDay.teamActivity.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Megaphone className="h-6 w-6" />}
                  title="No recent activity"
                  hint="Team actions will show up here."
                />
              </div>
            ) : (
              <div className="mt-3 max-h-72 overflow-y-auto scroll-thin space-y-2 pr-1">
                {myDay.teamActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-md px-1 py-1.5">
                    <Avatar className="h-7 w-7 border border-border">
                      <AvatarFallback
                        className={cn("text-[10px] font-semibold", avatarColor(a.user?.name ?? "??"))}
                      >
                        {initials(a.user?.name ?? "??")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
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
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}

/* ================================================================== */
/* FREELANCER DASHBOARD                                                */
/* ================================================================== */
function FreelancerDashboard({
  data,
  user,
  handleToggleTask,
  togglingId,
  setShowQuickAdd,
  setShowMyDay,
}: RoleViewProps) {
  const setModule = useAppStore((s) => s.setModule);
  const { myDay } = data;
  const myTasks = myDay.tasks;
  const crew = myDay.crewAssignments;
  const deliverables = myDay.deliverables;
  const totalDayRate = crew.reduce((s, c) => s + c.dayRate, 0);

  return (
    <>
      <RoleHeader
        userName={user.name}
        subtitle="Here's your work for today."
        badges={
          <>
            <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Freelancer
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <Clapperboard className="h-3 w-3" />
              {crew.length} assignments
            </Badge>
          </>
        }
      />

      {/* File daily report */}
      <DailyReportBanner
        filed={myDay.reportFiled}
        userName={user.name}
        onFile={() => setModule("field" as ModuleId)}
      />

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Crew Assignments"
          value={crew.length}
          sub={crew.length === 0 ? "No bookings" : `${crew.filter((c) => c.status === "CONFIRMED").length} confirmed`}
          accent="primary"
          icon={<Clapperboard className="h-4 w-4" />}
        />
        <StatCard
          label="My Tasks"
          value={myTasks.length}
          sub={myDay.overdueCount > 0 ? `${myDay.overdueCount} overdue` : "On track"}
          accent={myDay.overdueCount > 0 ? "danger" : "default"}
          icon={<ListTodo className="h-4 w-4" />}
        />
        <StatCard
          label="My Deliverables"
          value={deliverables.length}
          sub={deliverables.filter((d) => d.status !== "DELIVERED").length + " pending"}
          accent="default"
          icon={<Film className="h-4 w-4" />}
        />
        <StatCard
          label="Total Day Rate"
          value={formatNGN(totalDayRate, true)}
          sub={crew.length > 0 ? "Across assignments" : "No active bookings"}
          accent="primary"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
      </section>

      {/* Main grid */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {/* My Crew Assignments */}
          <Card className="p-5">
            <SectionHeader
              title="My Crew Assignments"
              description="Projects you're booked on"
              icon={<Clapperboard className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setModule("projects" as ModuleId)}
                >
                  All projects <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            {crew.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Clapperboard className="h-6 w-6" />}
                  title="No crew assignments yet"
                  hint="When you're booked on a project, it'll appear here with your role and day rate."
                />
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {crew.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-border bg-card/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{c.project.name}</p>
                          <StatusBadge status={c.status} />
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {c.project.code ?? "—"} · {c.project.serviceType.replace(/_/g, " ")}
                        </p>
                        {c.project.account && (
                          <p className="text-[11px] text-muted-foreground">{c.project.account.name}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">Your rate</p>
                        <p className="text-sm font-semibold text-primary">{formatNGN(c.dayRate)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        {c.role.replace(/_/g, " ")}
                      </Badge>
                      {c.project.eventDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(c.project.eventDate)}
                        </span>
                      )}
                      {c.project.venue && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {c.project.venue}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* My Tasks */}
          <Card className="p-5">
            <SectionHeader
              title="My Tasks"
              description="What you need to deliver"
              icon={<ListTodo className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setShowMyDay(true)}
                >
                  All my tasks <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            <MyTasksList
              tasks={myTasks}
              handleToggleTask={handleToggleTask}
              togglingId={togglingId}
              onAdd={() => setShowQuickAdd(true)}
              emptyTitle="No tasks assigned to you"
              emptyHint="Reach out to the production manager if you're expecting work."
            />
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* My Deliverables */}
          <Card className="p-5">
            <SectionHeader
              title="My Deliverables"
              description="What you're responsible for"
              icon={<Film className="h-4 w-4" />}
            />
            {deliverables.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Film className="h-6 w-6" />}
                  title="No deliverables assigned"
                  hint="Deliverables on your crew projects will appear here."
                />
              </div>
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto scroll-thin space-y-2 pr-1">
                {deliverables.map((d) => {
                  const overdue = d.dueDate ? isOverdue(d.dueDate) : false;
                  return (
                    <div
                      key={d.id}
                      className="rounded-md border border-border bg-card/40 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{d.title}</p>
                        <StatusBadge status={d.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.project.name}
                        {d.type && ` · ${d.type.replace(/_/g, " ")}`}
                      </p>
                      {d.dueDate && (
                        <p
                          className={cn(
                            "mt-1 inline-flex items-center gap-1 text-[11px]",
                            overdue && d.status !== "DELIVERED" ? "text-red-400" : "text-muted-foreground",
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {relativeTime(d.dueDate)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Weekly Objective */}
          <Card className="p-5">
            <SectionHeader
              title="Weekly Objective"
              icon={<Target className="h-4 w-4" />}
              action={
                myDay.weeklyObjective?.dueDate ? (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {relativeTime(myDay.weeklyObjective.dueDate)}
                  </Badge>
                ) : undefined
              }
            />
            {myDay.weeklyObjective ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">{myDay.weeklyObjective.title}</p>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-primary">
                      {myDay.weeklyObjective.progress.toFixed(0)}% complete
                    </span>
                  </div>
                  <MiniBar value={myDay.weeklyObjective.progress} max={100} color="bg-primary" />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  icon={<Target className="h-6 w-6" />}
                  title="No weekly goal linked"
                  hint="Your weekly objective will appear here once set."
                />
              </div>
            )}
          </Card>

          {/* Quick links */}
          <Card className="p-5">
            <SectionHeader title="Quick Links" icon={<Zap className="h-4 w-4" />} />
            <div className="mt-3 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => setModule("field" as ModuleId)}
              >
                <Send className="h-3.5 w-3.5" /> File daily report
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setModule("projects" as ModuleId)}
              >
                <Briefcase className="h-3.5 w-3.5" /> View all projects
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
