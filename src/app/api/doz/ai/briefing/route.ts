import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { geminiChatComplete } from "@/lib/gemini";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// AI Chief of Staff — Proactive Morning Briefing (auto-generated)
// GET  : returns a cached (≤1h) or freshly-generated morning briefing.
//         Query ?refresh=1 bypasses the cache and forces regeneration.
//
// Storage: stored as an AIInsight row (type="DAILY_BRIEFING", severity="INFO").
// This makes it durable across server restarts and visible in the AI insights stream.
// ============================================================

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const SYSTEM_PROMPT =
  "You are the AI Chief of Staff for Digit One Zero Ltd, a Nigerian event production and media company based in Lagos. " +
  "Generate a concise, actionable morning briefing for the founder (Kelvin Keshy). " +
  "Be direct, specific, and use Nigerian Naira (\u20a6). Maximum 150 words. " +
  "Structure:\n" +
  "1) **Top priority today** (1 sentence)\n" +
  "2) **Two risks to watch** (1 sentence each, prefixed with \u26a0)\n" +
  "3) **One thing to delegate** (1 sentence, prefixed with \u2197)\n" +
  "No fluff, no preamble, no greetings. Speak as the Chief of Staff.";

// ---------- business context (mirrors /api/doz/ai buildContextSummary) ----------

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

  // top priorities — top 5 due soon/overdue by priority
  const order: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const topPriorities = tasks
    .filter((t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) <= new Date(now.getTime() + 86400000))
    .sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2))
    .slice(0, 5)
    .map((t) => t.title);

  const upcomingDeadlines = [
    ...tasks.filter((t) => t.status !== "DONE" && t.dueDate).map((t) => ({ title: t.title, due: t.dueDate! })),
    ...projects.filter((p) => p.eventDate).map((p) => ({ title: p.name, due: p.eventDate! })),
    ...invoices.filter((i) => i.dueDate && i.status !== "PAID").map((i) => ({ title: `${i.code ?? "Invoice"}`, due: i.dueDate! })),
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
    overdueCount: overdueInvoices.length,
    pendingApprovals,
    openTasks,
    overdueTasks,
    activeProjects,
    cashPosition,
    topPriorities,
    upcomingDeadlines,
  };
}

type ContextSummary = Awaited<ReturnType<typeof buildContextSummary>>;

function naira(n: number): string {
  return `\u20a6${n.toLocaleString("en-NG")}`;
}

// ---------- rule-based fallback (used if the LLM call fails) ----------

function ruleBasedFallback(ctx: ContextSummary): string {
  const lines: string[] = [];

  // Top priority today
  const topPriority =
    ctx.topPriorities[0] ??
    (ctx.overdueCount > 0
      ? "Chase overdue invoices before noon"
      : ctx.pendingApprovals > 0
        ? "Clear pending payment approvals"
        : "Advance the top open opportunity");
  lines.push(`**Top priority today:** ${topPriority}.`);

  // Two risks
  const risks: string[] = [];
  if (ctx.overdueCount > 0) {
    risks.push(`\u26a0 ${ctx.overdueCount} invoice(s) overdue totalling ${naira(ctx.overdueAmount)} \u2014 call finance office today.`);
  }
  if (ctx.pendingApprovals > 0) {
    risks.push(`\u26a0 ${ctx.pendingApprovals} payment request(s) awaiting your approval \u2014 vendors may stall.`);
  }
  if (ctx.overdueTasks > 0) {
    risks.push(`\u26a0 ${ctx.overdueTasks} task(s) overdue \u2014 milestones at risk.`);
  }
  if (ctx.cashPosition < 0) {
    risks.push(`\u26a0 Cash position is negative (${naira(ctx.cashPosition)}) \u2014 review burn rate.`);
  }
  while (risks.length < 2) risks.push("\u26a0 No new critical risks flagged this morning.");
  lines.push(risks.slice(0, 2).join("\n"));

  // Delegate
  const delegate =
    ctx.openTasks > 8
      ? `Review the ${ctx.openTasks} open tasks and delegate the bottom half to the ops lead.`
      : ctx.activeProjects > 0
        ? `Walk the floor on active projects \u2014 assign daily-report collection to an intern.`
        : `Hand off non-strategic meetings without an agenda.`;
  lines.push(`\u2197 ${delegate}`);

  return lines.join("\n");
}

// ---------- GET handler ----------

export async function GET(req: Request) {
  // Auth
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    // ---- 1. Check for a cached briefing within TTL ----
    if (!forceRefresh) {
      const cached = await db.aIInsight.findFirst({
        where: {
          type: "DAILY_BRIEFING",
          createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (cached) {
        return NextResponse.json({
          briefing: cached.message,
          generatedAt: cached.createdAt,
          cached: true,
          error: false,
        });
      }
    }

    // ---- 2. Build fresh context ----
    let ctx: ContextSummary;
    try {
      ctx = await buildContextSummary();
    } catch (e) {
      console.error("[briefing] context build failed:", e);
      ctx = {
        pipelineValue: 0, outstandingAmount: 0, overdueAmount: 0, overdueCount: 0,
        pendingApprovals: 0, openTasks: 0, overdueTasks: 0, activeProjects: 0,
        cashPosition: 0, topPriorities: [], upcomingDeadlines: [],
      };
    }

    const userPrompt = JSON.stringify({
      cashPosition: naira(ctx.cashPosition),
      overdueAmount: naira(ctx.overdueAmount),
      overdueCount: ctx.overdueCount,
      outstandingAmount: naira(ctx.outstandingAmount),
      pendingApprovals: ctx.pendingApprovals,
      overdueTasks: ctx.overdueTasks,
      openTasks: ctx.openTasks,
      activeProjects: ctx.activeProjects,
      pipelineValue: naira(ctx.pipelineValue),
      topPriorities: ctx.topPriorities,
      upcomingDeadlines: ctx.upcomingDeadlines,
    });

    // ---- 3. Call the LLM ----
    let briefing: string | null = null;
    try {
      const completion = await geminiChatComplete({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        thinking: { type: "disabled" },
      });
      briefing = completion?.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.error("[briefing] Gemini failed:", err);
    }

    // ---- 4. Fallback to rule-based briefing if LLM failed / empty ----
    const isError = !briefing;
    if (!briefing) {
      briefing = ruleBasedFallback(ctx);
    }

    // ---- 5. Persist as AIInsight (caches future reads for ≤1h) ----
    let storedCreatedAt = new Date();
    try {
      const created = await db.aIInsight.create({
        data: {
          type: "DAILY_BRIEFING",
          severity: "INFO",
          title: "AI Morning Briefing",
          message: briefing,
        },
      });
      storedCreatedAt = created.createdAt;
    } catch (e) {
      console.error("[briefing] failed to persist AIInsight:", e);
    }

    return NextResponse.json({
      briefing,
      generatedAt: storedCreatedAt,
      cached: false,
      error: isError,
    });
  } catch (err) {
    console.error("[briefing] unhandled error:", err);
    // Last-ditch fallback — never let the card crash
    return NextResponse.json({
      briefing:
        "**Top priority today:** Review overdue invoices and clear pending approvals.\n" +
        "\u26a0 Cash flow gap from outstanding invoices.\n" +
        "\u26a0 Pending approvals may stall vendor work.\n" +
        "\u2197 Delegate intern reports to the ops lead.",
      generatedAt: new Date(),
      cached: false,
      error: true,
    });
  }
}
