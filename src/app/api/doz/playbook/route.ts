import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  isBlockId,
  weekInOrder,
  PRIORITIES,
  THE_ONE_RULE,
  REDEFINITIONS,
  MONTHLY_TARGETS,
  NOT_NOW,
  REVIEW_QUESTIONS,
  SUNDAY_GUARD,
  PRIORITY_LABELS,
  PRIORITY_TONES,
} from "@/lib/founder-playbook";

// The founder's weekly operating system — the playbook itself, his
// completions, and his Sunday review.
//
// The CONTENT is served from here and nowhere else. It used to be imported
// straight into client components, which put the whole text in the
// JavaScript bundle every signed-in user downloads: the page and this API
// were founder-only, but an intern could read the founder's week in
// devtools without ever being shown it. Served from behind the gate below,
// it never leaves the server for anyone else.
//
// FOUNDER ONLY, on every verb. This is not a company module: it names his
// Master's, ResearchBrainie and Fiestivo, and the Sunday review is him
// writing honestly about his own week. A staff member reading it would be
// reading a diary. Nothing here is scoped by a query parameter either —
// every row is keyed to the session user's own id, so there is no
// assigneeId-shaped hole to widen later.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function founderOnly() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "FOUNDER") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

/**
 * GET ?week=YYYY-MM-DD
 *
 * The seven day-keys of that week are passed in by the client rather than
 * derived here: the week belongs to whichever timezone the founder is
 * actually standing in, and a server in UTC would hand him the wrong
 * Monday for half the day.
 */
export async function GET(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const content = {
    week: weekInOrder(),
    priorities: PRIORITIES,
    rule: THE_ONE_RULE,
    redefinitions: REDEFINITIONS,
    monthlyTargets: MONTHLY_TARGETS,
    notNow: NOT_NOW,
    reviewQuestions: REVIEW_QUESTIONS,
    sundayGuard: SUNDAY_GUARD,
    labels: PRIORITY_LABELS,
    tones: PRIORITY_TONES,
  };

  // No week asked for: the content alone. The dashboard card needs today's
  // line, not his ticks or his Sunday answers.
  const week = url.searchParams.get("week");
  if (week === null) return NextResponse.json({ content });

  const days = (url.searchParams.get("days") ?? "").split(",").filter((d) => DAY_RE.test(d));
  if (!DAY_RE.test(week)) {
    return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
  }

  const [blocks, review] = await Promise.all([
    days.length > 0
      ? db.playbookBlockLog.findMany({
          where: { userId: gate.user.id, day: { in: days } },
          select: { day: true, blockId: true },
        })
      : Promise.resolve([]),
    db.playbookReview.findUnique({
      where: { userId_weekStart: { userId: gate.user.id, weekStart: week } },
    }),
  ]);

  // Recent reviews, so Sunday can be read against the Sundays before it —
  // a weekly review nobody can look back at is a diary entry, not a system.
  const history = await db.playbookReview.findMany({
    where: { userId: gate.user.id, weekStart: { not: week } },
    orderBy: { weekStart: "desc" },
    take: 8,
  });

  return NextResponse.json({
    content,
    done: blocks.map((b) => `${b.day}|${b.blockId}`),
    review: review
      ? { weekStart: review.weekStart, answers: safeJson(review.answers), nextWeek: review.nextWeek }
      : null,
    history: history.map((r) => ({
      weekStart: r.weekStart,
      answers: safeJson(r.answers),
      nextWeek: r.nextWeek,
    })),
  });
}

/** Stored answers are JSON in a text column; a bad row must not 500 the page. */
function safeJson(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * POST { day, blockId, done }
 *
 * Tick or untick one block on one day. Idempotent in both directions:
 * ticking twice is one row, unticking something never ticked is fine.
 */
export async function POST(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { day, blockId, done } = body as { day?: string; blockId?: string; done?: boolean };
  if (!day || !DAY_RE.test(day)) {
    return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }
  // Checked against the playbook, not merely for being a string. A typo'd
  // or renamed id would store a completion against a block that does not
  // exist, and it would never show as done anywhere.
  if (!isBlockId(blockId)) {
    return NextResponse.json({ error: "Unknown block" }, { status: 400 });
  }

  const where = { userId_day_blockId: { userId: gate.user.id, day, blockId } };
  if (done === false) {
    await db.playbookBlockLog.deleteMany({ where: { userId: gate.user.id, day, blockId } });
    return NextResponse.json({ ok: true, done: false });
  }
  await db.playbookBlockLog.upsert({
    where,
    update: {},
    create: { userId: gate.user.id, day, blockId },
  });
  return NextResponse.json({ ok: true, done: true });
}

/**
 * PUT { weekStart, answers, nextWeek }
 *
 * Save Sunday's review. Answers are merged rather than replaced, so
 * answering one question does not blank the other three.
 */
export async function PUT(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { weekStart, answers, nextWeek } = body as {
    weekStart?: string;
    answers?: Record<string, unknown>;
    nextWeek?: string | null;
  };
  if (!weekStart || !DAY_RE.test(weekStart)) {
    return NextResponse.json({ error: "weekStart must be YYYY-MM-DD" }, { status: 400 });
  }

  // Only the four keys the playbook asks about, and only as text. Anything
  // else in the body is dropped rather than stored.
  const allowed = new Set(REVIEW_QUESTIONS.map((q) => q.key));
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (allowed.has(k) && typeof v === "string") clean[k] = v.slice(0, 4000);
  }

  const existing = await db.playbookReview.findUnique({
    where: { userId_weekStart: { userId: gate.user.id, weekStart } },
  });
  const merged = { ...safeJson(existing?.answers ?? "{}"), ...clean };
  const nextWeekValue =
    typeof nextWeek === "string" ? nextWeek.slice(0, 4000).trim() || null : (existing?.nextWeek ?? null);

  const saved = await db.playbookReview.upsert({
    where: { userId_weekStart: { userId: gate.user.id, weekStart } },
    update: { answers: JSON.stringify(merged), nextWeek: nextWeekValue },
    create: {
      userId: gate.user.id,
      weekStart,
      answers: JSON.stringify(merged),
      nextWeek: nextWeekValue,
    },
  });

  return NextResponse.json({
    ok: true,
    review: { weekStart: saved.weekStart, answers: merged, nextWeek: saved.nextWeek },
  });
}
