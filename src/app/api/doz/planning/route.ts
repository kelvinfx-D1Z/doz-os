import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Strategic Planning module — cascade Annual→Quarterly→Monthly→Weekly,
// tasks connected to goals, and active distraction detection.
// All tree-building + stats computed in JS from a single batched fetch.
export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const [goals, tasks, users, projects] = await Promise.all([
    db.goal.findMany({
      include: {
        owner: { select: { name: true } },
        children: {
          select: {
            id: true,
            title: true,
            type: true,
            progress: true,
            status: true,
            dueDate: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { dueDate: "asc" }],
    }),
    db.task.findMany({
      include: {
        assignee: { select: { name: true, role: true } },
        goal: { select: { title: true, type: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        title: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.project.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // =====================================================
  // GOAL TREE — top-level = ANNUAL or QUARTERLY without parent
  // (children nested via parentId match, already fetched)
  // =====================================================
  const TYPE_ORDER: Record<string, number> = {
    ANNUAL: 0,
    QUARTERLY: 1,
    MONTHLY: 2,
    WEEKLY: 3,
  };

  const topLevelGoals = goals
    .filter((g) => !g.parentId)
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
    .map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      type: g.type,
      status: g.status,
      progress: g.progress,
      quarter: g.quarter,
      startDate: g.startDate,
      dueDate: g.dueDate,
      ownerId: g.ownerId,
      owner: { name: g.owner.name },
      parentId: g.parentId,
      children: g.children
        .map((c) => ({
          id: c.id,
          title: c.title,
          type: c.type,
          progress: c.progress,
          status: c.status,
          dueDate: c.dueDate,
        }))
        .sort(
          (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
        ),
    }));

  // =====================================================
  // GOALS BY TYPE
  // =====================================================
  const goalsByType = {
    ANNUAL: goals
      .filter((g) => g.type === "ANNUAL")
      .map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        dueDate: g.dueDate,
        owner: { name: g.owner.name },
        parentId: g.parentId,
      })),
    QUARTERLY: goals
      .filter((g) => g.type === "QUARTERLY")
      .map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        quarter: g.quarter,
        dueDate: g.dueDate,
        owner: { name: g.owner.name },
        parentId: g.parentId,
      })),
    MONTHLY: goals
      .filter((g) => g.type === "MONTHLY")
      .map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        dueDate: g.dueDate,
        owner: { name: g.owner.name },
        parentId: g.parentId,
      })),
    WEEKLY: goals
      .filter((g) => g.type === "WEEKLY")
      .map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        dueDate: g.dueDate,
        owner: { name: g.owner.name },
        parentId: g.parentId,
      })),
  };

  // =====================================================
  // TASKS — shaped output (include raw IDs for the edit form)
  // =====================================================
  const tasksOut = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    isDistraction: t.isDistraction,
    dueDate: t.dueDate,
    estimatedHrs: t.estimatedHrs,
    actualHrs: t.actualHrs,
    completedAt: t.completedAt,
    assigneeId: t.assigneeId,
    goalId: t.goalId,
    projectId: t.projectId,
    assignee: t.assignee
      ? { name: t.assignee.name, role: t.assignee.role }
      : null,
    goal: t.goal ? { title: t.goal.title, type: t.goal.type } : null,
    project: t.project ? { name: t.project.name } : null,
  }));

  // =====================================================
  // USERS — lightweight list for the assignee dropdown
  // =====================================================
  const usersOut = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    title: u.title,
  }));

  // =====================================================
  // PROJECTS — lightweight list for the project dropdown
  // =====================================================
  const projectsOut = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
  }));

  // =====================================================
  // ALL GOALS — flat list for the goal-link dropdown
  // =====================================================
  const allGoalsOut = goals.map((g) => ({
    id: g.id,
    title: g.title,
    type: g.type,
    status: g.status,
    progress: g.progress,
    dueDate: g.dueDate,
    quarter: g.quarter,
  }));

  // =====================================================
  // STATS
  // =====================================================
  const activeGoals = goals.filter(
    (g) => g.status === "ACTIVE" || g.status === "ON_HOLD"
  ).length;
  const achievedGoals = goals.filter((g) => g.status === "ACHIEVED").length;
  const missedGoals = goals.filter((g) => g.status === "MISSED").length;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const completionRate =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const distractions = tasks.filter(
    (t) => t.isDistraction && t.status !== "DONE"
  ).length;

  const overdueTasks = tasks.filter(
    (t) =>
      t.status !== "DONE" &&
      t.dueDate &&
      new Date(t.dueDate).getTime() < todayStart.getTime()
  ).length;

  const dueToday = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate).getTime();
    return d >= todayStart.getTime() && d < todayEnd.getTime();
  }).length;

  const completedThisWeek = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const d = new Date(t.completedAt).getTime();
    return d >= todayStart.getTime() && d < weekEnd.getTime();
  }).length;

  const avgGoalProgress =
    goals.length > 0
      ? Math.round(
          goals.reduce((s, g) => s + g.progress, 0) / goals.length
        )
      : 0;

  return NextResponse.json({
    stats: {
      activeGoals,
      achievedGoals,
      missedGoals,
      overdueTasks,
      dueToday,
      distractions,
      completedThisWeek,
      completionRate,
      avgGoalProgress,
    },
    goals: topLevelGoals,
    tasks: tasksOut,
    goalsByType,
    users: usersOut,
    projects: projectsOut,
    allGoals: allGoalsOut,
  });
}
