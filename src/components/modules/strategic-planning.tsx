"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Target,
  Flag,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Calendar,
  ChevronRight,
  Circle,
  CircleDot,
  Pencil,
  Trash2,
  Sparkles,
  Plus,
  Bot,
  Loader2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FocusScoreCard } from "@/components/doz/focus-score-card";
import { useCurrentUser } from "@/hooks/use-current-user";

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
  assigneeId: string | null;
  goalId: string | null;
  projectId: string | null;
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

interface TeamUser {
  id: string;
  name: string;
  role: string;
  title: string | null;
}

interface ProjectLite {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

interface AllGoalLite {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  dueDate: string;
  quarter?: string | null;
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
  users?: TeamUser[];
  projects?: ProjectLite[];
  allGoals?: AllGoalLite[];
}

// ============================================================
// Form payload — used for both create and edit
// ============================================================
interface TaskFormPayload {
  title: string;
  description: string;
  priority: string;
  category: string; // "STRATEGIC" | "OPERATIONAL" | "ADMIN" | "DISTRACTION" | "__none__"
  assigneeId: string; // user id or "__none__"
  goalId: string; // goal id or "__none__"
  projectId: string; // project id or "__none__"
  dueDate: string; // YYYY-MM-DD or ""
  isDistraction: boolean;
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
  onEdit,
  onDelete,
  onToggleDistraction,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleDistraction: (task: Task) => void;
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
        "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors",
        isDistraction
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card",
        "hover:bg-accent/30"
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

      {/* Title + meta — clickable to edit */}
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit task ${task.title}`}
      >
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
          <span className="text-[10px] text-muted-foreground/70">
            · click to edit
          </span>
        </div>
      </button>

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

      {/* Distraction toggle */}
      <button
        type="button"
        onClick={() => onToggleDistraction(task)}
        title={isDistraction ? "Remove distraction flag" : "Flag as distraction"}
        className={cn(
          "shrink-0 rounded-md p-1.5 transition-colors",
          isDistraction
            ? "bg-amber-500/15 hover:bg-amber-500/25"
            : "text-muted-foreground/50 hover:bg-amber-500/10 hover:text-amber-400"
        )}
        aria-label={isDistraction ? "Remove distraction flag" : "Flag as distraction"}
        aria-pressed={isDistraction}
      >
        <AlertCircle
          className={cn(
            "h-3.5 w-3.5",
            isDistraction
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-current"
          )}
        />
      </button>

      {/* Edit */}
      <button
        type="button"
        onClick={() => onEdit(task)}
        title="Edit task"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-primary"
        aria-label="Edit task"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(task)}
        title="Delete task"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-destructive"
        aria-label="Delete task"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
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
// Empty form payload + helpers
// ============================================================
const NONE = "__none__";

function emptyForm(defaultAssigneeId?: string): TaskFormPayload {
  return {
    title: "",
    description: "",
    priority: "MEDIUM",
    category: NONE,
    assigneeId: defaultAssigneeId ?? NONE,
    goalId: NONE,
    projectId: NONE,
    dueDate: "",
    isDistraction: false,
  };
}

function taskToForm(task: Task): TaskFormPayload {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    category: task.category ?? NONE,
    assigneeId: task.assigneeId ?? NONE,
    goalId: task.goalId ?? NONE,
    projectId: task.projectId ?? NONE,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    isDistraction: task.isDistraction,
  };
}

// ============================================================
// Task form dialog (used for both create & edit)
// ============================================================
function TaskFormDialog({
  open,
  onOpenChange,
  mode, // "create" | "edit"
  initial,
  users,
  goals,
  projects,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial: TaskFormPayload | null;
  users: TeamUser[];
  goals: AllGoalLite[];
  projects: ProjectLite[];
  onSubmit: (payload: TaskFormPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<TaskFormPayload>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);

  // Reset form when the dialog opens / initial changes
  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyForm());
    }
  }, [open, initial]);

  const setField = <K extends keyof TaskFormPayload>(key: K, value: TaskFormPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? (
              <>
                <Plus className="h-5 w-5 text-primary" />
                New Task
              </>
            ) : (
              <>
                <Pencil className="h-5 w-5 text-primary" />
                Edit Task
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new task to the system. Connect it to a goal for focus."
              : "Update task fields. All changes save to the database."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Call GTBank treasury team to confirm invoice payment"
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Optional notes, context, or acceptance criteria"
              rows={3}
            />
          </div>

          {/* Priority + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setField("priority", v)}>
                <SelectTrigger className="w-full">
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
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— none —</SelectItem>
                  <SelectItem value="STRATEGIC">Strategic</SelectItem>
                  <SelectItem value="OPERATIONAL">Operational</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="DISTRACTION">Distraction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={form.assigneeId} onValueChange={(v) => setField("assigneeId", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— unassigned —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setField("dueDate", e.target.value)}
              />
            </div>
          </div>

          {/* Goal + Project */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Link to goal</Label>
              <Select value={form.goalId} onValueChange={(v) => setField("goalId", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>— none —</SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      [{g.type}] {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Link to project</Label>
              <Select value={form.projectId} onValueChange={(v) => setField("projectId", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>— none —</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Distraction toggle */}
          <div
            className={cn(
              "flex w-full items-center justify-between rounded-md border px-3 py-2 transition-colors",
              form.isDistraction
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border"
            )}
          >
            <div className="flex items-center gap-2">
              <AlertCircle
                className={cn(
                  "h-4 w-4",
                  form.isDistraction
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground"
                )}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    form.isDistraction ? "text-amber-400" : "text-foreground"
                  )}
                >
                  {form.isDistraction ? "Flagged as distraction" : "Flag as distraction"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {form.isDistraction
                    ? "Will be batched — toggle off to unflag"
                    : "Batch & defer non-strategic work"}
                </p>
              </div>
            </div>
            <Switch
              checked={form.isDistraction}
              onCheckedChange={(v) => setField("isDistraction", v)}
              aria-label="Toggle distraction flag"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : mode === "create" ? (
                <>
                  <Plus className="h-4 w-4" />
                  Create Task
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Plan Tasks with DIDI dialog
// ============================================================
interface PlanSuggestion {
  title: string;
  priority?: string;
  category?: string;
  assigneeSuggestion?: string;
  goalTitle?: string;
  rationale?: string;
}

function PlanTasksDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (s: PlanSuggestion) => Promise<boolean>;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlanSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedSet, setAddedSet] = useState<Set<number>>(new Set());
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyMsg(null);
    setRawText(null);
    setSuggestions([]);
    setAddedSet(new Set());
    try {
      const res = await fetch("/api/doz/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan_tasks" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.empty) {
        setEmptyMsg(json.message ?? "No active goals found.");
      } else if (json.offline) {
        setError(json.message ?? "AI service offline.");
      } else if (Array.isArray(json.suggestions) && json.suggestions.length > 0) {
        setSuggestions(json.suggestions);
        if (json.raw) setRawText(json.raw);
      } else {
        // Couldn't parse — show raw text if any
        if (json.raw) {
          setRawText(json.raw);
          setError("DIDI returned a response I couldn't parse — showing raw text below.");
        } else {
          setError("DIDI didn't return any suggestions. Try again.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when opened
  useEffect(() => {
    if (open) {
      void fetchSuggestions();
    }
  }, [open, fetchSuggestions]);

  const handleAdd = async (s: PlanSuggestion, idx: number) => {
    setAddingIdx(idx);
    try {
      const ok = await onAdd(s);
      if (ok) {
        setAddedSet((prev) => new Set(prev).add(idx));
      }
    } finally {
      setAddingIdx(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Plan Tasks with DIDI
          </DialogTitle>
          <DialogDescription>
            DIDI analyzes your active goals and current tasks, then suggests new tasks that move
            them forward. Click <span className="font-semibold">Add</span> on any suggestion to
            create it in the system.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1 scroll-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="relative">
                <Bot className="h-10 w-10 text-primary" />
                <Loader2 className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">DIDI is analyzing your goals…</p>
                <p className="text-xs text-muted-foreground">
                  Reading active goals, open tasks, and team members.
                </p>
              </div>
            </div>
          ) : emptyMsg ? (
            <EmptyState
              icon={<Target className="h-8 w-8" />}
              title="No active goals"
              hint={emptyMsg}
            />
          ) : error && suggestions.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8" />}
              title="Couldn't get suggestions"
              hint={error}
            />
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => {
                const isAdded = addedSet.has(i);
                const isAdding = addingIdx === i;
                return (
                  <div
                    key={`${s.title}-${i}`}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isAdded
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{s.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {s.priority && (
                            <Badge variant="outline" className="text-[9px] font-semibold uppercase">
                              <PriorityDot priority={s.priority} />
                              <span className="ml-1">{s.priority}</span>
                            </Badge>
                          )}
                          {s.category && (
                            <CategoryBadge category={s.category} />
                          )}
                          {s.assigneeSuggestion && (
                            <Badge
                              variant="outline"
                              className="text-[9px] font-semibold uppercase text-muted-foreground"
                            >
                              → {s.assigneeSuggestion}
                            </Badge>
                          )}
                          {s.goalTitle && (
                            <Badge
                              variant="outline"
                              className="border-primary/30 bg-primary/10 text-[9px] font-semibold uppercase text-primary"
                            >
                              <Target className="mr-1 h-2.5 w-2.5" />
                              {s.goalTitle}
                            </Badge>
                          )}
                        </div>
                        {s.rationale && (
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {s.rationale}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isAdded ? "outline" : "default"}
                        disabled={isAdded || isAdding}
                        onClick={() => handleAdd(s, i)}
                        className="shrink-0"
                      >
                        {isAdding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isAdded ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Added
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {rawText && (
                <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-muted-foreground">
                    Show raw AI response
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {rawText}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchSuggestions()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Regenerate
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main component
// ============================================================
export function StrategicPlanning() {
  const { user: currentUser } = useCurrentUser();
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doneOverrides, setDoneOverrides] = useState<Record<string, boolean>>({});

  // Task form / delete / plan-tasks dialog state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPlanTasks, setShowPlanTasks] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/doz/planning", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PlanningData;
      setData(json);
      setError(null);
    } catch (e) {
      // Don't overwrite data — just toast
      toast.error(e instanceof Error ? e.message : "Failed to refresh");
    }
  }, []);

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

  const handleToggle = async (id: string) => {
    const t = tasksView.find((x) => x.id === id);
    if (!t) return;
    const newDone = t.status !== "DONE";
    // Optimistic update
    setDoneOverrides((prev) => ({ ...prev, [id]: newDone }));
    if (newDone) {
      toast.success("Task marked done", { description: t.title });
    } else {
      toast.message("Task reopened", { description: t.title });
    }
    // Persist
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id, action: "toggle" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Revert on failure
      setDoneOverrides((prev) => ({ ...prev, [id]: !newDone }));
      toast.error(e instanceof Error ? e.message : "Failed to toggle task");
    }
  };

  const handleToggleDistraction = async (task: Task) => {
    const next = !task.isDistraction;
    // Optimistic
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === task.id ? { ...t, isDistraction: next } : t
        ),
      };
    });
    toast.success(
      next ? "Flagged as distraction" : "Removed distraction flag",
      { description: task.title }
    );
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          fields: { isDistraction: next },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Revert
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === task.id ? { ...t, isDistraction: task.isDistraction } : t
          ),
        };
      });
      toast.error(e instanceof Error ? e.message : "Failed to toggle distraction");
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEdit(true);
  };

  const handleEditSubmit = async (payload: TaskFormPayload) => {
    if (!editingTask) return;
    const fields: Record<string, unknown> = {
      title: payload.title.trim(),
      description: payload.description.trim(),
      priority: payload.priority,
      category: payload.category === NONE ? null : payload.category,
      assigneeId: payload.assigneeId === NONE ? null : payload.assigneeId,
      goalId: payload.goalId === NONE ? null : payload.goalId,
      projectId: payload.projectId === NONE ? null : payload.projectId,
      isDistraction: payload.isDistraction,
      dueDate: payload.dueDate || null,
    };
    const res = await fetch("/api/doz/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: editingTask.id, fields }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }
    toast.success("Task updated", { description: payload.title });
    await reload();
    setEditingTask(null);
  };

  const handleCreateSubmit = async (payload: TaskFormPayload) => {
    // POST /api/doz/tasks requires a non-empty assigneeId. If the user left
    // it unassigned, fall back to the current session user.
    let assigneeId = payload.assigneeId === NONE ? undefined : payload.assigneeId;
    if (!assigneeId) {
      if (currentUser?.id) {
        assigneeId = currentUser.id;
      } else {
        throw new Error("Please pick an assignee before creating the task.");
      }
    }
    const body: Record<string, unknown> = {
      title: payload.title.trim(),
      description: payload.description.trim() || undefined,
      priority: payload.priority,
      category: payload.category === NONE ? undefined : payload.category,
      assigneeId,
      goalId: payload.goalId === NONE ? undefined : payload.goalId,
      projectId: payload.projectId === NONE ? undefined : payload.projectId,
      dueDate: payload.dueDate || undefined,
      isDistraction: payload.isDistraction,
    };
    const res = await fetch("/api/doz/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }
    toast.success("Task created", { description: payload.title });
    await reload();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: deleteTarget.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      toast.success("Task deleted", { description: deleteTarget.title });
      setDeleteTarget(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSuggestion = async (s: PlanSuggestion): Promise<boolean> => {
    // Map a DIDI suggestion onto a create-task POST.
    // Try to resolve goalId by goalTitle fuzzy match against data.allGoals.
    let goalId: string | undefined;
    if (s.goalTitle && data?.allGoals) {
      const match = data.allGoals.find(
        (g) =>
          g.title.toLowerCase().includes(s.goalTitle!.toLowerCase()) ||
          s.goalTitle!.toLowerCase().includes(g.title.toLowerCase())
      );
      if (match) goalId = match.id;
    }

    // Try to resolve assigneeId by name match.
    let assigneeId: string | undefined;
    if (s.assigneeSuggestion && data?.users) {
      const suggestion = s.assigneeSuggestion.toLowerCase();
      const match = data.users.find(
        (u) =>
          u.name.toLowerCase().includes(suggestion) ||
          suggestion.includes(u.name.toLowerCase().split(" ")[0])
      );
      if (match) assigneeId = match.id;
      else if (suggestion.includes("founder") || suggestion.includes("kelvin") || suggestion.includes("adaeze")) {
        // Founder = first FOUNDER role user
        const founder = data.users.find((u) => u.role === "FOUNDER");
        if (founder) assigneeId = founder.id;
      }
    }

    const body: Record<string, unknown> = {
      title: s.title,
      priority: s.priority ?? "MEDIUM",
      category: s.category,
      goalId,
      assigneeId,
    };
    try {
      const res = await fetch("/api/doz/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      toast.success("Task added", { description: s.title });
      await reload();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add task");
      return false;
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
      {/* FOCUS & ALIGNMENT SCORE                                     */}
      {/* ============================================================ */}
      <FocusScoreCard />

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
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => setShowPlanTasks(true)}
                    className="bg-primary"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Plan Tasks with DIDI
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Task
                  </Button>
                </div>
              }
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
                              onEdit={handleEdit}
                              onDelete={(task) => setDeleteTarget(task)}
                              onToggleDistraction={handleToggleDistraction}
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
                        onEdit={handleEdit}
                        onDelete={(task) => setDeleteTarget(task)}
                        onToggleDistraction={handleToggleDistraction}
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
                        onEdit={handleEdit}
                        onDelete={(task) => setDeleteTarget(task)}
                        onToggleDistraction={handleToggleDistraction}
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
                        onEdit={handleEdit}
                        onDelete={(task) => setDeleteTarget(task)}
                        onToggleDistraction={handleToggleDistraction}
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

            {/* Always-on explanation */}
            <div className="mt-3 flex gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400/20 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                Tasks marked as distractions are low-priority items that
                interrupt strategic work. Batch them into a 30-min block. Click
                the{" "}
                <AlertCircle className="inline-block h-3 w-3 fill-amber-400 text-amber-400 align-text-bottom" />{" "}
                alert icon on any task to mark/unmark it as a distraction.
              </p>
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

      {/* ============================================================ */}
      {/* DIALOGS                                                      */}
      {/* ============================================================ */}

      {/* Create task dialog */}
      <TaskFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        mode="create"
        initial={emptyForm(currentUser?.id)}
        users={data?.users ?? []}
        goals={data?.allGoals ?? []}
        projects={data?.projects ?? []}
        onSubmit={handleCreateSubmit}
      />

      {/* Edit task dialog */}
      <TaskFormDialog
        open={showEdit}
        onOpenChange={(v) => {
          setShowEdit(v);
          if (!v) setEditingTask(null);
        }}
        mode="edit"
        initial={editingTask ? taskToForm(editingTask) : null}
        users={data?.users ?? []}
        goals={data?.allGoals ?? []}
        projects={data?.projects ?? []}
        onSubmit={handleEditSubmit}
      />

      {/* Plan tasks with DIDI dialog */}
      <PlanTasksDialog
        open={showPlanTasks}
        onOpenChange={setShowPlanTasks}
        onAdd={handleAddSuggestion}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete task?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete{" "}
                  <span className="font-semibold text-foreground">
                    &ldquo;{deleteTarget.title}&rdquo;
                  </span>
                  . This action cannot be undone.
                </>
              ) : (
                "This will permanently delete the task. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Task
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
