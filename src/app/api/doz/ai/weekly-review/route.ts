import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — return cached weekly review or generate a rule-based one
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Check for cached review (within last 7 days)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const cached = await db.weeklyReview.findFirst({
    where: { weekStart: { gte: weekStart } },
    orderBy: { generatedAt: "desc" },
  });

  if (cached) {
    return NextResponse.json({
      content: cached.content,
      topPriorities: cached.topPriorities ? JSON.parse(cached.topPriorities) : [],
      generatedAt: cached.generatedAt,
      cached: true,
    });
  }

  // Generate a rule-based weekly review
  const [
    tasksDone,
    tasksTotal,
    invoicesPaid,
    overdueInvoices,
    proposalsSent,
    proposalsAccepted,
    expenses,
    opportunities,
  ] = await Promise.all([
    db.task.count({ where: { status: "DONE" } }),
    db.task.count(),
    db.invoice.count({ where: { status: "PAID" } }),
    db.invoice.count({ where: { status: "OVERDUE" } }),
    db.proposal.count({ where: { status: "SENT" } }),
    db.proposal.count({ where: { status: "ACCEPTED" } }),
    db.expense.aggregate({ _sum: { amount: true } }),
    db.opportunity.findMany({ where: { stage: { notIn: ["WON", "LOST"] } } }),
  ]);

  const pipelineValue = opportunities.reduce((s, o) => s + o.value, 0);
  const content = `## Weekly CEO Review

### Last Week Summary
- ${tasksDone} of ${tasksTotal} tasks completed
- ${invoicesPaid} invoices paid, ${overdueInvoices} overdue
- ${proposalsSent} proposals sent, ${proposalsAccepted} accepted
- Total expenses: ₦${(expenses._sum.amount ?? 0).toLocaleString()}

### What Improved
- ${proposalsAccepted > 0 ? `${proposalsAccepted} proposals accepted` : "No proposals accepted yet"}
- ${invoicesPaid > 0 ? `${invoicesPaid} invoices collected` : "No invoices collected"}

### What Declined
${overdueInvoices > 0 ? `- ${overdueInvoices} overdue invoices need attention` : "- No overdue invoices"}

### Biggest Risks
${overdueInvoices > 0 ? `- Cash flow risk from ${overdueInvoices} overdue invoice(s)` : "- Pipeline coverage needs improvement"}
- Open pipeline: ₦${pipelineValue.toLocaleString()}

### Top 5 CEO Priorities
1. Follow up on all proposals sent >3 days ago
2. Collect overdue invoices
3. Review pipeline and update probabilities
4. Assign weekly tasks to interns
5. Plan next week's content and marketing activities`;

  const topPriorities = [
    "Follow up on proposals sent >3 days ago",
    "Collect overdue invoices",
    "Review pipeline and update probabilities",
    "Assign weekly tasks to interns",
    "Plan next week's content and marketing",
  ];

  // Cache it
  const review = await db.weeklyReview.create({
    data: {
      weekStart,
      content,
      topPriorities: JSON.stringify(topPriorities),
    },
  });

  return NextResponse.json({
    content,
    topPriorities,
    generatedAt: review.generatedAt,
    cached: false,
  });
}
