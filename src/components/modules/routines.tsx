"use client";

// ============================================================
// Routines Module (DOZ OS — Task C5)
// Business rhythm: daily / weekly / event-day / monthly
// routine templates that the founder can run through as
// interactive checklists.
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StatCard,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Repeat,
  Sunrise,
  Moon,
  CalendarDays,
  Clapperboard,
  Wallet,
  TrendingUp,
  Check,
  Circle,
  CheckCircle2,
  Play,
  X,
  Clock,
  Flame,
  Loader2,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Icon mapping                                                        */
/* ------------------------------------------------------------------ */
const ICON_MAP: Record<string, LucideIcon> = {
  Sunrise,
  Moon,
  CalendarDays,
  Clapperboard,
  Wallet,
  TrendingUp,
};

function RoutineIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && ICON_MAP[name]) || Repeat;
  return <Cmp className={className} />;
}

/* ------------------------------------------------------------------ */
/* Color mapping                                                       */
/* ------------------------------------------------------------------ */
const COLOR_MAP: Record<string, string> = {
  amber: "border-amber-500/30 bg-amber-500/5 text-amber-400",
  violet: "border-violet-500/30 bg-violet-500/5 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
  teal: "border-teal-500/30 bg-teal-500/5 text-teal-400",
  rose: "border-rose-500/30 bg-rose-500/5 text-rose-400",
};

const COLOR_BAR: Record<string, string> = {
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
};

const COLOR_TILE: Record<string, string> = {
  amber: "bg-amber-500/15 text-amber-400",
  violet: "bg-violet-500/15 text-violet-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  teal: "bg-teal-500/15 text-teal-400",
  rose: "bg-rose-500/15 text-rose-400",
};

function colorTokens(color?: string | null) {
  const c = color ?? "emerald";
  return {
    card: COLOR_MAP[c] ?? COLOR_MAP.emerald,
    bar: COLOR_BAR[c] ?? COLOR_BAR.emerald,
    tile: COLOR_TILE[c] ?? COLOR_TILE.emerald,
  };
}

/* ------------------------------------------------------------------ */
/* Frequency badge                                                     */
/* ------------------------------------------------------------------ */
const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  EVENT_DAY: "Event Day",
  MONTHLY: "Monthly",
};

const FREQUENCY_STYLE: Record<string, string> = {
  DAILY: "bg-amber-500/15 text-amber-300",
  WEEKLY: "bg-emerald-500/15 text-emerald-300",
  EVENT_DAY: "bg-teal-500/15 text-teal-300",
  MONTHLY: "bg-rose-500/15 text-rose-300",
};

function FrequencyBadge({ frequency }: { frequency: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        FREQUENCY_STYLE[frequency] ?? "bg-muted text-muted-foreground"
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {FREQUENCY_LABEL[frequency] ?? frequency}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Local time-ago helper (past tense)                                  */
/* ------------------------------------------------------------------ */
function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "1d ago";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return formatDate(date);
}

function minutesSince(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

/* ------------------------------------------------------------------ */
/* Types — mirror API                                                  */
/* ------------------------------------------------------------------ */
interface Routine {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  steps: string[];
  icon: string | null;
  color: string | null;
  isActive: boolean;
}

interface RecentLog {
  id: string;
  routineId: string;
  routineName: string;
  routineIcon: string | null;
  routineColor: string | null;
  status: string;
  stepsDoneCount: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string | null;
  userId: string | null;
  userName: string | null;
}

interface RoutineLog {
  id: string;
  routineId: string;
  status: string;
  stepsDone: number[];
  stepsDoneCount: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string | null;
  userId: string | null;
  routine: {
    id: string;
    name: string;
    description: string | null;
    frequency: string;
    steps: string[];
    icon: string | null;
    color: string | null;
  } | null;
}

interface RoutinesData {
  routines: Routine[];
  recentLogs: RecentLog[];
  stats: {
    totalRoutines: number;
    completedToday: number;
    completedThisWeek: number;
    streakDays: number;
  };
}

type FrequencyFilter = "ALL" | "DAILY" | "WEEKLY" | "EVENT_DAY" | "MONTHLY";

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export function Routines() {
  const [data, setData] = useState<RoutinesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FrequencyFilter>("ALL");

  // Runner state
  const [activeLog, setActiveLog] = useState<RoutineLog | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    let cancelled = false;
    setError(null);
    try {
      const res = await fetch("/api/doz/routines");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RoutinesData;
      if (!cancelled) setData(json);
    } catch (e) {
      if (!cancelled)
        setError(e instanceof Error ? e.message : "Failed to load routines");
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = load();
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [load]);

  // ----- derived: last run per routine (most recent log for that routine)
  const lastRunByRoutine = useMemo(() => {
    const map = new Map<string, RecentLog>();
    if (!data) return map;
    for (const l of data.recentLogs) {
      // recentLogs is sorted desc by startedAt — first occurrence is most recent
      if (!map.has(l.routineId)) map.set(l.routineId, l);
    }
    return map;
  }, [data]);

  // ----- filtered routines
  const filteredRoutines = useMemo(() => {
    if (!data) return [];
    if (filter === "ALL") return data.routines;
    return data.routines.filter((r) => r.frequency === filter);
  }, [data, filter]);

  const filterCounts = useMemo(() => {
    if (!data) return { ALL: 0, DAILY: 0, WEEKLY: 0, EVENT_DAY: 0, MONTHLY: 0 };
    const c = { ALL: data.routines.length, DAILY: 0, WEEKLY: 0, EVENT_DAY: 0, MONTHLY: 0 };
    for (const r of data.routines) {
      if (r.frequency in c) (c as any)[r.frequency]++;
    }
    return c;
  }, [data]);

  // ----- actions
  async function handleStart(routine: Routine) {
    try {
      const res = await fetch("/api/doz/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", routineId: routine.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { log: RoutineLog };
      setActiveLog(json.log);
      setRunnerOpen(true);
      toast.success(`${routine.name} started`, {
        description: "Work the steps in order. Stay focused.",
      });
    } catch (e: any) {
      toast.error("Couldn't start routine", { description: e?.message ?? "" });
    }
  }

  async function handleToggleStep(stepIndex: number) {
    if (!activeLog) return;
    setToggling(stepIndex);
    try {
      const res = await fetch("/api/doz/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_step",
          logId: activeLog.id,
          stepIndex,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { log: RoutineLog };
      setActiveLog(json.log);
      // If the toggle auto-completed the routine, surface that subtly
      if (json.log.status === "COMPLETED" && activeLog.status !== "COMPLETED") {
        toast.success("All steps complete 🎯", {
          description: "Hit “Complete” to log this run.",
        });
      }
    } catch (e: any) {
      toast.error("Couldn't update step", { description: e?.message ?? "" });
    } finally {
      setToggling(null);
    }
  }

  async function handleComplete() {
    if (!activeLog) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/doz/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", logId: activeLog.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      toast.success("Routine completed ✓", {
        description: activeLog.routine?.name,
      });
      setRunnerOpen(false);
      setActiveLog(null);
      await load();
    } catch (e: any) {
      toast.error("Couldn't complete routine", { description: e?.message ?? "" });
    } finally {
      setCompleting(false);
    }
  }

  function handleCancel() {
    setRunnerOpen(false);
    setActiveLog(null);
  }

  /* ----- Loading state ----- */
  if (!data && !error) {
    return (
      <div className="space-y-5">
        <RoutinesHeaderSkeleton />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  /* ----- Error state ----- */
  if (error && !data) {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Routines"
          description="Your business rhythm — run the same playbook every time"
          icon={<Repeat className="h-5 w-5" />}
        />
        <EmptyState
          icon={<Repeat className="h-8 w-8" />}
          title="Couldn't load routines"
          hint={error}
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => load()}>
            <Repeat className="mr-2 h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  const stats = data!.stats;

  return (
    <div className="space-y-5">
      {/* Header */}
      <SectionHeader
        title="Routines"
        description="Your business rhythm — run the same playbook every time"
        icon={<Repeat className="h-5 w-5" />}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Completed Today"
          value={stats.completedToday}
          sub={`${stats.totalRoutines} routines available`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="This Week"
          value={stats.completedThisWeek}
          sub="routines completed"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Streak"
          value={`${stats.streakDays}d`}
          sub={stats.streakDays > 0 ? "keep it alive 🔥" : "no streak yet"}
          icon={<Flame className="h-4 w-4" />}
          accent={stats.streakDays > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Templates"
          value={stats.totalRoutines}
          sub="active playbooks"
          icon={<Repeat className="h-4 w-4" />}
        />
      </div>

      {/* Frequency filter */}
      <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
        {(
          [
            "ALL",
            "DAILY",
            "WEEKLY",
            "EVENT_DAY",
            "MONTHLY",
          ] as FrequencyFilter[]
        ).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            )}
          >
            {FREQUENCY_LABEL[f] ?? "All"}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold",
                filter === f
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {filterCounts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Routine grid */}
      {filteredRoutines.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-8 w-8" />}
          title="No routines in this category"
          hint="Try another frequency filter."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRoutines.map((r) => {
            const colors = colorTokens(r.color);
            const lastRun = lastRunByRoutine.get(r.id);
            return (
              <Card
                key={r.id}
                className={cn(
                  "relative flex flex-col gap-3 overflow-hidden border-l-4 p-5 transition-all",
                  colors.card
                )}
              >
                {/* Top row: icon tile + frequency */}
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      colors.tile
                    )}
                  >
                    <RoutineIcon name={r.icon} className="h-5 w-5" />
                  </div>
                  <FrequencyBadge frequency={r.frequency} />
                </div>

                {/* Title + description */}
                <div className="space-y-1">
                  <h3 className="text-base font-semibold leading-tight">
                    {r.name}
                  </h3>
                  {r.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>

                {/* Step count + last run */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    {r.steps.length} step{r.steps.length === 1 ? "" : "s"}
                  </span>
                  {lastRun && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      last run {timeAgo(lastRun.completedAt ?? lastRun.startedAt)}
                    </span>
                  )}
                </div>

                {/* Start button */}
                <div className="mt-auto pt-1">
                  <Button
                    onClick={() => handleStart(r)}
                    size="sm"
                    className="w-full gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start routine
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent activity */}
      <div className="pt-2">
        <SectionHeader
          title="Recent Activity"
          description="The team's rhythm at a glance"
          icon={<Clock className="h-5 w-5" />}
        />
        {data!.recentLogs.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8" />}
            title="No routines run yet"
            hint="Start your first routine above — Morning Briefing is a great way to begin."
          />
        ) : (
          <Card className="scroll-thin max-h-96 divide-y divide-border overflow-y-auto p-0">
            {data!.recentLogs.map((log) => {
              const colors = colorTokens(log.routineColor);
              const isCompleted = log.status === "COMPLETED";
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/30"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      colors.tile
                    )}
                  >
                    <RoutineIcon
                      name={log.routineIcon}
                      className="h-4 w-4"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {log.routineName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isCompleted ? "completed" : "in progress"}{" "}
                      {timeAgo(log.completedAt ?? log.startedAt)}
                      {log.userName ? ` by ${log.userName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {log.stepsDoneCount}/{log.totalSteps}
                    </span>
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* Routine Runner Dialog */}
      <Dialog open={runnerOpen} onOpenChange={(o) => !o && handleCancel()}>
        <DialogContent className="max-w-2xl gap-0 p-0">
          {activeLog && activeLog.routine && (
            <RoutineRunner
              log={activeLog}
              onToggle={handleToggleStep}
              onComplete={handleComplete}
              onCancel={handleCancel}
              toggling={toggling}
              completing={completing}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Routine Runner (inside Dialog)                                      */
/* ------------------------------------------------------------------ */
function RoutineRunner({
  log,
  onToggle,
  onComplete,
  onCancel,
  toggling,
  completing,
}: {
  log: RoutineLog;
  onToggle: (stepIndex: number) => void;
  onComplete: () => void;
  onCancel: () => void;
  toggling: number | null;
  completing: boolean;
}) {
  const routine = log.routine!;
  const colors = colorTokens(routine.color);
  const steps = routine.steps;
  const doneSet = useMemo(() => new Set(log.stepsDone), [log.stepsDone]);
  const doneCount = log.stepsDone.length;
  const total = log.totalSteps || steps.length;
  const allDone = total > 0 && doneCount === total;
  const isCompleted = log.status === "COMPLETED";
  const elapsedMin = minutesSince(log.startedAt);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <DialogHeader className="border-b border-border p-5 pb-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
              colors.tile
            )}
          >
            <RoutineIcon name={routine.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base leading-tight">
              {routine.name}
            </DialogTitle>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Started {elapsedMin}m ago ·{" "}
              <FrequencyBadge frequency={routine.frequency} />
            </p>
          </div>
        </div>
        {routine.description && (
          <p className="mt-3 text-xs text-muted-foreground">
            {routine.description}
          </p>
        )}
      </DialogHeader>

      {/* Progress bar */}
      <div className="space-y-2 border-b border-border p-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {doneCount} of {total} steps complete
          </span>
          <span className="tabular-nums text-muted-foreground">
            {total > 0 ? Math.round((doneCount / total) * 100) : 0}%
          </span>
        </div>
        <MiniBar value={doneCount} max={total} color={colors.bar} />
      </div>

      {/* Steps */}
      <div className="scroll-thin max-h-[55vh] divide-y divide-border overflow-y-auto">
        {steps.map((step, idx) => {
          const isDone = doneSet.has(idx);
          const isToggling = toggling === idx;
          return (
            <button
              key={idx}
              onClick={() => onToggle(idx)}
              disabled={isToggling}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/30 disabled:opacity-60"
              )}
            >
              <span className="shrink-0">
                {isToggling ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/60" />
                )}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  isDone
                    ? "text-emerald-300 line-through"
                    : "text-foreground"
                )}
              >
                {step}
              </span>
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60">
                {String(idx + 1).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-card/50 p-4">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {isCompleted && (
            <Badge className="bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
            </Badge>
          )}
          <Button
            onClick={onComplete}
            disabled={completing || isCompleted}
            className={cn(
              "gap-1.5",
              allDone &&
                !isCompleted &&
                "animate-pulse bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            )}
          >
            {completing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Complete routine
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */
function RoutinesHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-8 w-full max-w-md" />
    </div>
  );
}
