import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";

// ============================================================
// AI Chief of Staff — Operations Director for Digit One Zero Ltd
// GET  : stored AI insights + context summary
// POST : {action: daily_plan | risk_check | proposal_draft | chat
//              | plan_tasks | chat_with_actions,
//         message?, opportunityName?}
// ============================================================

const SYSTEM_PROMPT =
  "You are the AI Chief of Staff for Digit One Zero Ltd, a Nigerian event production and media company based in Lagos. " +
  "You act as an Operations Director. You are direct, actionable, and concise. You think in priorities, risks, and cash flow. " +
  "You use Nigerian Naira (\u20a6). You help the founder (Kelvin Keshy) reduce distraction, enforce process, and scale the company. " +
  "Always give specific, prioritized recommendations. Be brief but complete. Use markdown headings (##), bold (**text**), and bullet lists.";

// System prompt for DIDI with action-taking capability.
const DIDI_ACTIONS_SYSTEM_PROMPT =
  "You are DIDI, the AI Growth Coach and Chief of Staff for Digit One Zero Ltd. " +
  "The founder is Kelvin Keshy. You can TAKE ACTIONS to help run the company.\n\n" +
  "When the user asks you to do something (create a task, follow up, add a contact, etc.), respond with a JSON object containing:\n" +
  '1. "reply" — your conversational response to the user\n' +
  '2. "actions" — an array of actions to execute\n\n' +
  "Supported action types:\n" +
  '- create_task: { "type": "create_task", "data": { "title": "...", "priority": "HIGH|MEDIUM|LOW|URGENT", "category": "STRATEGIC|OPERATIONAL|ADMIN|DISTRACTION", "dueDate": "YYYY-MM-DD" } }\n' +
  '- complete_task: { "type": "complete_task", "data": { "taskTitle": "partial title to match" } }\n' +
  '- create_followup: { "type": "create_followup", "data": { "subject": "...", "type": "CALL|EMAIL|MEETING|WHATSAPP", "dueDate": "YYYY-MM-DD" } }\n' +
  '- create_account: { "type": "create_account", "data": { "name": "...", "industry": "..." } }\n' +
  '- create_opportunity: { "type": "create_opportunity", "data": { "name": "...", "value": 1000000, "accountName": "..." } }\n\n' +
  'If no actions are needed, return { "reply": "...", "actions": [] }.\n\n' +
  "Always be helpful, direct, and reference real business data. Use Nigerian Naira (\u20a6).\n" +
  "IMPORTANT: Return ONLY the JSON object — no markdown fences, no prose before or after. " +
  "The reply field should be plain text (markdown allowed), and actions should be a JSON array.";

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
    // Auth: AI insights + context summary expose company financials — FOUNDER-only.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "FOUNDER") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

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
  action: "daily_plan" | "risk_check" | "proposal_draft" | "chat" | "plan_tasks" | "chat_with_actions";
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
        `Produce a prioritized daily plan for the founder (Kelvin Keshy). ` +
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
  // Auth: AI chat can create tasks/accounts/opportunities — FOUNDER-only.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ response: "Unauthorized.", error: true }, { status: 401 });
  if (user.role !== "FOUNDER") {
    return NextResponse.json({ response: "Forbidden.", error: true }, { status: 403 });
  }

  let body: AiPostBody;
  try {
    body = (await req.json()) as AiPostBody;
  } catch {
    return NextResponse.json({ response: "Invalid request body.", error: true }, { status: 200 });
  }

  const { action, message, opportunityName } = body;
  const validActions: AiPostBody["action"][] = [
    "daily_plan", "risk_check", "proposal_draft", "chat", "plan_tasks", "chat_with_actions",
  ];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { response: `Unknown action: ${action}. Valid: ${validActions.join(", ")}.`, error: true },
      { status: 200 }
    );
  }

  // ---- plan_tasks — DIDI analyzes goals + tasks and suggests new tasks ----
  if (action === "plan_tasks") {
    return handlePlanTasks(message);
  }

  // ---- chat_with_actions — DIDI replies AND takes actions (create/complete/etc.) ----
  if (action === "chat_with_actions") {
    return handleChatWithActions(message);
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

// ============================================================
// PLAN TASKS — DIDI analyzes goals + tasks and suggests tasks
// ============================================================
async function handlePlanTasks(focusHint: string | undefined) {
  let goals: any[] = [];
  let existingTasks: any[] = [];
  let users: any[] = [];
  try {
    [goals, existingTasks, users] = await Promise.all([
      db.goal.findMany({
        where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
        include: { owner: { select: { name: true } } },
        orderBy: [{ type: "asc" }, { dueDate: "asc" }],
      }),
      db.task.findMany({
        where: { status: { not: "DONE" } },
        select: { id: true, title: true, priority: true, goalId: true },
        orderBy: { dueDate: "asc" },
      }),
      db.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true, title: true },
      }),
    ]);
  } catch (e) {
    console.error("[plan_tasks] context fetch failed:", e);
  }

  if (goals.length === 0) {
    return NextResponse.json({
      error: false,
      empty: true,
      message: "No active goals found. Define annual or quarterly goals first so DIDI can plan against them.",
      suggestions: [],
    });
  }

  const goalsSummary = goals.map((g) => {
    const days = Math.round((new Date(g.dueDate).getTime() - Date.now()) / 86400000);
    return `- [${g.type}${g.quarter ? ` ${g.quarter}` : ""}] ${g.title} — ${g.progress}% done, ${days >= 0 ? `${days}d left` : `${Math.abs(days)}d overdue`} (owner: ${g.owner?.name ?? "—"})`;
  }).join("\n");

  const existingTasksSummary = existingTasks.length === 0
    ? "(no open tasks yet)"
    : existingTasks.slice(0, 30).map((t) => `- ${t.title}`).join("\n");

  const teamSummary = users.length === 0
    ? "(no team members)"
    : users.map((u) => `- ${u.name} — ${u.role}${u.title ? ` / ${u.title}` : ""}`).join("\n");

  const userPrompt =
    `Here are the active goals at Digit One Zero Ltd:\n\n${goalsSummary}\n\n` +
    `Here are the team members available:\n${teamSummary}\n\n` +
    `Here are the currently OPEN tasks (already on the list):\n${existingTasksSummary}\n\n` +
    (focusHint ? `Founder's focus hint: ${focusHint}\n\n` : "") +
    `SUGGEST 5 to 8 NEW TASKS that would meaningfully move these goals forward. ` +
    `Do NOT duplicate tasks already on the list. For each task, return a JSON object with these fields:\n` +
    `- title: short action verb + object (e.g. "Call GTBank treasury team to confirm invoice payment")\n` +
    `- priority: URGENT | HIGH | MEDIUM | LOW\n` +
    `- category: STRATEGIC | OPERATIONAL | ADMIN | DISTRACTION\n` +
    `- assigneeSuggestion: a team member name (or "Founder" if strategic)\n` +
    `- goalTitle: the EXACT title of the goal this task connects to (must match one of the goals above)\n` +
    `- rationale: one short sentence on why this task moves the goal\n\n` +
    `Return STRICT JSON: {"suggestions": [ {title, priority, category, assigneeSuggestion, goalTitle, rationale}, ... ]}. ` +
    `Do not include any text before or after the JSON. Do not use markdown fences.`;

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
      return NextResponse.json({
        error: false,
        offline: true,
        message: "AI service offline — could not generate task suggestions.",
        suggestions: [],
      });
    }

    // Parse JSON robustly (LLMs sometimes wrap in ```json fences)
    const parsed = safeParseSuggestions(text);
    return NextResponse.json({
      error: false,
      suggestions: parsed,
      raw: parsed.length === 0 ? text : undefined,
    });
  } catch (err) {
    console.error("[plan_tasks] z-ai-web-dev-sdk failed:", err);
    return NextResponse.json({
      error: false,
      offline: true,
      message: "AI service offline — could not generate task suggestions.",
      suggestions: [],
    });
  }
}

function safeParseSuggestions(text: string): Array<{
  title: string;
  priority?: string;
  category?: string;
  assigneeSuggestion?: string;
  goalTitle?: string;
  rationale?: string;
}> {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // Find first { ... } block (greedy)
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return [];
  const slice = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    if (obj && Array.isArray(obj.suggestions)) {
      return obj.suggestions.filter((s: any) => s && typeof s.title === "string");
    }
  } catch {
    /* fall through */
  }
  return [];
}

// ============================================================
// CHAT WITH ACTIONS — DIDI takes actions through the chat
// ============================================================
async function handleChatWithActions(message: string | undefined) {
  const user = await getSessionUser();
  const userMessage = message?.trim() || "What should I focus on right now?";

  // Build a compact live context for DIDI to reason over
  let contextBlock = "";
  try {
    const ctx = await buildContextSummary();
    contextBlock = contextSummaryToText(ctx);
  } catch {
    contextBlock = "(context unavailable)";
  }

  const userPrompt =
    `Live operating context for Digit One Zero Ltd:\n${contextBlock}\n\n` +
    `Founder's message: "${userMessage}"\n\n` +
    `Respond with the JSON object as instructed. Take action(s) if the founder is asking you to create, schedule, ` +
    `follow up on, or close out something. If they're just asking a question, return an empty actions array with ` +
    `your answer in the reply field. Remember: return ONLY the JSON.`;

  let rawText = "";
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: DIDI_ACTIONS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    rawText = completion?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[chat_with_actions] z-ai-web-dev-sdk failed:", err);
    return NextResponse.json({
      reply: "I'm offline right now. Quick guidance: prioritise overdue invoices, clear pending approvals, and protect the founder's calendar today.",
      actions: [],
      actionResults: [],
      offline: true,
    });
  }

  if (!rawText) {
    return NextResponse.json({
      reply: "I didn't catch a response — please try again.",
      actions: [],
      actionResults: [],
    });
  }

  const parsed = safeParseDidiResponse(rawText);
  // If the LLM didn't return valid JSON, fall back to treating the whole text as a reply.
  if (!parsed) {
    return NextResponse.json({
      reply: rawText,
      actions: [],
      actionResults: [],
      rawNotJson: true,
    });
  }

  // Execute the actions server-side
  const actionResults: any[] = [];
  for (const act of parsed.actions ?? []) {
    try {
      const result = await executeDidiAction(act, user?.id);
      actionResults.push(result);
    } catch (e) {
      actionResults.push({
        type: act?.type,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    reply: parsed.reply ?? "",
    actions: parsed.actions ?? [],
    actionResults,
  });
}

// Parse the LLM's JSON response for chat_with_actions.
// Returns { reply, actions } or null if the response isn't valid JSON.
function safeParseDidiResponse(text: string): { reply: string; actions: any[] } | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    if (obj && typeof obj === "object" && "reply" in obj) {
      return {
        reply: typeof obj.reply === "string" ? obj.reply : "",
        actions: Array.isArray(obj.actions) ? obj.actions : [],
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// Execute a single DIDI action against the DB.
// Returns { type, ok, ...details } describing the result.
async function executeDidiAction(
  act: any,
  creatorId: string | undefined,
): Promise<any> {
  if (!act || typeof act !== "object" || typeof act.type !== "string") {
    return { ok: false, error: "invalid_action_shape" };
  }
  const data = act.data ?? {};

  switch (act.type) {
    case "create_task": {
      const title = typeof data.title === "string" ? data.title.trim() : "";
      if (!title) return { type: "create_task", ok: false, error: "missing_title" };

      const validPriorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];
      const priority = validPriorities.includes(data.priority) ? data.priority : "MEDIUM";
      const validCategories = ["STRATEGIC", "OPERATIONAL", "ADMIN", "DISTRACTION"];
      const category = validCategories.includes(data.category) ? data.category : null;

      // dueDate — accept YYYY-MM-DD, or words like "today"/"tomorrow"/"next week"
      let dueDate: Date | null = null;
      if (typeof data.dueDate === "string") {
        const d = parseFlexibleDate(data.dueDate);
        if (d) dueDate = d;
      }

      // Resolve assignee: try assigneeId, else by name match, else fall back to creator
      let assigneeId: string | undefined = data.assigneeId;
      if (!assigneeId && typeof data.assignee === "string" && data.assignee.trim()) {
        // "Founder" / "Kelvin" / "Adaeze" → first FOUNDER role user
        const lower = data.assignee.toLowerCase();
        if (lower === "founder" || lower === "kelvin" || lower === "adaeze" || lower === "ceo") {
          const founder = await db.user.findFirst({
            where: { role: "FOUNDER", isActive: true },
            select: { id: true },
          });
          if (founder) assigneeId = founder.id;
        }
        if (!assigneeId) {
          const u = await findUserByNameCI(data.assignee);
          if (u) assigneeId = u.id;
        }
      }
      if (!assigneeId && creatorId) assigneeId = creatorId;
      if (!assigneeId) {
        return { type: "create_task", ok: false, error: "no_assignee_available" };
      }

      // Try to link to a goal by goalTitle (fuzzy)
      let goalId: string | null = null;
      if (typeof data.goalTitle === "string" && data.goalTitle.trim()) {
        const g = await findGoalByTitleCI(data.goalTitle);
        if (g) goalId = g.id;
      }

      const created = await db.task.create({
        data: {
          title,
          description: typeof data.description === "string" ? data.description : null,
          priority,
          category,
          assigneeId,
          creatorId: creatorId ?? assigneeId,
          goalId,
          dueDate,
          status: "TODO",
          isDistraction: false,
        },
        select: { id: true, title: true },
      });

      try {
        await db.activityLog.create({
          data: {
            userId: creatorId ?? assigneeId,
            action: "CREATED_TASK",
            detail: `DIDI created "${created.title}"`,
          },
        });
      } catch { /* non-blocking */ }

      return { type: "create_task", ok: true, id: created.id, title: created.title };
    }

    case "complete_task": {
      const partial = typeof data.taskTitle === "string" ? data.taskTitle.trim() : "";
      if (!partial) return { type: "complete_task", ok: false, error: "missing_taskTitle" };

      const target = await findOpenTaskByTitleCI(partial);
      if (!target) {
        return { type: "complete_task", ok: false, error: "task_not_found", taskTitle: partial };
      }
      const updated = await db.task.update({
        where: { id: target.id },
        data: { status: "DONE", completedAt: new Date() },
        select: { id: true, title: true },
      });
      try {
        await db.activityLog.create({
          data: {
            userId: creatorId ?? updated.id,
            action: "COMPLETED_TASK",
            detail: `DIDI marked "${updated.title}" as done`,
          },
        });
      } catch { /* non-blocking */ }
      return { type: "complete_task", ok: true, id: updated.id, title: updated.title };
    }

    case "create_followup": {
      const subject = typeof data.subject === "string" ? data.subject.trim() : "";
      if (!subject) return { type: "create_followup", ok: false, error: "missing_subject" };

      const validTypes = ["CALL", "EMAIL", "MEETING", "WHATSAPP"];
      const type = validTypes.includes(data.type) ? data.type : "CALL";

      // dueDate default to +1 day if not provided
      let dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      if (typeof data.dueDate === "string") {
        const d = parseFlexibleDate(data.dueDate);
        if (d) dueDate = d;
      }

      // Try to attach to an opportunity by opportunityName
      let opportunityId: string | null = null;
      if (typeof data.opportunityName === "string" && data.opportunityName.trim()) {
        const o = await findOpportunityByNameCI(data.opportunityName);
        if (o) opportunityId = o.id;
      }

      const created = await db.followUp.create({
        data: {
          subject,
          type,
          dueDate,
          notes: typeof data.notes === "string" ? data.notes : null,
          opportunityId,
        },
        select: { id: true, subject: true, dueDate: true },
      });
      try {
        await db.activityLog.create({
          data: {
            userId: creatorId ?? "system",
            action: "CREATED_FOLLOWUP",
            detail: `DIDI scheduled "${created.subject}"`,
          },
        });
      } catch { /* non-blocking */ }
      return {
        type: "create_followup",
        ok: true,
        id: created.id,
        subject: created.subject,
        dueDate: created.dueDate?.toISOString(),
      };
    }

    case "create_account": {
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) return { type: "create_account", ok: false, error: "missing_name" };

      // De-dupe by name (case-insensitive)
      const existing = await findAccountByNameCI(name);
      if (existing) {
        return {
          type: "create_account",
          ok: false,
          error: "account_exists",
          id: existing.id,
          name: existing.name,
        };
      }

      const created = await db.account.create({
        data: {
          name,
          industry: typeof data.industry === "string" ? data.industry : null,
        },
        select: { id: true, name: true },
      });
      try {
        await db.activityLog.create({
          data: {
            userId: creatorId ?? "system",
            action: "CREATED_ACCOUNT",
            detail: `DIDI created account "${created.name}"`,
          },
        });
      } catch { /* non-blocking */ }
      return { type: "create_account", ok: true, id: created.id, name: created.name };
    }

    case "create_opportunity": {
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) return { type: "create_opportunity", ok: false, error: "missing_name" };

      let accountId: string | null = null;
      if (typeof data.accountName === "string" && data.accountName.trim()) {
        const a = await findAccountByNameCI(data.accountName);
        if (a) accountId = a.id;
      }

      const value = typeof data.value === "number" && !isNaN(data.value) ? data.value : 0;
      const validStages = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
      const stage = validStages.includes(data.stage) ? data.stage : "DISCOVERY";

      const created = await db.opportunity.create({
        data: {
          name,
          value,
          stage,
          accountId,
        },
        select: { id: true, name: true, value: true },
      });
      try {
        await db.activityLog.create({
          data: {
            userId: creatorId ?? "system",
            action: "CREATED_OPPORTUNITY",
            detail: `DIDI created opportunity "${created.name}" (\u20a6${created.value.toLocaleString("en-NG")})`,
          },
        });
      } catch { /* non-blocking */ }
      return {
        type: "create_opportunity",
        ok: true,
        id: created.id,
        name: created.name,
        value: created.value,
      };
    }

    default:
      return { type: act.type, ok: false, error: "unknown_action_type" };
  }
}

// Parse a flexible date input.
// - "today", "tomorrow", "next week" / "next-week" / "end of week"
// - YYYY-MM-DD, ISO strings, or any string Date can parse.
function parseFlexibleDate(input: string): Date | null {
  const lower = input.trim().toLowerCase();
  if (lower === "today") {
    const d = new Date(); d.setHours(17, 0, 0, 0); return d;
  }
  if (lower === "tomorrow") {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); return d;
  }
  if (lower === "next week" || lower === "next-week" || lower === "end of week" || lower === "end-of-week") {
    const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(17, 0, 0, 0); return d;
  }
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d;
  return null;
}

// ============================================================
// Case-insensitive finders — SQLite Prisma doesn't support
// `mode: "insensitive"`, so we fetch a small set and filter in JS.
// ============================================================
async function findUserByNameCI(name: string): Promise<{ id: string } | null> {
  if (!name.trim()) return null;
  const lower = name.toLowerCase();
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    take: 200,
  });
  // Prefer exact, then contains (case-insensitive).
  const exact = users.find((u) => u.name.toLowerCase() === lower);
  if (exact) return { id: exact.id };
  const contains = users.find((u) => u.name.toLowerCase().includes(lower));
  if (contains) return { id: contains.id };
  // Allow matching on first name only
  const firstName = lower.split(" ")[0];
  if (firstName.length >= 3) {
    const byFirst = users.find((u) => u.name.toLowerCase().startsWith(firstName));
    if (byFirst) return { id: byFirst.id };
  }
  return null;
}

async function findGoalByTitleCI(title: string): Promise<{ id: string } | null> {
  if (!title.trim()) return null;
  const lower = title.toLowerCase();
  const goals = await db.goal.findMany({
    select: { id: true, title: true },
    take: 200,
  });
  const exact = goals.find((g) => g.title.toLowerCase() === lower);
  if (exact) return { id: exact.id };
  const contains = goals.find((g) =>
    g.title.toLowerCase().includes(lower) || lower.includes(g.title.toLowerCase())
  );
  if (contains) return { id: contains.id };
  return null;
}

async function findOpenTaskByTitleCI(partial: string): Promise<{ id: string; title: string } | null> {
  if (!partial.trim()) return null;
  const lower = partial.toLowerCase();
  const tasks = await db.task.findMany({
    where: { status: { not: "DONE" } },
    select: { id: true, title: true, dueDate: true },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
  const contains = tasks.find((t) => t.title.toLowerCase().includes(lower));
  if (contains) return { id: contains.id, title: contains.title };
  // Try matching by significant keywords
  const keywords = lower.split(/\s+/).filter((w) => w.length >= 4);
  if (keywords.length > 0) {
    const matched = tasks.find((t) => {
      const tl = t.title.toLowerCase();
      return keywords.every((k) => tl.includes(k));
    });
    if (matched) return { id: matched.id, title: matched.title };
  }
  return null;
}

async function findOpportunityByNameCI(name: string): Promise<{ id: string } | null> {
  if (!name.trim()) return null;
  const lower = name.toLowerCase();
  const opps = await db.opportunity.findMany({
    select: { id: true, name: true },
    take: 200,
  });
  const exact = opps.find((o) => o.name.toLowerCase() === lower);
  if (exact) return { id: exact.id };
  const contains = opps.find((o) => o.name.toLowerCase().includes(lower));
  if (contains) return { id: contains.id };
  return null;
}

async function findAccountByNameCI(name: string): Promise<{ id: string; name: string } | null> {
  if (!name.trim()) return null;
  const lower = name.toLowerCase();
  const accounts = await db.account.findMany({
    select: { id: true, name: true },
    take: 200,
  });
  const exact = accounts.find((a) => a.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, name: exact.name };
  const contains = accounts.find((a) => a.name.toLowerCase().includes(lower));
  if (contains) return { id: contains.id, name: contains.name };
  return null;
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
    case "plan_tasks":
    case "chat_with_actions":
    default:
      return (
        "I'm offline right now. Quick guidance: prioritise overdue invoices, " +
        "clear pending approvals, and protect the founder's calendar from distraction tasks today."
      );
  }
}
