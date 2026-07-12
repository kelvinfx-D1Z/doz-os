import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// CEO Command Center aggregate — company-wide data + per-user `myDay` block.
// The company-wide payload is what the founder sees. Staff/Interns/Freelancers
// get the same payload (so they COULD see company data) but the Command Center
// UI switches to a role-aware layout driven by `currentUser` + `myDay`.

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function endOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
}

export async function GET() {
  // ---------------------------------------------------------------
  // Auth — every role (including founder) must be signed in.
  // ---------------------------------------------------------------
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const [
    users,
    tasks,
    goals,
    opportunities,
    proposals,
    followUps,
    invoices,
    expenses,
    paymentRequests,
    rfqs,
    projects,
    dailyReports,
    aiInsights,
    activityLogs,
    approvals,
    // ---- user-scoped data (fetched in parallel) ------------------
    myTasksAll,        // all tasks assigned to current user (for due-today / overdue filtering)
    myDoneToday,       // tasks completed by current user today
    myTodayReport,     // today's daily report for current user
    myRecentReports,   // last 5 daily reports by current user
    myCrewAssignments, // crew assignments for current user (freelancer)
    myManagedProjects, // projects managed by current user (staff)
    mySubmittedRequests, // payment requests submitted by current user (staff)
    trainingSops,      // TRAINING category SOPs (intern learning plan)
  ] = await Promise.all([
    db.user.findMany({ where: { isActive: true } }),
    db.task.findMany({ include: { assignee: true, goal: true, project: true }, orderBy: { dueDate: "asc" } }),
    db.goal.findMany({ orderBy: { type: "asc" } }),
    db.opportunity.findMany({ include: { account: true, contact: true }, orderBy: { value: "desc" } }),
    db.proposal.findMany({ include: { opportunity: { include: { account: true } } }, orderBy: { createdAt: "desc" } }),
    db.followUp.findMany({ include: { contact: true, opportunity: { include: { account: true } } }, orderBy: { dueDate: "asc" } }),
    db.invoice.findMany({ include: { account: true, project: true } }),
    db.expense.findMany({ include: { project: true, vendor: true } }),
    db.paymentRequest.findMany({ include: { requester: true, approver: true, payer: true, purchaseOrder: true, project: true }, orderBy: { createdAt: "desc" } }),
    db.rfq.findMany({ include: { project: true, quotes: { include: { vendor: true } } } }),
    db.project.findMany({ include: { account: true, manager: true, crew: { include: { user: true } } } }),
    db.dailyReport.findMany({ include: { user: true }, orderBy: { reportDate: "desc" }, take: 30 }),
    db.aIInsight.findMany({ orderBy: { createdAt: "desc" } }),
    db.activityLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.approval.findMany({ where: { decision: "PENDING" }, include: { approver: true } }),

    // ---- user-scoped queries -----------------------------------
    db.task.findMany({
      where: { assigneeId: sessionUser.id },
      include: {
        assignee: { select: { id: true, name: true, role: true } },
        goal: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
    }),
    db.task.findMany({
      where: {
        assigneeId: sessionUser.id,
        status: "DONE",
        completedAt: { gte: todayStart, lte: todayEnd },
      },
      select: { id: true, title: true, completedAt: true },
    }),
    db.dailyReport.findFirst({
      where: { userId: sessionUser.id, reportDate: { gte: todayStart, lte: todayEnd } },
      orderBy: { createdAt: "desc" },
    }),
    db.dailyReport.findMany({
      where: { userId: sessionUser.id },
      orderBy: { reportDate: "desc" },
      take: 5,
      select: {
        id: true,
        reportDate: true,
        tasksDone: true,
        blockers: true,
        hoursWorked: true,
        mood: true,
      },
    }),
    db.crewAssignment.findMany({
      where: { userId: sessionUser.id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            eventDate: true,
            venue: true,
            serviceType: true,
            status: true,
            account: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.project.findMany({
      where: { managerId: sessionUser.id },
      include: {
        account: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    }),
    db.paymentRequest.findMany({
      where: { requesterId: sessionUser.id, status: { in: ["PENDING", "APPROVED"] } },
      include: {
        approver: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.sop.findMany({
      where: { category: "TRAINING" },
      select: {
        id: true,
        title: true,
        category: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);

  // ---------------------------------------------------------------
  // Company-wide aggregates (kept exactly as before)
  // ---------------------------------------------------------------
  const dueTodayOrOverdue = tasks
    .filter((t) => t.status !== "DONE")
    .filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d <= new Date(now.getTime() + 86400000);
    })
    .sort((a, b) => {
      const order: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
    });
  const topPriorities = dueTodayOrOverdue.slice(0, 5);

  const pendingApprovals = paymentRequests.filter((p) => p.status === "PENDING");

  const openOpps = opportunities.filter((o) => !["WON", "LOST"].includes(o.stage));
  const pipelineValue = openOpps.reduce((s, o) => s + o.value, 0);
  const weightedPipeline = openOpps.reduce((s, o) => s + (o.value * o.probability) / 100, 0);
  const wonOpps = opportunities.filter((o) => o.stage === "WON");
  const lostOpps = opportunities.filter((o) => o.stage === "LOST");
  const proposalsSent = proposals.filter((p) => p.status === "SENT");
  const proposalsAccepted = proposals.filter((p) => p.status === "ACCEPTED");
  const conversionRate = proposals.length > 0 ? (proposalsAccepted.length / proposals.length) * 100 : 0;

  const totalRevenue = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const outstandingInvoices = invoices.filter((i) => i.status === "OVERDUE" || i.status === "PARTIAL" || i.status === "SENT");
  const outstandingAmount = outstandingInvoices.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
  const overdueInvoices = invoices.filter((i) => i.status === "OVERDUE");
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
  const cashPosition = totalRevenue - totalExpenses;

  const upcoming = [
    ...tasks.filter((t) => t.status !== "DONE" && t.dueDate).map((t) => ({ type: "TASK", title: t.title, due: t.dueDate!, id: t.id })),
    ...projects.filter((p) => p.eventDate).map((p) => ({ type: "EVENT", title: p.name, due: p.eventDate!, id: p.id })),
    ...invoices.filter((i) => i.dueDate && i.status !== "PAID").map((i) => ({ type: "INVOICE", title: `${i.code} — ${i.account?.name ?? "—"}`, due: i.dueDate!, id: i.id })),
  ]
    .filter((x) => new Date(x.due) >= todayStart && new Date(x.due) <= new Date(now.getTime() + 7 * 86400000))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const interns = users.filter((u) => u.role === "INTERN");
  const todayReports = dailyReports.filter((r) => new Date(r.reportDate) >= todayStart);

  const distractions = tasks.filter((t) => t.isDistraction && t.status !== "DONE");

  const openRfqs = rfqs.filter((r) => r.status === "OPEN");

  const serviceRevenue: Record<string, number> = {};
  for (const p of projects) {
    const rev = p.revenue || 0;
    serviceRevenue[p.serviceType] = (serviceRevenue[p.serviceType] || 0) + rev;
  }
  const totalProjRevenue = Object.values(serviceRevenue).reduce((a, b) => a + b, 0);
  const serviceMix = Object.entries(serviceRevenue)
    .map(([k, v]) => ({ name: k.replace(/_/g, " "), value: v, pct: totalProjRevenue > 0 ? (v / totalProjRevenue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const weeklyGoal = goals.find((g) => g.type === "WEEKLY");

  // ---------------------------------------------------------------
  // myDay — user-scoped data for the personalized Command Center
  // ---------------------------------------------------------------
  // 1. User's tasks due today or overdue (not done).
  const myDayTasksRaw = myTasksAll
    .filter((t) => t.status !== "DONE")
    .filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      // due today or earlier (overdue)
      return d <= todayEnd;
    })
    .sort((a, b) => {
      const order: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const pa = order[a.priority] ?? 2;
      const pb = order[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    });

  const myDayTasks = myDayTasksRaw.slice(0, 12).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    isDistraction: t.isDistraction,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name, role: t.assignee.role } : null,
    goal: t.goal ? { id: t.goal.id, title: t.goal.title } : null,
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
  }));

  // 2. Overdue count for the user's tasks.
  const myOverdueCount = myTasksAll.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < todayStart,
  ).length;

  // 3. Did the user file today's daily report?
  const reportFiled = !!myTodayReport;

  // 4. Weekly objective — prefer a WEEKLY goal owned by this user, else the company weekly goal.
  const myWeeklyGoal =
    goals.find((g) => g.type === "WEEKLY" && g.ownerId === sessionUser.id) ??
    weeklyGoal ??
    null;
  const myWeeklyObjective = myWeeklyGoal
    ? {
        id: myWeeklyGoal.id,
        title: myWeeklyGoal.title,
        progress: myWeeklyGoal.progress,
        dueDate: myWeeklyGoal.dueDate ? myWeeklyGoal.dueDate.toISOString() : null,
      }
    : null;

  // 5. Pending approvals the current user can action.
  //    Rule (segregation of duties): user can action a PENDING request if
  //    (a) they are the assigned approver, OR
  //    (b) the approver is unassigned AND they are NOT the requester.
  //    Founder sees all pending (since founder signs off on everything).
  const isFounder = sessionUser.role === "FOUNDER";
  const myActionableApprovals = pendingApprovals.filter((p) => {
    if (isFounder) return true;
    if (p.requesterId === sessionUser.id) return false; // can't approve own request
    if (p.approverId === null || p.approverId === undefined) return true;
    return p.approverId === sessionUser.id;
  });
  const myPendingApprovalItems = myActionableApprovals.slice(0, 8).map((p) => ({
    id: p.id,
    code: p.code,
    amount: p.amount,
    description: p.description,
    status: p.status,
    requester: p.requester ? { name: p.requester.name } : null,
    project: p.project ? { name: p.project.name } : null,
  }));

  // 6. My recent reports (last 3) — intern view.
  const myRecentReportsShaped = myRecentReports.slice(0, 3).map((r) => ({
    id: r.id,
    reportDate: r.reportDate.toISOString(),
    tasksDone: r.tasksDone,
    blockers: r.blockers,
    hoursWorked: r.hoursWorked,
    mood: r.mood,
  }));

  // 7. My projects (where current user is manager) — staff view.
  const myProjects = myManagedProjects
    .filter((p) => ["PLANNING", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(p.status))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      status: p.status,
      serviceType: p.serviceType,
      eventDate: p.eventDate ? p.eventDate.toISOString() : null,
      progress: p.progress,
      account: p.account ? { name: p.account.name } : null,
    }));

  // 8. My crew assignments (current user) — freelancer view.
  const myCrew = myCrewAssignments
    .filter((c) => ["PLANNING", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(c.project.status))
    .map((c) => ({
      id: c.id,
      role: c.role,
      dayRate: c.dayRate,
      status: c.status,
      project: {
        id: c.project.id,
        name: c.project.name,
        code: c.project.code,
        eventDate: c.project.eventDate ? c.project.eventDate.toISOString() : null,
        venue: c.project.venue,
        serviceType: c.project.serviceType,
        status: c.project.status,
        account: c.project.account ? { name: c.project.account.name } : null,
      },
    }));

  // 9. My deliverables — deliverables on projects where the current user has a crew assignment (freelancer).
  const myProjectIds = new Set(myCrewAssignments.map((c) => c.projectId));
  let myDeliverablesShaped: Array<{
    id: string;
    title: string;
    type: string | null;
    status: string;
    dueDate: string | null;
    deliveredAt: string | null;
    project: { id: string; name: string };
  }> = [];
  if (sessionUser.role === "FREELANCER" && myProjectIds.size > 0) {
    const deliverables = await db.deliverable.findMany({
      where: { projectId: { in: Array.from(myProjectIds) } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 20,
    });
    myDeliverablesShaped = deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      dueDate: d.dueDate ? d.dueDate.toISOString() : null,
      deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
      project: { id: d.project.id, name: d.project.name },
    }));
  }

  // 10. My submitted requests (waiting for approval) — staff view.
  const mySubmittedRequestsShaped = mySubmittedRequests.slice(0, 5).map((p) => ({
    id: p.id,
    code: p.code,
    amount: p.amount,
    status: p.status,
    description: p.description,
    project: p.project ? { name: p.project.name } : null,
    approver: p.approver ? { name: p.approver.name } : null,
  }));

  // 11. Team reports today — for staff, count of non-founder users who filed today.
  const nonFounderUsers = users.filter((u) => u.role !== "FOUNDER");
  const teamReportsToday = dailyReports.filter(
    (r) => new Date(r.reportDate) >= todayStart && r.user?.role !== "FOUNDER",
  ).length;

  // 12. Learning plan (TRAINING SOPs) — intern view.
  const learningPlan = trainingSops.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    updatedAt: s.updatedAt.toISOString(),
  }));

  // 13. Team activity — recent activity from non-founder users (staff view).
  const teamActivity = activityLogs
    .filter((a) => a.user && a.user.role !== "FOUNDER")
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      user: a.user ? { name: a.user.name, role: a.user.role } : null,
      createdAt: a.createdAt.toISOString(),
    }));

  // ---------------------------------------------------------------
  // currentUser object exposed to the client.
  // ---------------------------------------------------------------
  const currentUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.role,
    title: sessionUser.title ?? null,
  };

  // ============================================================
  // ROLE-SCOPED RESPONSE
  // FOUNDER sees the full company-wide payload.
  // STAFF/INTERN/FREELANCER see ONLY their own myDay block — no
  //   company revenue, profit, pipeline, approvals, invoices, etc.
  //   This prevents financial data leakage and password-hash exposure
  //   (the `founder` object previously included the password column).
  // ============================================================
  // Note: `isFounder` is already declared above (line ~283) for the
  // pendingApprovals filter — we reuse it here.

  // Never expose the raw user object — it includes the password hash.
  // Only expose a safe subset.
  const safeFounder = isFounder && users.find((u) => u.role === "FOUNDER")
    ? {
        id: (users.find((u) => u.role === "FOUNDER")!).id,
        name: (users.find((u) => u.role === "FOUNDER")!).name,
        email: (users.find((u) => u.role === "FOUNDER")!).email,
        role: (users.find((u) => u.role === "FOUNDER")!).role,
        title: (users.find((u) => u.role === "FOUNDER")!).title,
      }
    : null;

  if (isFounder) {
    return NextResponse.json({
      founder: safeFounder,
      currentUser,
      myDay: {
        tasks: myDayTasks,
        taskCount: myDayTasks.length,
        overdueCount: myOverdueCount,
        doneToday: myDoneToday.length,
        reportFiled,
        todayReportId: myTodayReport?.id ?? null,
        weeklyObjective: myWeeklyObjective,
        pendingApprovals: myActionableApprovals.length,
        pendingApprovalItems: myPendingApprovalItems,
        myProjects,
        myPendingRequests: mySubmittedRequestsShaped,
        crewAssignments: myCrew,
        deliverables: myDeliverablesShaped,
        recentReports: myRecentReportsShaped,
        learningPlan,
        teamReportsToday,
        teamReportsTotal: nonFounderUsers.length,
        teamActivity,
      },
      stats: {
        pipelineValue,
        weightedPipeline,
        openOpps: openOpps.length,
        wonOpps: wonOpps.length,
        proposalsSent: proposalsSent.length,
        proposalsAccepted: proposalsAccepted.length,
        conversionRate,
        totalRevenue,
        totalExpenses,
        grossProfit: totalRevenue - totalExpenses,
        marginPct: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
        outstandingAmount,
        overdueAmount,
        overdueCount: overdueInvoices.length,
        cashPosition,
        pendingApprovals: pendingApprovals.length,
        pendingPaymentsValue: pendingApprovals.reduce((s, p) => s + p.amount, 0),
        openTasks: tasks.filter((t) => t.status !== "DONE").length,
        overdueTasks: tasks.filter((t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < now).length,
        activeProjects: projects.filter((p) => ["PLANNING", "CONFIRMED", "IN_PROGRESS"].includes(p.status)).length,
        internsReporting: todayReports.length,
        totalInterns: interns.length,
        openRfqs: openRfqs.length,
        distractions: distractions.length,
      },
      topPriorities,
      weeklyGoal,
      goals: goals.filter((g) => g.status === "ACTIVE"),
      pendingApprovals,
      upcoming,
      openOpps: openOpps.slice(0, 8),
      outstandingInvoices,
      overdueInvoices,
      serviceMix,
      interns,
      todayReports,
      recentActivity: activityLogs,
      aiInsights,
      pendingRfqs: openRfqs,
      followUpsDue: followUps.filter((f) => !f.completed && new Date(f.dueDate) <= new Date(now.getTime() + 86400000)),
      lostOpps,
      tasks,
    });
  }

  // NON-FOUNDER RESPONSE — only the user's own myDay block.
  // No company financials, no other users' data, no founder object.
  return NextResponse.json({
    founder: null,
    currentUser,
    myDay: {
      tasks: myDayTasks,
      taskCount: myDayTasks.length,
      overdueCount: myOverdueCount,
      doneToday: myDoneToday.length,
      reportFiled,
      todayReportId: myTodayReport?.id ?? null,
      weeklyObjective: myWeeklyObjective,
      pendingApprovals: myActionableApprovals.length,
      pendingApprovalItems: myPendingApprovalItems,
      myProjects,
      myPendingRequests: mySubmittedRequestsShaped,
      crewAssignments: myCrew,
      deliverables: myDeliverablesShaped,
      recentReports: myRecentReportsShaped,
      learningPlan,
      teamReportsToday,
      teamReportsTotal: nonFounderUsers.length,
      teamActivity,
    },
    // Empty stats for non-founders — the UI uses myDay instead.
    stats: {},
    topPriorities: [],
    weeklyGoal: null,
    goals: [],
    pendingApprovals: [],
    upcoming: [],
    openOpps: [],
    outstandingInvoices: [],
    overdueInvoices: [],
    serviceMix: [],
    interns: [],
    todayReports: [],
    recentActivity: [],
    aiInsights: [],
    pendingRfqs: [],
    followUpsDue: [],
    lostOpps: [],
    tasks: myDayTasks,
  });
}
