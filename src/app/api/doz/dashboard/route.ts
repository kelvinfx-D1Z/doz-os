import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// CEO Command Center aggregate — everything the founder needs in one call
export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
  ]);

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

  return NextResponse.json({
    founder: users.find((u) => u.role === "FOUNDER"),
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
