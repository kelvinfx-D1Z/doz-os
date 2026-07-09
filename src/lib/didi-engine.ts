// ============================================================
// DIDI Proactive Engine — Makes DIDI the best Chief of Staff
// Continuously monitors the business and generates insights,
// recommendations, and auto-creates tasks when needed.
// ============================================================
import { db } from "@/lib/db";

export interface DIDIInsight {
  type: string;
  severity: "CRITICAL" | "WARNING" | "ACTION" | "OPPORTUNITY" | "POSITIVE";
  title: string;
  message: string;
  recommendedAction?: string;
  autoCreateTask?: { title: string; assigneeRole?: string; priority: string };
}

export async function generateProactiveInsights(userId: string): Promise<DIDIInsight[]> {
  const insights: DIDIInsight[] = [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    overdueInvoices, pendingApprovals, overdueTasks, openOpps,
    expenses, invoices, projects, tasks, followUps, interns,
    contentThisMonth, founderTimeLogs, opportunities,
  ] = await Promise.all([
    db.invoice.findMany({ where: { status: "OVERDUE" }, include: { account: true } }),
    db.paymentRequest.findMany({ where: { status: "PENDING" }, include: { project: true } }),
    db.task.findMany({ where: { status: { not: "DONE" }, dueDate: { lt: now } }, include: { assignee: true } }),
    db.opportunity.findMany({ where: { stage: { notIn: ["WON", "LOST"] } } }),
    db.expense.aggregate({ _sum: { amount: true } }),
    db.invoice.aggregate({ _sum: { amountPaid: true }, _count: true }),
    db.project.findMany({ where: { status: { in: ["PLANNING", "CONFIRMED", "IN_PROGRESS"] } }, include: { expenses: true } }),
    db.task.findMany({ where: { status: { not: "DONE" } }, include: { assignee: true } }),
    db.followUp.findMany({ where: { completed: false, dueDate: { lt: now } }, include: { contact: true, opportunity: { include: { account: true } } } }),
    db.user.findMany({ where: { role: "INTERN", isActive: true } }),
    db.contentCalendarItem.count({ where: { publishedDate: { gte: monthStart } } }),
    db.founderTimeLog.findMany({ where: { date: { gte: weekAgo } } }),
    db.opportunity.findMany(),
  ]);

  // ===== CASH FLOW MONITORING =====
  const totalReceived = invoices._sum.amountPaid ?? 0;
  const totalSpent = expenses._sum.amount ?? 0;
  const cashPosition = totalReceived - totalSpent;

  if (overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce((s, inv) => s + (inv.amount - inv.amountPaid), 0);
    insights.push({
      type: "CASH_FLOW",
      severity: "CRITICAL",
      title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? "s" : ""} totaling ₦${totalOverdue.toLocaleString()}`,
      message: `Your cash flow is at risk. ${overdueInvoices.map(i => `${i.code} (${i.account?.name})`).join(", ")} ${overdueInvoices.length > 1 ? "are" : "is"} overdue. This represents ₦${totalOverdue.toLocaleString()} in uncollected revenue.`,
      recommendedAction: `Call ${overdueInvoices[0].account?.name} today. Send a formal payment reminder.`,
      autoCreateTask: { title: `Collect overdue invoice ${overdueInvoices[0].code} from ${overdueInvoices[0].account?.name}`, priority: "URGENT" },
    });
  }

  if (cashPosition < 5000000) {
    insights.push({
      type: "CASH_FLOW",
      severity: "WARNING",
      title: `Cash position is low: ₦${cashPosition.toLocaleString()}`,
      message: `Your current cash position (revenue minus expenses) is below ₦5M. This could limit your ability to take on new projects or handle emergencies.`,
      recommendedAction: "Prioritize collecting outstanding invoices. Review expenses for anything that can be deferred.",
    });
  }

  // ===== PIPELINE MONITORING =====
  const pipelineValue = openOpps.reduce((s, o) => s + o.value, 0);
  const proposalsSent = openOpps.filter(o => o.stage === "PROPOSAL");
  const negotiation = openOpps.filter(o => o.stage === "NEGOTIATION");

  if (proposalsSent.length > 0) {
    const oldProposals = proposalsSent.filter(o => o.expectedClose && new Date(o.expectedClose) < weekAgo);
    if (oldProposals.length > 0) {
      insights.push({
        type: "PIPELINE",
        severity: "WARNING",
        title: `${oldProposals.length} proposal${oldProposals.length > 1 ? "s" : ""} past expected close date`,
        message: `These proposals are stuck: ${oldProposals.map(o => o.name).join(", ")}. Total value: ₦${oldProposals.reduce((s, o) => s + o.value, 0).toLocaleString()}.`,
        recommendedAction: "Follow up with each client this week. Ask for a decision or feedback.",
        autoCreateTask: { title: `Follow up on ${oldProposals.length} stalled proposals`, priority: "HIGH" },
      });
    }
  }

  if (negotiation.length > 0) {
    insights.push({
      type: "PIPELINE",
      severity: "OPPORTUNITY",
      title: `${negotiation.length} deal${negotiation.length > 1 ? "s" : ""} in negotiation — ₦${negotiation.reduce((s, o) => s + o.value, 0).toLocaleString()} at stake`,
      message: `You have deals in the final stage: ${negotiation.map(o => o.name).join(", ")}. These need personal attention from you.`,
      recommendedAction: "Schedule a call with each negotiation-stage client this week.",
    });
  }

  if (pipelineValue < 50000000) {
    insights.push({
      type: "PIPELINE",
      severity: "WARNING",
      title: `Pipeline coverage is thin: ₦${(pipelineValue / 1000000).toFixed(1)}M vs ₦120M target`,
      message: `Your open pipeline only covers ${(pipelineValue / 120000000 * 100).toFixed(0)}% of your annual revenue target. You need more opportunities in the pipeline.`,
      recommendedAction: "Have Akpala research 20 new companies this week. Reach out to 3 past clients for repeat business.",
      autoCreateTask: { title: "Research 20 new potential clients this week", assigneeRole: "INTERN", priority: "HIGH" },
    });
  }

  // ===== TASK & TEAM MONITORING =====
  if (overdueTasks.length > 0) {
    const byPerson: Record<string, number> = {};
    overdueTasks.forEach(t => {
      const name = t.assignee?.name || "Unassigned";
      byPerson[name] = (byPerson[name] || 0) + 1;
    });
    insights.push({
      type: "TASKS",
      severity: "WARNING",
      title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`,
      message: `Overdue tasks by person: ${Object.entries(byPerson).map(([name, count]) => `${name}: ${count}`).join(", ")}.`,
      recommendedAction: "Review these in the Staff Hub. Reassign or reschedule as needed.",
    });
  }

  if (pendingApprovals.length > 0) {
    insights.push({
      type: "APPROVALS",
      severity: "ACTION",
      title: `${pendingApprovals.length} payment${pendingApprovals.length > 1 ? "s" : ""} awaiting your approval`,
      message: `Pending approvals: ${pendingApprovals.map(p => `${p.code} (₦${p.amount.toLocaleString()})`).join(", ")}. Total: ₦${pendingApprovals.reduce((s, p) => s + p.amount, 0).toLocaleString()}.`,
      recommendedAction: "Review and approve in Procurement → Approvals tab.",
      autoCreateTask: { title: `Approve ${pendingApprovals.length} pending payment request(s)`, priority: "HIGH" },
    });
  }

  // ===== FOLLOW-UP MONITORING =====
  if (followUps.length > 0) {
    insights.push({
      type: "FOLLOWUPS",
      severity: "WARNING",
      title: `${followUps.length} overdue follow-up${followUps.length > 1 ? "s" : ""}`,
      message: `You haven't followed up on: ${followUps.slice(0, 3).map(f => f.subject).join(", ")}${followUps.length > 3 ? ` and ${followUps.length - 3} more` : ""}.`,
      recommendedAction: "Complete these follow-ups today. Each one represents a potential deal.",
      autoCreateTask: { title: `Complete ${followUps.length} overdue follow-ups`, priority: "HIGH" },
    });
  }

  // ===== PROJECT PROFITABILITY =====
  const lossProjects = projects.filter(p => {
    const costs = p.expenses.reduce((s, e) => s + e.amount, 0);
    return p.revenue > 0 && costs > p.revenue * 0.9;
  });
  if (lossProjects.length > 0) {
    insights.push({
      type: "PROFITABILITY",
      severity: "CRITICAL",
      title: `${lossProjects.length} project${lossProjects.length > 1 ? "s" : ""} at risk of losing money`,
      message: `These projects have expenses above 90% of revenue: ${lossProjects.map(p => p.name).join(", ")}. Review immediately.`,
      recommendedAction: "Check project expenses in the Financial Intelligence module. Negotiate better vendor rates or increase the contract value.",
    });
  }

  // ===== CONTENT & MARKETING =====
  if (contentThisMonth < 12) {
    const remaining = 12 - contentThisMonth;
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    insights.push({
      type: "MARKETING",
      severity: "ACTION",
      title: `Content goal behind: ${contentThisMonth}/12 posts this month`,
      message: `You need ${remaining} more posts in ${daysLeft} days. That's ${(remaining / Math.max(daysLeft, 1)).toFixed(1)} posts per day.`,
      recommendedAction: "Have Esther create 3 posts today: 1 BTS, 1 case study, 1 educational.",
      autoCreateTask: { title: `Create ${remaining} more social media posts this month`, assigneeRole: "INTERN", priority: "HIGH" },
    });
  }

  // ===== REFERRAL DEPENDENCY =====
  const referralOpps = opportunities.filter(o => o.source === "REFERRAL");
  const referralPct = opportunities.length > 0 ? (referralOpps.length / opportunities.length) * 100 : 0;
  if (referralPct > 50) {
    insights.push({
      type: "GROWTH",
      severity: "WARNING",
      title: `Referral dependency at ${referralPct.toFixed(0)}% — target is below 40%`,
      message: `Too much of your pipeline comes from referrals. If your referrers go quiet, revenue drops. You need marketing-generated leads.`,
      recommendedAction: "Publish 2 LinkedIn case studies this week. Attend 1 networking event. Start building an email list.",
    });
  }

  // ===== FOUNDER TIME =====
  if (founderTimeLogs.length > 0) {
    const adminHours = founderTimeLogs.filter(l => l.category === "ADMINISTRATION").reduce((s, l) => s + l.hours, 0);
    const strategyHours = founderTimeLogs.filter(l => l.category === "STRATEGY").reduce((s, l) => s + l.hours, 0);
    if (adminHours > 4) {
      insights.push({
        type: "FOUNDER_TIME",
        severity: "ACTION",
        title: `You spent ${adminHours} hours on admin this week — target is below 4`,
        message: `Administrative work is consuming your time. Strategy time was only ${strategyHours} hours. You need to delegate more.`,
        recommendedAction: "Delegate invoice verification to Ngozi. Have Akpala handle CRM updates. Block 2 hours daily for strategy.",
      });
    }
  }

  // ===== INTERN ACCOUNTABILITY =====
  for (const intern of interns) {
    const internTasks = tasks.filter(t => t.assigneeId === intern.id);
    const internOverdue = overdueTasks.filter(t => t.assigneeId === intern.id);
    if (internOverdue.length > 2) {
      insights.push({
        type: "TEAM",
        severity: "WARNING",
        title: `${intern.name} has ${internOverdue.length} overdue tasks`,
        message: `${intern.name} may be overwhelmed or unclear on priorities. They have ${internTasks.length} open tasks and ${internOverdue.length} are overdue.`,
        recommendedAction: `Have a 15-minute check-in with ${intern.name}. Review their task list and reprioritize.`,
      });
    }
  }

  // ===== POSITIVE INSIGHTS =====
  if (overdueInvoices.length === 0 && pendingApprovals.length === 0 && overdueTasks.length === 0) {
    insights.push({
      type: "POSITIVE",
      severity: "POSITIVE",
      title: "Everything is on track! 🎉",
      message: "No overdue invoices, no pending approvals, no overdue tasks. You're running a tight ship. Use this time to work on strategy and growth.",
    });
  }

  return insights;
}

// ============================================================
// DIDI Smart Recommendation Engine
// Generates contextual recommendations based on current state
// ============================================================
export async function generateSmartRecommendations(userId: string): Promise<string[]> {
  const recommendations: string[] = [];
  const now = new Date();

  const [opportunities, projects, invoices, tasks, followUps] = await Promise.all([
    db.opportunity.findMany({ where: { stage: { notIn: ["WON", "LOST"] } } }),
    db.project.findMany({ where: { status: { in: ["PLANNING", "CONFIRMED", "IN_PROGRESS"] } } }),
    db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } } }),
    db.task.findMany({ where: { status: { not: "DONE" }, dueDate: { lt: now } } }),
    db.followUp.findMany({ where: { completed: false, dueDate: { lt: now } } }),
  ]);

  // Revenue-focused recommendations
  const pipelineValue = opportunities.reduce((s, o) => s + o.value, 0);
  if (pipelineValue > 0) {
    const discovery = opportunities.filter(o => o.stage === "DISCOVERY");
    if (discovery.length > opportunities.length * 0.5) {
      recommendations.push(`Move ${discovery.length} opportunities from Discovery to Qualified — they're stuck at the top of your funnel.`);
    }
  }

  // Project recommendations
  const activeProjects = projects.length;
  if (activeProjects > 5) {
    recommendations.push(`You have ${activeProjects} active projects. Consider assigning a project coordinator to reduce your operational load.`);
  }

  // Cash flow recommendations
  const outstanding = invoices.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
  if (outstanding > 5000000) {
    recommendations.push(`₦${outstanding.toLocaleString()} is outstanding in invoices. Prioritize collection this week.`);
  }

  // Task recommendations
  if (tasks.length > 10) {
    recommendations.push(`You have ${tasks.length} open tasks. Review and delegate at least 5 to your team.`);
  }

  // Follow-up recommendations
  if (followUps.length > 3) {
    recommendations.push(`${followUps.length} follow-ups are overdue. Each one is a potential deal — complete them today.`);
  }

  return recommendations;
}
