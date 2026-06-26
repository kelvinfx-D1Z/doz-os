"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Target,
  Flag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Calendar,
  ChevronRight,
  Circle,
  CircleDot,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
  PriorityDot,
} from "@/components/doz/ui-primitives";
import {
  formatDate,
  relativeTime,
  daysUntil,
  avatarColor,
  initials,
} from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================
interface Stats {
  activeGoals: number;
  achievedGoals: number;
  missedGoals: number;
  overdueTasks: number;
  dueToday: number;
  distractions: number;
  completedThisWeek: number;
  completionRate: number;
  avgGoalProgress: number;
}

interface GoalChild {
  id: string;
  title: string;
  type: string;
  progress: number;
  status: string;
  dueDate: string;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  progress: number;
  quarter: string | null;
  startDate: string;
  dueDate: string;
  ownerId: string;
  owner: { name: string };
  parentId: string | null;
  children: GoalChild[];
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  isDistraction: boolean;
  dueDate: string | null;
  estimatedHrs: number | null;
  actualHrs: number | null;
  completedAt: string | null;
  assignee: { name: string; role: string } | null;
  goal: { title: string; type: string } | null;
  project: { name: string } | null;
}

interface GoalLite {
  id: string;
  title: string;
  status: string;
  progress: number;
  dueDate: string;
  quarter?: string | null;
  owner: { name: string };
  parentId: string | null;
}

interface PlanningData {
  stats: Stats;
  goals: Goal[];
  tasks: Task[];
  goalsByType: {
    ANNUAL: GoalLite[];
    QUARTERLY: GoalLite[];
    MONTHLY: GoalLite[];
    WEEKLY: GoalLite[];
  };
}

// ============================================================
// Helpers
// ============================================================
const CATEGORY_STYLE: Record<string, string> = {
  STRATEGIC: "bg-emerald-500/15 text-emerald-400",
  OPERATIONAL: "bg-teal-500/15 text-teal-300",
  ADMIN: "bg-muted text-muted-foreground",
  DISTRACTION: "bg-amber-500/15 text-amber-400",
};

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Urgent",
  HIGH: "High Priority",
  MEDIUM: "Medium Priority",
  LOW: "Low Priority",
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isThisWeek(d: Date): boolean {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * 86400000);
  const t = d.getTime();
  return t >= start.getTime() && t < end.getTime();
}

// ============================================================
// Category badge
// ============================================================
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        CATEGORY_STYLE[category] ?? "bg-muted text-muted-foreground"
      )}
    >
      {category}
    </span>
  );
}

// ============================================================
// Cascade goal row
// ============================================================
const LEVEL_LABEL = ["Annual", "Quarterly", "Monthly", "Weekly"];

function CascadeRow({
  goal,
  level,
}: {
  goal: {
    id: string;
    title: string;
    status: string;
    progress: number;
    dueDate: string;
    owner: { name: string };
    quarter?: string | null;
  };
  level: number;
}) {
  const days = daysUntil(goal.dueDate);
  const isOverdue = days < 0 && goal.status !== "ACHIEVED";
  const isAchieved = goal.status === "ACHIEVED";
  const levelLabel = LEVEL_LABEL[level] ?? "Goal";

  return (
    <div
      className={cn(
        level > 0 && "border-l-2 border-primary/40 pl-4",
        level === 1 && "ml-0",
        level === 2 && "ml-4",
        level === 3 && "ml-8",
        level === 0 && "border-l-0 pl-0"
      )}
    >
      <Card
        className={cn(
          "p-4 transition-colors hover:bg-accent/30",
          level === 0 && "ring-1 ring-primary/30",
          isAchieved && "bg-primary/5",
          isOverdue && "border-red-500/40"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-primary">
                {level === 0 ? (
                  <Target className="h-3.5 w-3.5" />
                ) : level === 1 ? (
                  <Flag className="h-3.5 w-3.5" />
                ) : level === 2 ? (
                  <Calendar className="h-3.5 w-3.5" />
                ) : (
                  <CircleDot className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {levelLabel}
                {goal.quarter ? ` · ${goal.quarter}` : ""}
              </span>
              <StatusBadge status={goal.status} />
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">
              {goal.title}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-xs font-medium",
                isOverdue
                  ? "text-destructive"
                  : isAchieved
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {isOverdue
                ? `${Math.abs(days)}d overdue`
                : isAchieved
                ? "Achieved"
                : relativeTime(goal.dueDate)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {formatDate(goal.dueDate)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <MiniBar
              value={goal.progress}
              max={100}
              color={
                isAchieved
                  ? "bg-primary"
                  : isOverdue
                  ? "bg-red-500"
                  : "bg-primary"
              }
            />
          </div>
          <span className="w-10 text-right text-xs font-semibold">
            {goal.progress}%
          </span>
          <span className="text-[10px] text-muted-foreground">
            · {goal.owner.name.split(" ")[0]}
          </span>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Task row
// ============================================================
function TaskRow({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (id: string) => void;
}) {
  const isDone = task.status === "DONE";
  const isOverdue =
    !isDone &&
    task.dueDate &&
    new Date(task.dueDate).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const isDistraction = task.isDistraction && !isDone;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent/30",
        isDistraction
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card",
        isDone && "opacity-60"
      )}
    >
      {/* Toggle */}
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
        aria-label={isDone ? "Mark not done" : "Mark done"}
      >
        {isDone ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      {/* Priority dot */}
      <PriorityDot priority={task.priority} />

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              isDone && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </p>
          {isDistraction && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-[9px] font-bold uppercase tracking-wide text-amber-400"
            >
              Distraction
            </Badge>
          )}
          {isOverdue && (
            <Badge
              variant="outline"
              className="border-red-500/40 bg-red-500/10 text-[9px] font-bold uppercase tracking-wide text-destructive"
            >
              Overdue
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <CategoryBadge category={task.category} />
          {task.goal && (
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <span className="truncate">{task.goal.title}</span>
            </span>
          )}
          {task.project && (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/60">·</span>
              <span className="truncate">{task.project.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Assignee */}
      {task.assignee && (
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Avatar className="h-7 w-7">
            <AvatarFallback
              className={cn("text-[10px] font-semibold", avatarColor(task.assignee.name))}
            >
              {initials(task.assignee.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground">
            {task.assignee.name.split(" ")[0]}
          </span>
        </div>
      )}

      {/* Due date */}
      <div className="shrink-0 text-right">
        {task.dueDate ? (
          <>
            <p
              className={cn(
                "text-[11px] font-medium",
                isOverdue
                  ? "text-destructive"
                  : isDone
                  ? "text-muted-foreground"
                  : "text-foreground"
              )}
            >
              {relativeTime(task.dueDate)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {formatDate(task.dueDate)}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">—</p>
        )}
      </div>

      {/* Status */}
      <div className="hidden shrink-0 md:block">
        <StatusBadge status={task.status} />
      </div>
    </div>
  );
}

// ============================================================
// Goal Health donut (SVG)
// ============================================================
function HealthDonut({
  active,
  achieved,
  missed,
}: {
  active: number;
  achieved: number;
  missed: number;
}) {
  const total = active + achieved + missed;
  const r = 54;
  const c = 2 * Math.PI * r;
  const activePct = total > 0 ? active / total : 0;
  const achievedPct = total > 0 ? achieved / total : 0;
  const missedPct = total > 0 ? missed / total : 0;

  // arc helper
  const arc = (pct: number, offset: number) =>
    `${(pct * c).toFixed(2)} ${c.toFixed(2)}`;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="14" className="text-muted" />
          {achievedPct > 0 && (
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              className="text-primary"
              strokeDasharray={arc(achievedPct, 0)}
              strokeDashoffset={0}
            />
          )}
          {activePct > 0 && (
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              className="text-teal-400"
              strokeDasharray={arc(activePct, 0)}
              strokeDashoffset={`${(-achievedPct * c).toFixed(2)}`}
            />
          )}
          {missedPct > 0 && (
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              className="text-destructive"
              strokeDasharray={arc(missedPct, 0)}
              strokeDashoffset={`${(-((achievedPct + activePct) * c)).toFixed(2)}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold">{total}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Goals</p>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            Achieved
          </span>
          <span className="font-semibold">{achieved}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
            Active
          </span>
          <span className="font-semibold">{active}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            Missed
          </span>
          <span className="font-semibold">{missed}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Skeleton
// ============================================================
function SkeletonGrid() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================
export function StrategicPlanning() {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doneOverrides, setDoneOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doz/planning", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PlanningData;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load planning data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tasks with applied done overrides (visual toggle)
  const tasksView = useMemo<Task[]>(() => {
    if (!data) return [];
    return data.tasks.map((t) =>
      doneOverrides[t.id] !== undefined
        ? { ...t, status: doneOverrides[t.id] ? "DONE" : t.status }
        : t
    );
  }, [data, doneOverrides]);

  const handleToggle = (id: string) => {
    const t = tasksView.find((x) => x.id === id);
    if (!t) return;
    const newDone = t.status !== "DONE";
    setDoneOverrides((prev) => ({ ...prev, [id]: newDone }));
    if (newDone) {
      toast.success("Task marked done", { description: t.title });
    } else {
      toast.message("Task reopened", { description: t.title });
    }
  };

  // ============================================================
  // Task filters
  // ============================================================
  const todayTasks = useMemo(() => {
    return tasksView
      .filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), new Date()))
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
      );
  }, [tasksView]);

  const weekTasks = useMemo(() => {
    return tasksView
      .filter((t) => t.dueDate && isThisWeek(new Date(t.dueDate)))
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
      );
  }, [tasksView]);

  const allTasks = useMemo(() => {
    return [...tasksView].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9;
      const pb = PRIORITY_ORDER[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });
  }, [tasksView]);

  const distractionTasks = useMemo(() => {
    return tasksView.filter((t) => t.isDistraction && t.status !== "DONE");
  }, [tasksView]);

  // Today grouped by priority
  const todayGrouped = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of todayTasks) {
      const key = t.priority;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.keys(groups)
      .sort((a, b) => (PRIORITY_ORDER[a] ?? 9) - (PRIORITY_ORDER[b] ?? 9))
      .map((k) => ({ priority: k, tasks: groups[k] }));
  }, [todayTasks]);

  // ============================================================
  // Cascade goals — flatten from goalsByType in cascade order
  // ============================================================
  const cascade = useMemo(() => {
    if (!data) return [];
    const g = data.goalsByType;
    return [
      ...g.ANNUAL.map((x) => ({ ...x, type: "ANNUAL", level: 0 })),
      ...g.QUARTERLY.map((x) => ({ ...x, type: "QUARTERLY", level: 1 })),
      ...g.MONTHLY.map((x) => ({ ...x, type: "MONTHLY", level: 2 })),
      ...g.WEEKLY.map((x) => ({ ...x, type: "WEEKLY", level: 3 })),
    ];
  }, [data]);

  // ============================================================
  // Weekly focus
  // ============================================================
  const weeklyGoal = data?.goalsByType.WEEKLY[0] ?? null;
  const weeklyTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter(
      (t) => t.goal?.type === "WEEKLY" && t.status !== "DONE"
    );
  }, [data]);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonGrid />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Could not load planning data"
          hint={error ?? "Please try again later."}
        />
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* Header                                                       */}
      {/* ============================================================ */}
      <SectionHeader
        icon={<Target className="h-5 w-5" />}
        title="Strategic Planning"
        description="Connect daily execution to annual ambition. Cascade Annual → Quarterly → Monthly → Weekly."
      />

      {/* ============================================================ */}
      {/* KPI ROW                                                      */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Active Goals"
          value={s.activeGoals}
          sub={`${s.achievedGoals} achieved · ${s.missedGoals} missed`}
          icon={<Target className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Avg Goal Progress"
          value={`${s.avgGoalProgress}%`}
          sub="Across all goals"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Due Today"
          value={s.dueToday}
          sub="Tasks needing action"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Overdue Tasks"
          value={s.overdueTasks}
          sub="Past due date"
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="danger"
        />
        <StatCard
          label="Distractions"
          value={s.distractions}
          sub="Batch & defer"
          icon={<CircleDot className="h-4 w-4" />}
          accent="warning"
        />
        <StatCard
          label="Completion Rate"
          value={`${s.completionRate}%`}
          sub={`${s.completedThisWeek} done this week`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="primary"
        />
      </div>

      {/* ============================================================ */}
      {/* MAIN GRID                                                    */}
      {/* ============================================================ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* =============== LEFT COLUMN =============== */}
        <div className="space-y-6 lg:col-span-2">
          {/* ---------- GOAL CASCADE ---------- */}
          <Card className="p-5">
            <SectionHeader
              icon={<Target className="h-5 w-5" />}
              title="Goal Cascade"
              description="Every task must trace back to an annual goal."
            />
            <div className="mt-4 space-y-3">
              {cascade.length === 0 ? (
                <EmptyState
                  icon={<Target className="h-6 w-6" />}
                  title="No goals yet"
                  hint="Define an annual goal to start the cascade."
                />
              ) : (
                cascade.map((g) => (
                  <CascadeRow key={g.id} goal={g} level={g.level} />
                ))
              )}
            </div>
          </Card>

          {/* ---------- TASK LIST ---------- */}
          <Card className="p-5">
            <SectionHeader
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tasks"
              description="Connect every task to a goal. Triage distractions."
            />
            <Tabs defaultValue="today" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="today">
                  Today
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
                    {todayTasks.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="week">
                  This Week
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
                    {weekTasks.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="all">
                  All
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
                    {allTasks.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="distractions">
                  Distractions
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-1.5 h-4 px-1 text-[9px]",
                      distractionTasks.length > 0 && "bg-amber-500/20 text-amber-400"
                    )}
                  >
                    {distractionTasks.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* TODAY */}
              <TabsContent value="today" className="mt-4">
                {todayGrouped.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-6 w-6" />}
                    title="Nothing due today"
                    hint="Plan tomorrow's tasks before EOD."
                  />
                ) : (
                  <div className="max-h-96 space-y-4 overflow-y-auto pr-1 scroll-thin">
                    {todayGrouped.map((group) => (
                      <div key={group.priority} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <PriorityDot priority={group.priority} />
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {PRIORITY_LABEL[group.priority] ?? group.priority}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            ({group.tasks.length})
                          </span>
                        </div>
                        <div className="space-y-2">
                          {group.tasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              onToggle={handleToggle}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* THIS WEEK */}
              <TabsContent value="week" className="mt-4">
                {weekTasks.length === 0 ? (
                  <EmptyState
                    icon={<Calendar className="h-6 w-6" />}
                    title="No tasks scheduled this week"
                    hint="Plan your week to hit the weekly goal."
                  />
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1 scroll-thin">
                    {weekTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ALL */}
              <TabsContent value="all" className="mt-4">
                {allTasks.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-6 w-6" />}
                    title="No tasks"
                    hint="Tasks appear here once created."
                  />
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1 scroll-thin">
                    {allTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* DISTRACTIONS */}
              <TabsContent value="distractions" className="mt-4">
                {distractionTasks.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-6 w-6" />}
                    title="No distractions detected"
                    hint="Stay focused on the goal cascade."
                  />
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1 scroll-thin">
                    {distractionTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* =============== RIGHT COLUMN =============== */}
        <div className="space-y-6">
          {/* ---------- DISTRACTION DETECTOR ---------- */}
          <Card className="border-amber-500/40 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-500/15 p-2 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Distraction Detector</h3>
                <p className="text-xs text-muted-foreground">
                  {distractionTasks.length === 0
                    ? "All clear — you're focused."
                    : `${distractionTasks.length} ${distractionTasks.length === 1 ? "task" : "tasks"} flagged as distractions.`}
                </p>
              </div>
              {distractionTasks.length > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-400"
                >
                  {distractionTasks.length}
                </Badge>
              )}
            </div>

            {distractionTasks.length > 0 ? (
              <>
                <div className="mt-3 space-y-1.5">
                  {distractionTasks.slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <p className="truncate text-xs">{t.title}</p>
                    </div>
                  ))}
                  {distractionTasks.length > 4 && (
                    <p className="text-center text-[10px] text-muted-foreground">
                      +{distractionTasks.length - 4} more
                    </p>
                  )}
                </div>
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
                  <p className="text-[11px] font-medium text-amber-400">
                    Recommendation
                  </p>
                  <p className="mt-0.5 text-xs text-amber-300/90">
                    Batch these into a single 30-min block at 4 PM. Don&apos;t
                    let them fracture deep work.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5">
                <p className="text-xs text-primary">
                  Stay on the cascade. Today&apos;s work connects directly to
                  this week&apos;s goal.
                </p>
              </div>
            )}
          </Card>

          {/* ---------- WEEKLY FOCUS ---------- */}
          <Card className="p-5">
            <SectionHeader
              icon={<Calendar className="h-5 w-5" />}
              title="Weekly Focus"
              description={weeklyGoal ? undefined : "No weekly goal set"}
            />
            {weeklyGoal ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-medium leading-snug">
                    {weeklyGoal.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={weeklyGoal.progress} className="h-2 flex-1" />
                    <span className="text-xs font-semibold">
                      {weeklyGoal.progress}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Days remaining
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      daysUntil(weeklyGoal.dueDate) < 0
                        ? "text-destructive"
                        : daysUntil(weeklyGoal.dueDate) <= 1
                        ? "text-amber-400"
                        : "text-foreground"
                    )}
                  >
                    {(() => {
                      const d = daysUntil(weeklyGoal.dueDate);
                      if (d < 0) return `${Math.abs(d)}d overdue`;
                      if (d === 0) return "Due today";
                      return `${d} day${d === 1 ? "" : "s"}`;
                    })()}
                  </span>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    This week&apos;s key tasks
                  </p>
                  {weeklyTasks.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                      All weekly tasks complete
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {weeklyTasks.slice(0, 5).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleToggle(t.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/30"
                        >
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-xs">{t.title}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {t.dueDate ? relativeTime(t.dueDate) : ""}
                          </span>
                        </button>
                      ))}
                      {weeklyTasks.length > 5 && (
                        <p className="text-center text-[10px] text-muted-foreground">
                          +{weeklyTasks.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Calendar className="h-6 w-6" />}
                title="No weekly goal"
                hint="Define a weekly goal to focus this week's work."
              />
            )}
          </Card>

          {/* ---------- GOAL HEALTH ---------- */}
          <Card className="p-5">
            <SectionHeader
              icon={<TrendingUp className="h-5 w-5" />}
              title="Goal Health"
              description="Achievement vs. misses"
            />
            <div className="mt-4">
              <HealthDonut
                active={s.activeGoals}
                achieved={s.achievedGoals}
                missed={s.missedGoals}
              />
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-primary">
                    {s.achievedGoals}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Achieved
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-teal-400">
                    {s.activeGoals}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Active
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-destructive">
                    {s.missedGoals}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Missed
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
