import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Team Management API (DOZ OS — Module 7)
// Returns team members, daily/weekly reports, today's tasks,
// plus per-member open-task counts and last-report metadata.
// ============================================================

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  // Today's date boundaries (UTC) for "reporting today" math
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [users, dailyReports, weeklyReports, tasks] = await Promise.all([
    db.user.findMany({
      include: {
        _count: {
          select: {
            tasksAssigned: true,
            dailyReports: true,
            weeklyReports: true,
            crewAssignments: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.dailyReport.findMany({
      include: {
        user: { select: { name: true, role: true, title: true } },
      },
      orderBy: { reportDate: "desc" },
    }),
    db.weeklyReport.findMany({
      include: {
        user: { select: { name: true, role: true, title: true } },
      },
      orderBy: { weekStart: "desc" },
    }),
    db.task.findMany({
      include: {
        assignee: { select: { name: true, role: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  // =====================================================
  // TASK-RELATED COMPUTATIONS
  // =====================================================
  // openTasks per member = tasks where status != DONE and assigneeId = member
  const openTasksByMember = new Map<string, number>();
  const completedTodayByMember = new Map<string, number>();
  for (const t of tasks) {
    if (!t.assigneeId) continue;
    if (t.status !== "DONE") {
      openTasksByMember.set(t.assigneeId, (openTasksByMember.get(t.assigneeId) ?? 0) + 1);
    } else if (t.completedAt && new Date(t.completedAt) >= dayStart) {
      completedTodayByMember.set(t.assigneeId, (completedTodayByMember.get(t.assigneeId) ?? 0) + 1);
    }
  }

  // =====================================================
  // LAST REPORT PER USER (most recent daily report)
  // =====================================================
  // dailyReports are already sorted desc by reportDate
  type DailyReportRow = (typeof dailyReports)[number];
  const lastReportByUser = new Map<string, DailyReportRow>();
  for (const r of dailyReports) {
    if (!lastReportByUser.has(r.userId)) {
      lastReportByUser.set(r.userId, r);
    }
  }

  // =====================================================
  // "REPORTING TODAY" — interns who reported today
  // =====================================================
  const internIds = users.filter((u) => u.role === "INTERN").map((u) => u.id);
  const reportingTodayIds = new Set<string>();
  for (const r of dailyReports) {
    const rd = new Date(r.reportDate);
    if (
      rd.getFullYear() === dayStart.getFullYear() &&
      rd.getMonth() === dayStart.getMonth() &&
      rd.getDate() === dayStart.getDate()
    ) {
      reportingTodayIds.add(r.userId);
    }
  }
  const internsReportingToday = internIds.filter((id) => reportingTodayIds.has(id)).length;

  // =====================================================
  // AVG HOURS/DAY — from today's reports (or fall back to last 7d avg)
  // =====================================================
  const todayReports = dailyReports.filter((r) => {
    const rd = new Date(r.reportDate);
    return (
      rd.getFullYear() === dayStart.getFullYear() &&
      rd.getMonth() === dayStart.getMonth() &&
      rd.getDate() === dayStart.getDate()
    );
  });
  const avgHours =
    todayReports.length > 0
      ? todayReports.reduce((s, r) => s + (r.hoursWorked ?? 0), 0) / todayReports.length
      : 0;

  // =====================================================
  // STAT ROLLUPS
  // =====================================================
  const totalMembers = users.length;
  const interns = users.filter((u) => u.role === "INTERN").length;
  const freelancers = users.filter((u) => u.role === "FREELANCER").length;
  const staff = users.filter((u) => u.role === "STAFF").length;
  const founder = users.filter((u) => u.role === "FOUNDER").length;
  const openTasks = tasks.filter((t) => t.status !== "DONE").length;
  const completedToday = tasks.filter(
    (t) => t.status === "DONE" && t.completedAt && new Date(t.completedAt) >= dayStart
  ).length;
  const reportingRate = interns > 0 ? Math.round((internsReportingToday / interns) * 100) : 0;

  // =====================================================
  // SHAPE MEMBERS
  // =====================================================
  const members = users.map((u) => {
    const last = lastReportByUser.get(u.id) ?? null;
    // Parse per-user permissions (null = role defaults apply)
    let perms: string[] | null = null;
    if (u.permissions) {
      try {
        const parsed = JSON.parse(u.permissions);
        if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
          perms = parsed;
        }
      } catch {}
    }
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      title: u.title,
      email: u.email,
      phone: u.phone,
      capacity: u.capacity,
      isActive: u.isActive,
      permissions: perms,
      _count: {
        tasksAssigned: u._count.tasksAssigned,
        dailyReports: u._count.dailyReports,
        weeklyReports: u._count.weeklyReports,
        crewAssignments: u._count.crewAssignments,
      },
      openTasks: openTasksByMember.get(u.id) ?? 0,
      lastReport: last
        ? {
            reportDate: last.reportDate,
            mood: last.mood,
            hoursWorked: last.hoursWorked,
          }
        : null,
    };
  });

  // =====================================================
  // SHAPE DAILY REPORTS
  // =====================================================
  const shapedDaily = dailyReports.map((r) => ({
    id: r.id,
    user: {
      name: r.user.name,
      role: r.user.role,
      title: r.user.title,
    },
    reportDate: r.reportDate,
    tasksDone: r.tasksDone,
    tasksPlanned: r.tasksPlanned,
    blockers: r.blockers,
    hoursWorked: r.hoursWorked,
    mood: r.mood,
    createdAt: r.createdAt,
  }));

  // =====================================================
  // SHAPE WEEKLY REPORTS
  // =====================================================
  const shapedWeekly = weeklyReports.map((r) => ({
    id: r.id,
    user: {
      name: r.user.name,
      role: r.user.role,
      title: r.user.title,
    },
    weekStart: r.weekStart,
    weekEnd: r.weekEnd,
    achievements: r.achievements,
    challenges: r.challenges,
    learnings: r.learnings,
    nextWeekPlan: r.nextWeekPlan,
    createdAt: r.createdAt,
  }));

  // =====================================================
  // TODAY'S TASKS — open tasks (not DONE), sorted by priority + dueDate
  // Priority order: URGENT > HIGH > MEDIUM > LOW
  // =====================================================
  const priorityOrder: Record<string, number> = {
    URGENT: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  const todayTasks = tasks
    .filter((t) => t.status !== "DONE")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assignee: t.assignee
        ? { name: t.assignee.name, role: t.assignee.role }
        : { name: "Unassigned", role: "—" },
    }))
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });

  return NextResponse.json({
    stats: {
      totalMembers,
      interns,
      freelancers,
      staff,
      founder,
      reportingToday: internsReportingToday,
      reportingRate,
      openTasks,
      completedToday,
      avgHours: Math.round(avgHours * 10) / 10,
    },
    members,
    dailyReports: shapedDaily,
    weeklyReports: shapedWeekly,
    todayTasks,
  });
}
