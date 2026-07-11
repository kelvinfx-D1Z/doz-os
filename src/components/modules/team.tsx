"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
  PriorityDot,
} from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, avatarColor, initials } from "@/lib/format";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users,
  UserCog,
  GraduationCap,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  Smile,
  Phone,
  Mail,
  ListChecks,
  CalendarDays,
  Target,
  Sparkles,
  Lightbulb,
  Rocket,
  Inbox,
  Plus,
  Check,
  Circle,
  ListTodo,
  UserPlus,
  ChevronRight,
  Loader2,
  Pencil,
  UserX,
  UserCheck,
  Key,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
type Role = "FOUNDER" | "STAFF" | "INTERN" | "FREELANCER";
type Mood = "GREAT" | "OK" | "STRESSED" | null | undefined;

interface MemberCount {
  tasksAssigned: number;
  dailyReports: number;
  weeklyReports: number;
  crewAssignments: number;
}
interface Member {
  id: string;
  name: string;
  role: Role;
  title: string | null;
  email: string | null;
  phone: string | null;
  capacity: number;
  isActive: boolean;
  _count: MemberCount;
  openTasks: number;
  lastReport: { reportDate: string; mood: Mood; hoursWorked: number } | null;
}
interface ReportUser {
  name: string;
  role: Role;
  title: string | null;
}
interface DailyReport {
  id: string;
  user: ReportUser;
  reportDate: string;
  tasksDone: string;
  tasksPlanned: string | null;
  blockers: string | null;
  hoursWorked: number;
  mood: Mood;
  createdAt: string;
}
interface WeeklyReport {
  id: string;
  user: ReportUser;
  weekStart: string;
  weekEnd: string;
  achievements: string | null;
  challenges: string | null;
  learnings: string | null;
  nextWeekPlan: string | null;
  createdAt: string;
}
interface TodayTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: { name: string; role: string };
}
// Weekly task — shape returned by /api/doz/tasks?assigneeId=xxx&scope=week
interface WeeklyTask {
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
interface TeamData {
  stats: {
    totalMembers: number;
    interns: number;
    freelancers: number;
    staff: number;
    founder: number;
    reportingToday: number;
    reportingRate: number;
    openTasks: number;
    completedToday: number;
    avgHours: number;
  };
  members: Member[];
  dailyReports: DailyReport[];
  weeklyReports: WeeklyReport[];
  todayTasks: TodayTask[];
}

// ============================================================
// Helpers
// ============================================================
const ROLE_BADGE_CLASS: Record<Role, string> = {
  FOUNDER: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  STAFF: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
  INTERN: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  FREELANCER: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
};

const ROLE_ICON: Record<Role, React.ReactNode> = {
  FOUNDER: <UserCog className="h-3 w-3" />,
  STAFF: <Users className="h-3 w-3" />,
  INTERN: <GraduationCap className="h-3 w-3" />,
  FREELANCER: <Briefcase className="h-3 w-3" />,
};

function moodEmoji(mood: Mood): string {
  switch (mood) {
    case "GREAT":
      return "😄";
    case "OK":
      return "😐";
    case "STRESSED":
      return "😟";
    default:
      return "—";
  }
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function dateKey(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function splitLines(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Utilization: assume 40h week is "full"; cap display at 100%
function utilizationPct(openTasks: number): number {
  // Heuristic indicator: more open tasks => higher util bar
  return Math.min(100, openTasks * 12);
}

// Return ISO date (YYYY-MM-DD) for the Friday of the current week
function thisFridayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 Sun ... 6 Sat
  // Friday = 5. Shift forward (or back if Saturday)
  const diff = day <= 5 ? 5 - day : 5 - day + 7;
  const fri = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const y = fri.getFullYear();
  const m = (fri.getMonth() + 1).toString().padStart(2, "0");
  const d = fri.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Check if a date string falls within the current week (Mon-Sun)
function isThisWeek(d: string | null | undefined): boolean {
  if (!d) return false;
  const date = new Date(d);
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return date >= monday && date <= sunday;
}

// ============================================================
// Filter pill
// ============================================================
function FilterPill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-accent/30 hover:text-foreground"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4">
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================
// Member card
// ============================================================
function MemberCard({
  m,
  isFounder,
  isSelf,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  m: Member;
  isFounder: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const today = new Date();
  const reportedToday =
    m.lastReport && isSameDay(new Date(m.lastReport.reportDate), today);

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 transition-opacity",
        !m.isActive && "opacity-50"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className={avatarColor(m.name)}>
            {initials(m.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold leading-tight">{m.name}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_BADGE_CLASS[m.role]}`}
            >
              {ROLE_ICON[m.role]}
              {m.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs text-muted-foreground">
              {m.title ?? m.role.toLowerCase()}
            </p>
            {!m.isActive && (
              <Badge
                variant="outline"
                className="border-rose-500/40 bg-rose-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-rose-300"
              >
                Inactive
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
        {m.email && (
          <span className="flex items-center gap-1.5 truncate">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{m.email}</span>
          </span>
        )}
        {m.phone && (
          <span className="flex items-center gap-1.5 truncate">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{m.phone}</span>
          </span>
        )}
      </div>

      {/* Capacity + utilization */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Capacity</span>
          <span className="font-medium">
            {m.capacity} hrs/week
          </span>
        </div>
        <MiniBar
          value={utilizationPct(m.openTasks)}
          max={100}
          color={
            m.openTasks >= 6
              ? "bg-rose-500"
              : m.openTasks >= 3
                ? "bg-amber-500"
                : "bg-primary"
          }
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-md bg-muted/40 py-1.5">
          <p className="text-sm font-semibold">{m.openTasks}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Open
          </p>
        </div>
        <div className="rounded-md bg-muted/40 py-1.5">
          <p className="text-sm font-semibold">
            {m._count.dailyReports + m._count.weeklyReports}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reports
          </p>
        </div>
        <div className="rounded-md bg-muted/40 py-1.5">
          <p className="text-sm font-semibold">{m._count.crewAssignments}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Crew
          </p>
        </div>
      </div>

      {/* Last report indicator */}
      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              reportedToday ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className={reportedToday ? "text-emerald-400" : "text-amber-400"}>
            {reportedToday ? "Reported today" : "No report today"}
          </span>
        </span>
        {m.lastReport && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Smile className="h-3 w-3" />
            <span className="text-base leading-none">
              {moodEmoji(m.lastReport.mood)}
            </span>
            <span className="ml-1">{m.lastReport.hoursWorked}h</span>
          </span>
        )}
      </div>

      {/* Action buttons — only visible to FOUNDER */}
      {isFounder && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onEdit}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          {m.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onDeactivate}
              disabled={isSelf}
              title={isSelf ? "You cannot deactivate your own account" : undefined}
            >
              <UserX className="h-3 w-3" />
              Deactivate
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
              onClick={onReactivate}
            >
              <UserCheck className="h-3 w-3" />
              Reactivate
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Daily report card
// ============================================================
function DailyReportCard({ r }: { r: DailyReport }) {
  const doneLines = splitLines(r.tasksDone);
  const plannedLines = splitLines(r.tasksPlanned);
  const blockerLines = splitLines(r.blockers);
  const hasBlockers =
    blockerLines.length > 0 &&
    !blockerLines.every((l) => l.toLowerCase() === "none");

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className={avatarColor(r.user.name)}>
              {initials(r.user.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold leading-tight">{r.user.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.user.title ?? r.user.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{moodEmoji(r.mood)}</span>
          <Badge
            variant="outline"
            className="border-border bg-muted/40 text-[11px] font-medium"
          >
            <Clock className="mr-1 h-3 w-3" />
            {r.hoursWorked}h
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {formatDate(r.reportDate)}
          </span>
        </div>
      </div>

      {/* Done */}
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </p>
        {doneLines.length > 0 ? (
          <ul className="space-y-1">
            {doneLines.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[12px] leading-snug"
              >
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] italic text-muted-foreground">—</p>
        )}
      </div>

      {/* Planned */}
      {plannedLines.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3 w-3" />
            Planned
          </p>
          <ul className="space-y-1">
            {plannedLines.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[12px] leading-snug"
              >
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Blockers */}
      {hasBlockers && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Blockers
          </p>
          <ul className="space-y-1">
            {blockerLines.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[12px] leading-snug text-amber-200/90"
              >
                <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Missing report card (flag for interns who haven't reported)
// ============================================================
function MissingReportCard({ name, title }: { name: string; title?: string | null }) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-200">
            {name} — No daily report submitted
          </p>
          <p className="text-[11px] text-amber-300/70">
            {title ?? "Intern"} · Please follow up by 6:00 PM
          </p>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Weekly report card
// ============================================================
function WeeklyReportCard({ r }: { r: WeeklyReport }) {
  const sections: Array<{
    label: string;
    icon: React.ReactNode;
    color: string;
    text: string | null;
  }> = [
    {
      label: "Achievements",
      icon: <Sparkles className="h-3 w-3" />,
      color: "text-emerald-400",
      text: r.achievements,
    },
    {
      label: "Challenges",
      icon: <AlertTriangle className="h-3 w-3" />,
      color: "text-amber-400",
      text: r.challenges,
    },
    {
      label: "Learnings",
      icon: <Lightbulb className="h-3 w-3" />,
      color: "text-teal-400",
      text: r.learnings,
    },
    {
      label: "Next Week Plan",
      icon: <Rocket className="h-3 w-3" />,
      color: "text-primary",
      text: r.nextWeekPlan,
    },
  ];

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarFallback className={avatarColor(r.user.name)}>
              {initials(r.user.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold leading-tight">{r.user.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.user.title ?? r.user.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-[11px] font-medium">
          <CalendarDays className="h-3 w-3 text-muted-foreground" />
          <span>
            {formatDate(r.weekStart)} → {formatDate(r.weekEnd)}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => {
          const lines = splitLines(s.text);
          return (
            <div key={s.label}>
              <p
                className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${s.color}`}
              >
                {s.icon}
                {s.label}
              </p>
              {lines.length > 0 ? (
                <ul className="space-y-1">
                  {lines.map((line, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-1.5 text-[12px] leading-snug"
                    >
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] italic text-muted-foreground">—</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// Today's tasks table — grouped by priority
// ============================================================
const PRIORITY_GROUPS = [
  { key: "URGENT", label: "Urgent", color: "text-rose-400" },
  { key: "HIGH", label: "High", color: "text-amber-400" },
  { key: "MEDIUM", label: "Medium", color: "text-teal-400" },
  { key: "LOW", label: "Low", color: "text-zinc-400" },
];

function TodayTasksTable({ tasks }: { tasks: TodayTask[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-8 w-8" />}
        title="No open tasks"
        hint="All tasks assigned to the team are completed."
      />
    );
  }

  return (
    <div className="space-y-5">
      {PRIORITY_GROUPS.map((grp) => {
        const groupTasks = tasks.filter((t) => t.priority === grp.key);
        if (groupTasks.length === 0) return null;
        return (
          <div key={grp.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  grp.key === "URGENT"
                    ? "bg-rose-500"
                    : grp.key === "HIGH"
                      ? "bg-amber-500"
                      : grp.key === "MEDIUM"
                        ? "bg-teal-500"
                        : "bg-zinc-500"
                }`}
              />
              <h3 className={`text-sm font-semibold ${grp.color}`}>
                {grp.label}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {groupTasks.length} task{groupTasks.length === 1 ? "" : "s"}
              </span>
            </div>
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">
                      Task
                    </TableHead>
                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">
                      Assignee
                    </TableHead>
                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">
                      Status
                    </TableHead>
                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">
                      Due
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupTasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="py-2.5 text-[13px] font-medium">
                        {t.title}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback
                              className={`text-[10px] ${avatarColor(t.assignee.name)}`}
                            >
                              {initials(t.assignee.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="leading-tight">
                            <p className="text-[12px] font-medium">
                              {t.assignee.name}
                            </p>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t.assignee.role}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="py-2.5 text-[12px] text-muted-foreground">
                        {t.dueDate ? relativeTime(t.dueDate) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Weekly Tasks Tab — intern task assignment
// ============================================================
function WeeklyTasksTab({ interns }: { interns: Member[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    interns[0]?.id ?? null,
  );
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Assign-form state
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState(thisFridayISO());
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!selectedId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/doz/tasks?assigneeId=${encodeURIComponent(selectedId)}&scope=week`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { tasks: WeeklyTask[] };
      setTasks(json.tasks ?? []);
    } catch {
      setTasks([]);
      toast.error("Couldn't load weekly tasks");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ---- handlers
  const handleToggle = useCallback(
    async (taskId: string, currentlyDone: boolean) => {
      if (togglingId) return;
      setTogglingId(taskId);
      // optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: currentlyDone ? "TODO" : "DONE",
                completedAt: currentlyDone
                  ? null
                  : new Date().toISOString(),
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
        toast.success(currentlyDone ? "Task reopened" : "Task completed", {
          description: currentlyDone
            ? "Marked as TODO."
            : "Nicely done — keep the momentum.",
        });
      } catch (e) {
        // revert
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: currentlyDone ? "DONE" : "TODO",
                  completedAt: currentlyDone
                    ? new Date().toISOString()
                    : null,
                }
              : t,
          ),
        );
        toast.error("Couldn't update task", {
          description: e instanceof Error ? e.message : "Try again.",
        });
      } finally {
        setTogglingId(null);
      }
    },
    [togglingId],
  );

  const handleAssign = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) {
        toast.error("Title is required");
        return;
      }
      if (!selectedId) {
        toast.error("Select an intern first");
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
            assigneeId: selectedId,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const intern = interns.find((i) => i.id === selectedId);
        toast.success("Task assigned", {
          description: intern
            ? `"${title.trim()}" → ${intern.name}.`
            : `"${title.trim()}" assigned.`,
        });
        setTitle("");
        setDescription("");
        setPriority("MEDIUM");
        setDueDate(thisFridayISO());
        loadTasks();
      } catch (e) {
        toast.error("Couldn't assign task", {
          description: e instanceof Error ? e.message : "Try again.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [title, description, priority, dueDate, selectedId, interns, loadTasks],
  );

  // ---- derived
  const selectedIntern = interns.find((i) => i.id === selectedId) ?? null;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const pendingCount = tasks.length - doneCount;
  const completionPct =
    tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);

  // No interns at all
  if (interns.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-8 w-8" />}
        title="No interns on the team"
        hint="Add interns via the Team tab to assign weekly tasks."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <ListTodo className="h-3.5 w-3.5" />
        <span>
          Assign weekly tasks to interns. Due dates filter to{" "}
          <strong className="text-foreground">this week (Mon–Sun)</strong>.
        </span>
      </div>

      {/* Intern selector */}
      <div className="flex flex-wrap gap-2">
        {interns.map((i) => {
          const isSelected = i.id === selectedId;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => setSelectedId(i.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 pr-3 transition-all hover:bg-accent/30",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                  : "border-border",
              )}
              aria-pressed={isSelected}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback
                  className={cn("text-[11px] font-semibold", avatarColor(i.name))}
                >
                  {initials(i.name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-left leading-tight">
                <p className="text-xs font-semibold">{i.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {i.title?.replace(/^Intern\s*—?\s*/, "") ?? "Intern"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* LEFT: Selected intern's weekly tasks (3/5) */}
        <div className="space-y-4 lg:col-span-3">
          {selectedIntern && (
            <Card className="p-5">
              <SectionHeader
                title={`${selectedIntern.name.split(" ")[0]}'s Week`}
                description={`Tasks due this week · ${selectedIntern.title ?? "Intern"}`}
                icon={<CalendarDays className="h-4 w-4" />}
                action={
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {tasks.length} task{tasks.length === 1 ? "" : "s"}
                  </Badge>
                }
              />

              {/* Summary row */}
              {!loading && tasks.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
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

              {/* Completion MiniBar */}
              {!loading && tasks.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Week completion</span>
                    <span className="font-semibold text-primary">{completionPct}%</span>
                  </div>
                  <MiniBar value={doneCount} max={Math.max(1, tasks.length)} color="bg-primary" />
                </div>
              )}

              {/* Task list */}
              <div className="mt-4 max-h-[460px] overflow-y-auto scroll-thin space-y-2 pr-1">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading weekly tasks…
                  </div>
                ) : tasks.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-6 w-6" />}
                    title="No tasks assigned this week"
                    hint="Use the form on the right to assign a task to this intern."
                  />
                ) : (
                  tasks.map((t) => {
                    const done = t.status === "DONE";
                    const overdue = t.dueDate
                      ? new Date(t.dueDate).getTime() < Date.now()
                      : false;
                    const isToggling = togglingId === t.id;
                    return (
                      <div
                        key={t.id}
                        className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3 transition-colors hover:bg-accent/40"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggle(t.id, done)}
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
                                "text-sm font-medium",
                                done && "text-muted-foreground line-through",
                                overdue && !done && "text-red-400",
                              )}
                            >
                              {t.title}
                            </p>
                            <StatusBadge status={t.status} />
                            {t.priority === "URGENT" && (
                              <Badge
                                variant="outline"
                                className="border-red-500/40 bg-red-500/10 text-[9px] font-bold uppercase tracking-wide text-red-400"
                              >
                                Urgent
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
                          {t.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {t.project && <span>{t.project.name}</span>}
                            {t.dueDate && (
                              <>
                                {t.project && (
                                  <span className="text-muted-foreground/40">·</span>
                                )}
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1",
                                    overdue && !done && "text-red-400",
                                  )}
                                >
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(t.dueDate)}
                                </span>
                              </>
                            )}
                            {t.creator && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span>by {t.creator.name.split(" ")[0]}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: Assign new task form (2/5) */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <SectionHeader
              title="Assign New Task"
              description={
                selectedIntern
                  ? `To ${selectedIntern.name}`
                  : "Select an intern first"
              }
              icon={<UserPlus className="h-4 w-4" />}
            />
            <form onSubmit={handleAssign} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wt-title">Title</Label>
                <Input
                  id="wt-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Edit MTN brand film v2 cut"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wt-priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="wt-priority">
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
                  <Label htmlFor="wt-due">Due date</Label>
                  <Input
                    id="wt-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wt-desc">Description (optional)</Label>
                <Textarea
                  id="wt-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Any context, links, or sub-steps…"
                  rows={3}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !title.trim() || !selectedId}
                className="w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Assign Task
              </Button>
            </form>
          </Card>

          {/* All interns quick summary */}
          <Card className="mt-4 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />
              Team weekly snapshot
            </div>
            <p className="text-[11px] text-muted-foreground">
              This is the current load across all interns this week.
            </p>
            <div className="mt-3 space-y-2">
              {interns.map((i) => (
                <InternWeekSummary
                  key={i.id}
                  intern={i}
                  isSelected={i.id === selectedId}
                  onSelect={() => setSelectedId(i.id)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Lazy-load per-intern weekly task summary (count + MiniBar)
function InternWeekSummary({
  intern,
  isSelected,
  onSelect,
}: {
  intern: Member;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [summary, setSummary] = useState<{
    total: number;
    done: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/doz/tasks?assigneeId=${encodeURIComponent(intern.id)}&scope=week`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { tasks: WeeklyTask[] };
        const tasks = json.tasks ?? [];
        if (alive) {
          setSummary({
            total: tasks.length,
            done: tasks.filter((t) => t.status === "DONE").length,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [intern.id]);

  const total = summary?.total ?? 0;
  const done = summary?.done ?? 0;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border p-2 text-left transition-colors hover:bg-accent/30",
        isSelected ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback
          className={cn("text-[10px] font-semibold", avatarColor(intern.name))}
        >
          {initials(intern.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-xs font-semibold">{intern.name}</p>
          <span className="ml-2 shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {done}/{total}
          </span>
        </div>
        <div className="mt-1">
          <MiniBar
            value={done}
            max={Math.max(1, total)}
            color={pct >= 80 ? "bg-primary" : pct >= 40 ? "bg-amber-500" : "bg-zinc-500"}
          />
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

// ============================================================
// Loading skeleton
// ============================================================
function TeamSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Role options (shared by Add + Edit dialogs)
// ============================================================
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "FOUNDER", label: "Founder" },
  { value: "STAFF", label: "Staff" },
  { value: "INTERN", label: "Intern" },
  { value: "FREELANCER", label: "Freelancer / Production Manager" },
];

// ============================================================
// Add Member Dialog
// ============================================================
function AddMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [capacity, setCapacity] = useState("40");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog is opened.
  // Canonical "store info from previous renders" pattern — see:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName("");
      setEmail("");
      setRole("STAFF");
      setTitle("");
      setPhone("");
      setCapacity("40");
      setPassword("");
      setSubmitting(false);
    }
  }

  const valid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/team/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          title: title.trim() || undefined,
          phone: phone.trim() || undefined,
          capacity: Number(capacity) || 40,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          json?.error === "email_taken"
            ? "A user with this email already exists."
            : json?.error === "weak_password"
              ? "Password must be at least 6 characters."
              : json?.message || `Failed (HTTP ${res.status})`;
        toast.error(msg);
        setSubmitting(false);
        return;
      }
      toast.success(`${name.trim()} added to the team as ${role}.`);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Create a new account. The member can sign in immediately with the
            password you set.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="add-name">Name *</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Adaeze Okonkwo"
                required
                autoFocus
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="add-email">Email *</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@digitonezero.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-capacity">Capacity (hrs/week)</Label>
              <Input
                id="add-capacity"
                type="number"
                min={0}
                max={168}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-title">Title</Label>
              <Input
                id="add-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Operations Lead"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone</Label>
              <Input
                id="add-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 ..."
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="add-password">Password *</Label>
              <Input
                id="add-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                You can change this later via the member&apos;s Edit menu.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create Member
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
// Edit Member Dialog
// ============================================================
function EditMemberDialog({
  member,
  onOpenChange,
  onSaved,
  onChangePassword,
}: {
  member: Member | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onChangePassword: (m: Member) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [capacity, setCapacity] = useState("40");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Sync form state whenever a different member opens.
  // Canonical "store info from previous renders" pattern — see:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevMember, setPrevMember] = useState<Member | null>(member);
  if (member !== prevMember) {
    setPrevMember(member);
    if (member) {
      setName(member.name);
      setTitle(member.title ?? "");
      setPhone(member.phone ?? "");
      setRole(member.role);
      setCapacity(String(member.capacity ?? 40));
      setIsActive(member.isActive);
      setSubmitting(false);
    }
  }

  const open = member !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member || submitting) return;
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/team/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          userId: member.id,
          name: name.trim(),
          title: title.trim() || null,
          phone: phone.trim() || null,
          role,
          capacity: Number(capacity) || 40,
          isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.message || `Failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      toast.success(`${name.trim()}'s details updated.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            {member
              ? `Update ${member.name}'s profile, role, and status.`
              : "Update member details."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-capacity">Capacity (hrs/week)</Label>
              <Input
                id="edit-capacity"
                type="number"
                min={0}
                max={168}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Operations Lead"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 ..."
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-[11px] text-muted-foreground">
                  Inactive members cannot sign in but their data is preserved.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => member && onChangePassword(member)}
              disabled={submitting}
            >
              <Key className="h-3.5 w-3.5" />
              Change Password
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Change Password Dialog
// ============================================================
function ChangePasswordDialog({
  member,
  onOpenChange,
  onSaved,
}: {
  member: Member | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever a different member opens.
  // Canonical "store info from previous renders" pattern — see:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevMember, setPrevMember] = useState<Member | null>(member);
  if (member !== prevMember) {
    setPrevMember(member);
    if (member) {
      setNewPassword("");
      setConfirmPassword("");
      setSubmitting(false);
    }
  }

  const open = member !== null;
  const passwordsMatch = newPassword === confirmPassword;
  const valid = newPassword.length >= 6 && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/team/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          userId: member.id,
          newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.message || `Failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      toast.success(`Password updated for ${member.name}.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            {member
              ? `Set a new password for ${member.name}. They'll need to use it on next sign-in.`
              : "Set a new password."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New Password *</Label>
            <Input
              id="cp-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm Password *</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter the new password"
              required
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-[11px] text-rose-400">
                Passwords do not match.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Key className="mr-1.5 h-3.5 w-3.5" />
                  Reset Password
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
// Deactivate Confirm Dialog
// ============================================================
function DeactivateConfirmDialog({
  member,
  onOpenChange,
  onConfirmed,
}: {
  member: Member | null;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const open = member !== null;

  // Reset submitting flag whenever a different member opens.
  // Canonical "store info from previous renders" pattern — see:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevMember, setPrevMember] = useState<Member | null>(member);
  if (member !== prevMember) {
    setPrevMember(member);
    setSubmitting(false);
  }

  async function handleConfirm() {
    if (!member || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/team/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.message || `Failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      toast.success(`${member.name} deactivated. Their data is preserved.`);
      onOpenChange(false);
      onConfirmed();
    } catch (err) {
      toast.error("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-4 w-4 text-rose-400" />
            Deactivate Member
          </DialogTitle>
          <DialogDescription>
            {member ? (
              <>
                Are you sure you want to deactivate{" "}
                <span className="font-semibold text-foreground">
                  {member.name}
                </span>
                ? They will no longer be able to sign in, but their reports,
                tasks, and history will be preserved. You can reactivate them
                at any time.
              </>
            ) : (
              "Are you sure you want to deactivate this member?"
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Deactivating...
              </>
            ) : (
              <>
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                Deactivate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main component
// ============================================================
export function Team() {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  const { user: currentUser } = useCurrentUser();
  const isFounder = currentUser?.role === "FOUNDER";

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [passwordMember, setPasswordMember] = useState<Member | null>(null);
  const [deactivateMember, setDeactivateMember] = useState<Member | null>(null);
  const [reactivatingMember, setReactivatingMember] = useState<Member | null>(null);

  // ---- Load team data (with refresh support)
  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/doz/team");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TeamData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  // ---- Reactivate handler (PATCH isActive: true)
  async function handleReactivate(m: Member) {
    setReactivatingMember(m);
    try {
      const res = await fetch("/api/doz/team/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          userId: m.id,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.message || `Failed (HTTP ${res.status})`);
        return;
      }
      toast.success(`${m.name} reactivated. They can now sign in.`);
      await loadTeam();
    } catch (err) {
      toast.error("Network error — please try again.");
    } finally {
      setReactivatingMember(null);
    }
  }

  // ---- Filtered members
  const filteredMembers = useMemo(() => {
    if (!data) return [];
    if (filter === "ALL") return data.members;
    return data.members.filter((m) => m.role === filter);
  }, [data, filter]);

  // ---- Filter counts
  const filterCounts = useMemo(() => {
    if (!data) return { ALL: 0, FOUNDER: 0, STAFF: 0, INTERN: 0, FREELANCER: 0 };
    const c = { ALL: data.members.length, FOUNDER: 0, STAFF: 0, INTERN: 0, FREELANCER: 0 };
    for (const m of data.members) c[m.role]++;
    return c;
  }, [data]);

  // ---- Daily reports grouped by date (desc)
  const dailyByDate = useMemo(() => {
    if (!data) return [] as Array<{ date: string; reports: DailyReport[] }>;
    const map = new Map<string, DailyReport[]>();
    for (const r of data.dailyReports) {
      const k = dateKey(r.reportDate);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries())
      .map(([date, reports]) => ({ date, reports }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data]);

  // ---- Interns who have NOT reported today
  const internsMissingToday = useMemo(() => {
    if (!data) return [] as Array<{ name: string; title: string | null }>;
    const today = new Date();
    return data.members
      .filter((m) => m.role === "INTERN")
      .filter(
        (m) => !m.lastReport || !isSameDay(new Date(m.lastReport.reportDate), today)
      )
      .map((m) => ({ name: m.name, title: m.title }));
  }, [data]);

  // ---- Loading state
  if (!data && !error) {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Team Management"
          description="Interns, freelancers, daily reports & accountability"
          icon={<Users className="h-5 w-5" />}
        />
        <TeamSkeleton />
      </div>
    );
  }

  // ---- Error state
  if (error) {
    return (
      <div className="space-y-5">
        <SectionHeader
          title="Team Management"
          description="Interns, freelancers, daily reports & accountability"
          icon={<Users className="h-5 w-5" />}
        />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Failed to load team data"
          hint={error}
        />
      </div>
    );
  }

  const s = data!.stats;
  const reportingRateLow = s.reportingRate < 80;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Team Management"
        description="Interns, freelancers, daily reports & accountability"
        icon={<Users className="h-5 w-5" />}
      />

      {/* KPI ROW */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Team Members"
          value={s.totalMembers}
          sub={`${s.founder + s.staff} core`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Interns"
          value={s.interns}
          sub={`${s.reportingToday} reporting today`}
          icon={<GraduationCap className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Freelancers"
          value={s.freelancers}
          sub="On-call crew"
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Reporting Rate"
          value={`${s.reportingRate}%`}
          sub={`${s.reportingToday}/${s.interns} interns today`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent={reportingRateLow ? "danger" : "primary"}
        />
        <StatCard
          label="Open Tasks"
          value={s.openTasks}
          sub={`${s.completedToday} done today`}
          icon={<FileText className="h-4 w-4" />}
          accent={s.openTasks >= 10 ? "warning" : "default"}
        />
        <StatCard
          label="Avg Hours/Day"
          value={`${s.avgHours}h`}
          sub="Across today's reports"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* TABS */}
      <Tabs defaultValue="team" className="space-y-4">
        <TabsList className="flex w-full max-w-2xl flex-wrap gap-1">
          <TabsTrigger value="team" className="flex-1">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="daily" className="flex-1">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Daily Reports
          </TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Weekly Reports
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex-1">
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            Today&apos;s Tasks
          </TabsTrigger>
          <TabsTrigger value="weekly-tasks" className="flex-1">
            <ListTodo className="mr-1.5 h-3.5 w-3.5" />
            Weekly Tasks
          </TabsTrigger>
        </TabsList>

        {/* ============== TEAM TAB ============== */}
        <TabsContent value="team" className="space-y-4">
          {/* Filter pills + Add Member button */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                active={filter === "ALL"}
                onClick={() => setFilter("ALL")}
                count={filterCounts.ALL}
              >
                All
              </FilterPill>
              <FilterPill
                active={filter === "FOUNDER"}
                onClick={() => setFilter("FOUNDER")}
                count={filterCounts.FOUNDER}
              >
                Founder
              </FilterPill>
              <FilterPill
                active={filter === "STAFF"}
                onClick={() => setFilter("STAFF")}
                count={filterCounts.STAFF}
              >
                Staff
              </FilterPill>
              <FilterPill
                active={filter === "INTERN"}
                onClick={() => setFilter("INTERN")}
                count={filterCounts.INTERN}
              >
                Interns
              </FilterPill>
              <FilterPill
                active={filter === "FREELANCER"}
                onClick={() => setFilter("FREELANCER")}
                count={filterCounts.FREELANCER}
              >
                Freelancers
              </FilterPill>
            </div>
            {isFounder && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Member
              </Button>
            )}
          </div>

          {/* Member cards grid */}
          {filteredMembers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No members in this filter"
              hint="Try selecting a different role."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((m) => (
                <MemberCard
                  key={m.id}
                  m={m}
                  isFounder={isFounder}
                  isSelf={currentUser?.id === m.id}
                  onEdit={() => setEditingMember(m)}
                  onDeactivate={() => setDeactivateMember(m)}
                  onReactivate={() => handleReactivate(m)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============== DAILY REPORTS TAB ============== */}
        <TabsContent value="daily" className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Showing all daily reports, grouped by date. Today&apos;s reports
              appear first.
            </span>
          </div>

          {internsMissingToday.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Missing today&apos;s report ({internsMissingToday.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {internsMissingToday.map((m) => (
                  <MissingReportCard
                    key={m.name}
                    name={m.name}
                    title={m.title}
                  />
                ))}
              </div>
            </div>
          )}

          {dailyByDate.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No daily reports yet"
              hint="Interns should submit a report by 6:00 PM daily."
            />
          ) : (
            <div className="max-h-[800px] space-y-5 overflow-y-auto scroll-thin pr-1">
              {dailyByDate.map((group) => {
                const isToday = isSameDay(new Date(group.date), new Date());
                return (
                  <div key={group.date} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {formatDate(group.date)}
                      </h3>
                      {isToday && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                        >
                          TODAY
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {group.reports.length} report
                        {group.reports.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.reports.map((r) => (
                        <DailyReportCard key={r.id} r={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============== WEEKLY REPORTS TAB ============== */}
        <TabsContent value="weekly" className="space-y-4">
          {data!.weeklyReports.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="No weekly reports"
              hint="Weekly reports are submitted every Friday by interns."
            />
          ) : (
            <div className="max-h-[800px] space-y-3 overflow-y-auto scroll-thin pr-1">
              {data!.weeklyReports.map((r) => (
                <WeeklyReportCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============== TODAY'S TASKS TAB ============== */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            <span>
              {data!.todayTasks.length} open task
              {data!.todayTasks.length === 1 ? "" : "s"} across the team, grouped
              by priority.
            </span>
          </div>
          <TodayTasksTable tasks={data!.todayTasks} />
        </TabsContent>

        {/* ============== WEEKLY TASKS TAB ============== */}
        <TabsContent value="weekly-tasks" className="space-y-4">
          <WeeklyTasksTab
            interns={data!.members.filter((m) => m.role === "INTERN")}
          />
        </TabsContent>
      </Tabs>

      {/* ============== MANAGEMENT DIALOGS (FOUNDER only) ============== */}
      {isFounder && (
        <>
          <AddMemberDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            onCreated={loadTeam}
          />
          <EditMemberDialog
            member={editingMember}
            onOpenChange={(open) => !open && setEditingMember(null)}
            onSaved={loadTeam}
            onChangePassword={(m) => {
              setEditingMember(null);
              setPasswordMember(m);
            }}
          />
          <ChangePasswordDialog
            member={passwordMember}
            onOpenChange={(open) => !open && setPasswordMember(null)}
            onSaved={() => {
              /* no member-list refresh needed; password not shown */
            }}
          />
          <DeactivateConfirmDialog
            member={deactivateMember}
            onOpenChange={(open) => !open && setDeactivateMember(null)}
            onConfirmed={loadTeam}
          />
        </>
      )}

      {/* Reactivating overlay indicator (very subtle — just disables clicks) */}
      {reactivatingMember && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-2 rounded-md bg-background px-4 py-3 text-sm shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Reactivating {reactivatingMember.name}...
          </div>
        </div>
      )}
    </div>
  );
}
