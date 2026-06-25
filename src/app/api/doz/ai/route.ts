import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

// ============================================================
// AI Chief of Staff — Operations Director for Digit One Zero Ltd
// GET  : stored AI insights + context summary
// POST : {action: daily_plan | risk_check | proposal_draft | chat, message?, opportunityName?}
// ============================================================

const SYSTEM_PROMPT =
  "You are the AI Chief of Staff for Digit One Zero Ltd, a Nigerian event production and media company based in Lagos. " +
  "You act as an Operations Director. You are direct, actionable, and concise. You think in priorities, risks, and cash flow. " +
  "You use Nigerian Naira (\u20a6). You help the founder (Adaeze Okonkwo) reduce distraction, enforce process, and scale the company. " +
  "Always give specific, prioritized recommendations. Be brief but complete. Use markdown headings (##), bold (**text**), and bullet lists.";

// ---------- helpers ----------

async function buildContextSummary() {
  const now = new Date();

  const [opportunities, invoices, expenses, tasks, projects, paymentRequests] = await Promise.all([
    db.opportunity.findMany({ include: { account: true } }),
    db.invoice.findMany(),
    db.expense.findMany(),
    db.task.findMany({ orderBy: { dueDate: "asc" } }),
    db.project.findMany(),
    db.paymentRequest.findMany(),
  ]);

  const openOpps = opportunities.filter((o) => !["WON", "LOST"].includes(o.stage));
  const pipelineValue = openOpps.reduce((s, o) => s + o.value, 0);

  const outstandingInvoices = invoices.filter(
    (i) => i.status === "OVERDUE" || i.status === "PARTIAL" || i.status === "SENT"
  );
  const outstandingAmount = outstandingInvoices.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
  const overdueInvoices = invoices.filter((i) => i.status === "OVERDUE");
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.amount - i.amountPaid), 0);

  const totalRevenue = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const cashPosition = totalRevenue - totalExpenses;

  const pendingApprovals = paymentRequests.filter((p) => p.status === "PENDING").length;
  const openTasks = tasks.filter((t) => t.status !== "DONE").length;
  const overdueTasks = tasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < now
  ).length;
  const activeProjects = projects.filter(
    (p) => p.status === "PLANNING" || p.status === "CONFIRMED" || p.status === "IN_PROGRESS"
  ).length;
  const distractions = tasks.filter((t) => t.isDistraction && t.status !== "DONE").length;

  // top priorities — top 5 due soon/overdue by priority
  const order: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const topPriorities = tasks
    .filter((t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) <= new Date(now.getTime() + 86400000))
    .sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2))
    .slice(0, 5)
    .map((t) => t.title);

  // upcoming deadlines within 7 days (tasks + project event dates + unpaid invoice due dates)
  const upcomingDeadlines = [
    ...tasks
      .filter((t) => t.status !== "DONE" && t.dueDate)
      .map((t) => ({ title: t.title, due: t.dueDate! })),
    ...projects
      .filter((p) => p.eventDate)
      .map((p) => ({ title: p.name, due: p.eventDate! })),
    ...invoices
      .filter((i) => i.dueDate && i.status !== "PAID")
      .map((i) => ({ title: `${i.code ?? "Invoice"}`, due: i.dueDate! })),
  ]
    .filter((x) => {
      const d = new Date(x.due);
      return d >= new Date(now.getTime() - 86400000) && d <= new Date(now.getTime() + 7 * 86400000);
    })
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 8)
    .map((x) => x.title);

  return {
    pipelineValue,
    outstandingAmount,
    overdueAmount,
    pendingApprovals,
    openTasks,
    overdueTasks,
    activeProjects,
    distractions,
    cashPosition,
    topPriorities,
    upcomingDeadlines,
  };
}

// ---------- GET ----------

export async function GET() {
  try {
    const [insights, contextSummary] = await Promise.all([
      db.aIInsight.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      buildContextSummary(),
    ]);

    const stats = {
      critical: insights.filter((i) => i.severity === "CRITICAL").length,
      warnings: insights.filter((i) => i.severity === "WARNING").length,
      info: insights.filter((i) => i.severity === "INFO").length,
      unread: insights.filter((i) => !i.isRead).length,
    };

    return NextResponse.json({
      insights: insights.map((i) => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        title: i.title,
        message: i.message,
        isRead: i.isRead,
        createdAt: i.createdAt,
        entityType: i.entityType,
        entityId: i.entityId,
      })),
      stats,
      contextSummary,
    });
  } catch (err) {
    console.error("[AI GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load AI insights", insights: [], stats: { critical: 0, warnings: 0, info: 0, unread: 0 }, contextSummary: null },
      { status: 200 }
    );
  }
}

// ---------- POST ----------

interface AiPostBody {
  action: "daily_plan" | "risk_check" | "proposal_draft" | "chat";
  message?: string;
  opportunityName?: string;
}

function contextSummaryToText(ctx: Awaited<ReturnType<typeof buildContextSummary>>): string {
  return [
    `Pipeline value: \u20a6${ctx.pipelineValue.toLocaleString("en-NG")}`,
    `Outstanding invoices: \u20a6${ctx.outstandingAmount.toLocaleString("en-NG")}`,
    `Overdue invoices: \u20a6${ctx.overdueAmount.toLocaleString("en-NG")}`,
    `Cash position: \u20a6${ctx.cashPosition.toLocaleString("en-NG")}`,
    `Pending approvals: ${ctx.pendingApprovals}`,
    `Open tasks: ${ctx.openTasks} (overdue: ${ctx.overdueTasks})`,
    `Active projects: ${ctx.activeProjects}`,
    `Distractions flagged: ${ctx.distractions}`,
    `Top priorities: ${ctx.topPriorities.join("; ") || "none"}`,
    `Upcoming deadlines: ${ctx.upcomingDeadlines.join("; ") || "none"}`,
  ].join("\n");
}

function buildUserPrompt(
  action: AiPostBody["action"],
  message: string | undefined,
  opportunityName: string | undefined,
  ctx: Awaited<ReturnType<typeof buildContextSummary>>,
  opp: { name: string; value: number; accountName: string | null; serviceType: string | null } | null
): string {
  const ctxText = contextSummaryToText(ctx);

  switch (action) {
    case "daily_plan":
      return (
        `Here is the current operating context for Digit One Zero Ltd (today):\n\n${ctxText}\n\n` +
        `Produce a prioritized daily plan for the founder (Adaeze Okonkwo). ` +
        `Use markdown. Include:\n` +
        `## Top 3 Priorities\n## Delegate (who & what)\n## Defer (what to push)\n## Risk to Watch\n` +
        `Be specific, action-oriented, and tie each priority to a project or cash-flow item where possible. Use Naira.`
      );
    case "risk_check":
      return (
        `Here is the current operating context for Digit One Zero Ltd:\n\n${ctxText}\n\n` +
        `Identify the TOP 5 RISKS across projects, finances, and deadlines. ` +
        `For each risk, output as a markdown list:\n` +
        `- **Risk:** short name\n  - **Severity:** CRITICAL | WARNING | INFO\n  - **Why:** one line\n  - **Recommended action:** one specific next step\n` +
        `Prioritise cash-flow, overdue invoices, budget overruns, and missed deadlines. Be brief.`
      );
    case "proposal_draft": {
      if (opp) {
        return (
          `Draft a professional event/video production proposal outline for the following opportunity:\n\n` +
          `- Opportunity: ${opp.name}\n- Client: ${opp.accountName ?? "Prospect"}\n` +
          `- Estimated value: \u20a6${opp.value.toLocaleString("en-NG")}\n- Service type: ${opp.serviceType ?? "EVENT_PRODUCTION"}\n\n` +
          `Output as markdown with these sections:\n` +
          `## Project Overview\n## Scope of Work\n## Deliverables\n## Timeline (phased)\n## Investment (3 tiers: Standard, Professional, Premium — in Naira)\n## Terms & Conditions (payment, cancellation, IP)\n\n` +
          `Be specific to the Nigerian event production context (Lagos venues, NAPTIP/permissions where relevant, power/logistics). Keep it brief but client-ready.`
        );
      }
      return (
        `Draft a generic professional event/video production proposal outline for a new Nigerian corporate client. ` +
        `Output as markdown with: ## Project Overview, ## Scope of Work, ## Deliverables, ## Timeline, ` +
        `## Investment (3 tiers in Naira), ## Terms & Conditions. Keep it brief but client-ready.`
      );
    }
    case "chat":
    default:
      return (
        `Operating context:\n${ctxText}\n\n` +
        `Founder's question: ${message ?? "What should I focus on right now?"}\n\n` +
        `Answer as the Operations Director. Be direct, specific, and actionable. Reference real numbers from the context above. Use Naira.`
      );
  }
}

export async function POST(req: Request) {
  let body: AiPostBody;
  try {
    body = (await req.json()) as AiPostBody;
  } catch {
    return NextResponse.json({ response: "Invalid request body.", error: true }, { status: 200 });
  }

  const { action, message, opportunityName } = body;
  const validActions: AiPostBody["action"][] = ["daily_plan", "risk_check", "proposal_draft", "chat"];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { response: `Unknown action: ${action}. Valid: ${validActions.join(", ")}.`, error: true },
      { status: 200 }
    );
  }

  // build context (cheap, in-DB)
  let ctx: Awaited<ReturnType<typeof buildContextSummary>>;
  try {
    ctx = await buildContextSummary();
  } catch (e) {
    console.error("[AI POST] context build failed:", e);
    ctx = {
      pipelineValue: 0, outstandingAmount: 0, overdueAmount: 0, pendingApprovals: 0,
      openTasks: 0, overdueTasks: 0, activeProjects: 0, distractions: 0, cashPosition: 0,
      topPriorities: [], upcomingDeadlines: [],
    };
  }

  // fetch opportunity if provided
  let opp: { name: string; value: number; accountName: string | null; serviceType: string | null } | null = null;
  if (action === "proposal_draft" && opportunityName) {
    try {
      const found = await db.opportunity.findFirst({
        where: { name: { contains: opportunityName } },
        include: { account: true },
      });
      if (found) {
        opp = {
          name: found.name,
          value: found.value,
          accountName: found.account?.name ?? null,
          serviceType: found.serviceType,
        };
      }
    } catch (e) {
      console.error("[AI POST] opportunity fetch failed:", e);
    }
  }

  const userPrompt = buildUserPrompt(action, message, opportunityName, ctx, opp);

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const text: string | undefined = completion?.choices?.[0]?.message?.content;
    if (!text) {
      return NextResponse.json(
        { response: cachedFallback(action), error: true },
        { status: 200 }
      );
    }
    return NextResponse.json({ response: text, error: false });
  } catch (err) {
    console.error("[AI POST] z-ai-web-dev-sdk failed:", err);
    return NextResponse.json(
      {
        response:
          `AI service temporarily unavailable. Here's a cached recommendation:\n\n` +
          cachedFallback(action),
        error: true,
      },
      { status: 200 }
    );
  }
}

// ---------- graceful fallback when SDK fails ----------

function cachedFallback(action: AiPostBody["action"]): string {
  switch (action) {
    case "daily_plan":
      return (
        "## Top 3 Priorities\n" +
        "- Chase all overdue invoices (call finance office before noon)\n" +
        "- Confirm crew for the next confirmed event\n" +
        "- Approve or reject pending payment requests (segregation of duties)\n\n" +
        "## Delegate\n- Intern reports review — assign to operations lead\n- Vendor quote comparisons — assign to procurement\n\n" +
        "## Defer\n- Non-strategic meetings without agenda\n- Distraction tasks flagged in the system\n\n" +
        "## Risk to Watch\n- Cash position vs outstanding invoices — close the gap this week."
      );
    case "risk_check":
      return (
        "## Top 5 Risks (cached)\n" +
        "- **Risk:** Overdue invoices unpaid\n  - **Severity:** CRITICAL\n  - **Why:** Cash flow gap\n  - **Action:** Send written demand + call client today\n" +
        "- **Risk:** Budget overruns on active projects\n  - **Severity:** WARNING\n  - **Why:** Spending exceeds budget lines\n  - **Action:** Review budget utilisation report\n" +
        "- **Risk:** Pending approvals stuck\n  - **Severity:** WARNING\n  - **Why:** Vendors may halt work\n  - **Action:** Approve/reject within 24h\n" +
        "- **Risk:** Distraction tasks consuming founder time\n  - **Severity:** INFO\n  - **Why:** Reduces strategic focus\n  - **Action:** Delegate or delete\n" +
        "- **Risk:** Overdue tasks slipping\n  - **Severity:** WARNING\n  - **Why:** Milestones at risk\n  - **Action:** Reassign or rescope"
      );
    case "proposal_draft":
      return (
        "## Project Overview\nBrief description of the event/video production engagement.\n\n" +
        "## Scope of Work\n- Pre-production planning\n- Production day coverage\n- Post-production & delivery\n\n" +
        "## Deliverables\n- Final edited video / event coverage\n- Raw assets on request\n- Revisions (2 rounds)\n\n" +
        "## Timeline\n- Pre-prod: 2 weeks\n- Production: 1 day\n- Post-prod: 2 weeks\n\n" +
        "## Investment (NGN)\n- Standard: \u20a62,500,000\n- Professional: \u20a65,000,000\n- Premium: \u20a610,000,000\n\n" +
        "## Terms\n- 50% deposit on signing, 50% on delivery\n- Cancellation: 30% retention\n- IP transfers on full payment"
      );
    case "chat":
    default:
      return (
        "I'm offline right now. Quick guidance: prioritise overdue invoices, " +
        "clear pending approvals, and protect the founder's calendar from distraction tasks today."
      );
  }
}
