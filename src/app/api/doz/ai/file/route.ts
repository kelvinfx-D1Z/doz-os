import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { geminiText, isGeminiConfigured } from "@/lib/gemini";
import { syncProjectBudget } from "@/lib/project-figures";
import {
  buildFilingPlan,
  isPostable,
  parseMoney,
  formatNaira,
  type FilingPlan,
  type ParsedSentence,
  type ProjectRef,
} from "@/lib/filing-draft";

// ============================================================
// "FILE IT UP FOR ME"
//
// One sentence — "I have paid 4 million for the PTDJ event already, this
// covers screens, sound and lights" — becomes a project, its cost lines and
// a record of the money.
//
// TWO STEPS, ALWAYS. POST /draft reads the sentence and returns a proposal
// that writes nothing. POST /commit writes what the founder confirmed, and
// only what he confirmed: it re-reads nothing from the sentence and takes no
// figure the proposal did not show him.
//
// That split is the whole design. Everything here lands in the finance
// module and in the margin on a real job. An AI that posts ₦4m on its own
// reading of a sentence is not proactive, it is unsupervised.
//
// FOUNDER AND STAFF ONLY: this writes money.
// ============================================================

const SYSTEM = [
  "You read one sentence from a Nigerian event production company's founder and extract what it states.",
  "Return ONLY a JSON object, no markdown fences, with these fields:",
  '  projectName: string — the event or client named, exactly as written ("PTDJ", "Triple Helix"). "" if none.',
  '  amount: string — the money figure exactly as written ("4 million", "₦4m", "400k"). "" if none.',
  '  direction: "PAID_OUT" when the company spent money, "RECEIVED" when a client paid the company.',
  '  departments: string[] — the services mentioned, in his own words ("screens", "sound", "lights").',
  '  occurredOn: string — a date only if stated ("today", "yesterday", "2026-09-30"). "" otherwise.',
  "",
  "Rules you must not break:",
  "- Never invent a figure, a date, a project or a department that the sentence does not contain.",
  "- Never split one total across several departments. Report the total once.",
  '- "I have paid" / "we paid" / "settled" is PAID_OUT. "they paid us" / "received" is RECEIVED.',
  "- If something is not stated, return an empty string or an empty array for it.",
].join("\n");

function canFile(role: string): boolean {
  return role === "FOUNDER" || role === "STAFF";
}

/** The model's answer, with every field forced into the shape we expect. */
function readModelJson(raw: string): ParsedSentence {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return {
      projectName: typeof parsed.projectName === "string" ? parsed.projectName : undefined,
      amount: typeof parsed.amount === "string" || typeof parsed.amount === "number" ? parsed.amount : undefined,
      direction: typeof parsed.direction === "string" ? parsed.direction : undefined,
      departments: Array.isArray(parsed.departments)
        ? parsed.departments.filter((d): d is string => typeof d === "string").slice(0, 12)
        : undefined,
      occurredOn: typeof parsed.occurredOn === "string" ? parsed.occurredOn : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * What the sentence says, read without the model.
 *
 * Used when Gemini is not configured or does not answer. It reads a figure
 * and the direction — the two things that decide whether anything can be
 * filed at all — and leaves the rest to the founder. A degraded draft he can
 * correct beats "the AI is offline".
 */
function readWithoutModel(text: string): ParsedSentence {
  const money = /(?:₦|ngn)?\s?(\d[\d,.]*)\s*(million|billion|m\b|bn\b|k\b|thousand)?/i.exec(text);
  const amount = money ? `${money[1]}${money[2] ? ` ${money[2]}` : ""}` : "";
  const received = /\b(paid us|paid me|received|they paid|client paid|credited)\b/i.test(text);
  return {
    projectName: "",
    amount,
    direction: received ? "RECEIVED" : "PAID_OUT",
    departments: [],
    occurredOn: "",
  };
}

async function context(): Promise<{ projects: ProjectRef[]; categories: string[] }> {
  const [projects, categories] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.serviceCategory.findMany({ select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { projects, categories: categories.map((c) => c.name) };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canFile(user.role)) {
    return NextResponse.json(
      { error: "Only the founder or staff can file money against a project" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.step === "commit") return commit(body, user.id, user.role);
  return draft(body);
}

/** Step one: read the sentence, propose a filing, write nothing. */
async function draft(body: Record<string, unknown>) {
  const note = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!note) return NextResponse.json({ error: "Tell me what happened first" }, { status: 400 });

  const { projects, categories } = await context();

  let parsed: ParsedSentence = {};
  let readBy: "model" | "fallback" = "model";
  if (isGeminiConfigured()) {
    const raw = await geminiText(note, SYSTEM).catch(() => "");
    parsed = readModelJson(raw);
  }
  // Nothing usable came back — a missing key, a refusal, a bad day.
  if (!parsed.amount && !parsed.projectName) {
    parsed = { ...readWithoutModel(note), ...parsed };
    readBy = "fallback";
  }

  const plan = buildFilingPlan(note, parsed, { projects, categories });
  return NextResponse.json({
    plan: serialise(plan),
    readBy,
    projects: projects.slice(0, 60),
    categories,
    postable: isPostable(plan),
  });
}

function serialise(plan: FilingPlan) {
  return { ...plan, occurredOn: plan.occurredOn ? plan.occurredOn.toISOString() : null };
}

interface CommitLine {
  serviceName?: unknown;
  category?: unknown;
  quantity?: unknown;
  days?: unknown;
  unitPrice?: unknown;
}

/**
 * Step two: write exactly what the founder confirmed.
 *
 * Nothing is re-read from the sentence here. The figures posted are the ones
 * that came back from the screen he approved.
 */
async function commit(body: Record<string, unknown>, userId: string, role: string) {
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  const amount = parseMoney(body.amount as string | number);
  if (amount === null) {
    return NextResponse.json({ error: "How much was it?" }, { status: 400 });
  }
  const direction = body.direction === "RECEIVED" ? "RECEIVED" : "PAID_OUT";

  // Client money has to arrive against an invoice, so the receipt chain and
  // the WHT figures stay true. There is no back door for it here.
  if (direction === "RECEIVED") {
    return NextResponse.json(
      {
        error:
          "Money received from a client is recorded against its invoice, in Documents — that is what keeps the receipt and the withholding figures right. Raise or open the invoice and record the payment there.",
      },
      { status: 400 },
    );
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const newProjectName = typeof body.newProjectName === "string" ? body.newProjectName.trim().slice(0, 200) : "";
  if (!projectId && !newProjectName) {
    return NextResponse.json({ error: "Pick a project, or name a new one" }, { status: 400 });
  }

  const rawLines = Array.isArray(body.lines) ? (body.lines as CommitLine[]).slice(0, 40) : [];
  const lines = rawLines
    .map((l) => ({
      serviceName: String(l.serviceName ?? "").trim().slice(0, 200),
      category: String(l.category ?? "").trim().slice(0, 120) || "Uncategorised",
      quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)),
      days: Math.max(1, Math.trunc(Number(l.days) || 1)),
      // An unpriced line is stored at 0, which this codebase reads as "not
      // costed yet" — see hasAnyPrice in project-figures.ts. It is not a
      // claim that the line was free.
      unitPrice: Math.max(0, Number(parseMoney(l.unitPrice as string | number) ?? 0)),
    }))
    .filter((l) => l.serviceName.length > 0);

  // A split that does not add up to the payment is almost always a typo, and
  // it would leave the cost sheet and the cash disagreeing for good.
  const costed = lines.filter((l) => l.unitPrice > 0);
  if (costed.length > 0) {
    const sheet = lines.reduce((s, l) => s + l.quantity * l.days * l.unitPrice, 0);
    if (costed.length === lines.length && Math.abs(sheet - amount) > 1) {
      return NextResponse.json(
        {
          error: `The cost lines add up to ${formatNaira(sheet)}, but the payment is ${formatNaira(amount)}. Fix one of them, or leave the lines blank and fill them in later.`,
        },
        { status: 400 },
      );
    }
  }

  const occurredOn = typeof body.occurredOn === "string" && body.occurredOn ? new Date(body.occurredOn) : new Date();
  const expenseDate = Number.isFinite(occurredOn.getTime()) ? occurredOn : new Date();

  const result = await db.$transaction(async (tx) => {
    let project = projectId
      ? await tx.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, code: true } })
      : null;
    if (projectId && !project) throw new NotFound("That project no longer exists");

    let createdProject = false;
    if (!project) {
      const year = expenseDate.getFullYear();
      const count = await tx.project.count();
      project = await tx.project.create({
        data: {
          name: newProjectName,
          code: `EVT-${year}-${String(count + 1).padStart(3, "0")}`,
          serviceType: "EVENT_PRODUCTION",
          status: "IN_PROGRESS",
          createdById: userId,
          // A production manager's project waits for the founder; the
          // founder's own does not. Same rule as the projects route.
          approvalStatus: role === "FOUNDER" ? "APPROVED" : "PENDING",
        },
        select: { id: true, name: true, code: true },
      });
      createdProject = true;
    }

    if (lines.length > 0) {
      await tx.projectService.createMany({
        data: lines.map((l) => ({
          projectId: project!.id,
          serviceName: l.serviceName,
          category: l.category,
          quantity: l.quantity,
          days: l.days,
          unitPrice: l.unitPrice,
          totalPrice: l.quantity * l.days * l.unitPrice,
          // Who filed it, so a cost line can be traced back to a person.
          createdBy: userId,
        })),
      });
    }

    const expense = await tx.expense.create({
      data: {
        projectId: project.id,
        category: "VENDOR",
        // His own sentence is the description, so the ledger reads back in
        // his words rather than in a summary of them.
        description: note || `Filed from the assistant: ${formatNaira(amount)}`,
        amount,
        expenseDate,
        // Filed from a sentence, not from a receipt anyone has seen.
        isVerified: false,
      },
    });

    // Keep Project.budget true to its cost sheet. Leaves an existing estimate
    // alone while every line is still unpriced — see project-figures.ts.
    const budget = await syncProjectBudget(tx, project.id);

    return { project, createdProject, expenseId: expense.id, budget, lineCount: lines.length };
  }, { timeout: 30_000 }).catch((e) => {
    if (e instanceof NotFound) return { error: e.message };
    throw e;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({
    ok: true,
    projectId: result.project.id,
    projectName: result.project.name,
    projectCode: result.project.code,
    createdProject: result.createdProject,
    lineCount: result.lineCount,
    amount,
    budget: result.budget,
  });
}

class NotFound extends Error {}
