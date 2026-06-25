"use client";

import { useEffect, useState, useMemo } from "react";
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
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import { formatDate, relativeTime, avatarColor, initials } from "@/lib/format";
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
function MemberCard({ m }: { m: Member }) {
  const today = new Date();
  const reportedToday =
    m.lastReport && isSameDay(new Date(m.lastReport.reportDate), today);

  return (
    <Card className="flex flex-col gap-3 p-4">
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
          <p className="truncate text-xs text-muted-foreground">
            {m.title ?? m.role.toLowerCase()}
          </p>
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
// Main component
// ============================================================
export function Team() {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Role | "ALL">("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doz/team");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TeamData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load team");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        </TabsList>

        {/* ============== TEAM TAB ============== */}
        <TabsContent value="team" className="space-y-4">
          {/* Filter pills */}
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
                <MemberCard key={m.id} m={m} />
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
      </Tabs>
    </div>
  );
}
