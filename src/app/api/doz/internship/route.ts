import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

// ============================================================
// NJFP Internship Programme API
//
// Tracks the 12-month intern development plan.
//
// Start date: July 6, 2025.
//   - Before the start date, GET returns currentMonth: 0 and a
//     `programStartsAt` ISO string so the UI can show "Program
//     starts July 6" instead of "Month 1".
//
// GET  -> { currentMonth, programStartsAt, tracks, roadmap, recentStandups, interns }
// POST -> actions:
//   - update_milestone
//   - submit_standup
//   - add_intern          (FOUNDER only) — creates a User w/ role=INTERN + password
//   - add_milestone       (FOUNDER only)
//   - edit_milestone      (FOUNDER only)
//   - delete_milestone    (FOUNDER only)
// ============================================================

const PROGRAM_START = new Date(2025, 6, 6); // July 6, 2025

function pickInternForTrack(
  interns: { id: string; name: string; title: string | null }[],
  track: "OPERATIONS_GROWTH" | "CONTENT_BRAND"
) {
  // Match by title first — "Operations" vs "Content"/"Brand".
  // Falls back to legacy index ordering (interns[0] for ops, [1] for content).
  const keyword = track === "OPERATIONS_GROWTH" ? "operation" : "content";
  const byTitle = interns.find((i) =>
    (i.title ?? "").toLowerCase().includes(keyword)
  );
  if (byTitle) return { id: byTitle.id, name: byTitle.name, title: byTitle.title };
  if (track === "OPERATIONS_GROWTH" && interns[0]) {
    return { id: interns[0].id, name: interns[0].name, title: interns[0].title };
  }
  if (track === "CONTENT_BRAND" && interns[1]) {
    return { id: interns[1].id, name: interns[1].name, title: interns[1].title };
  }
  return null;
}

// ---------------------------------------------------------------
// GET — full internship programme payload
// ---------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Interns only see their own standups; founders/staff see all.
  const isIntern = user.role === "INTERN";
  const standupWhere = isIntern ? { userId: user.id } : undefined;

  const [milestones, interns, standups] = await Promise.all([
    db.internshipMilestone.findMany({
      orderBy: [{ track: "asc" }, { monthStart: "asc" }, { createdAt: "asc" }],
    }),
    db.user.findMany({
      where: { role: "INTERN", isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    db.dailyStandup.findMany({ where: standupWhere, orderBy: { date: "desc" }, take: 14 }),
  ]);

  // Group milestones by track
  const opsMilestones = milestones.filter((m) => m.track === "OPERATIONS_GROWTH");
  const contentMilestones = milestones.filter((m) => m.track === "CONTENT_BRAND");

  // Compute progress per track
  const computeProgress = (ms: typeof milestones) => {
    const total = ms.length;
    const completed = ms.filter((m) => m.status === "COMPLETED").length;
    const inProgress = ms.filter((m) => m.status === "IN_PROGRESS").length;
    return {
      total,
      completed,
      inProgress,
      pct: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  // Determine current month relative to program start (July 6, 2025)
  const now = new Date();
  const hasStarted = now.getTime() >= PROGRAM_START.getTime();
  let currentMonth = 0;
  if (hasStarted) {
    const monthsElapsed =
      (now.getFullYear() - PROGRAM_START.getFullYear()) * 12 +
      (now.getMonth() - PROGRAM_START.getMonth()) +
      1;
    currentMonth = Math.max(1, Math.min(12, monthsElapsed));
  }

  // Group milestones by month for the roadmap
  const roadmap: Record<number, { ops: typeof milestones; content: typeof milestones }> = {};
  for (let m = 1; m <= 12; m++) {
    roadmap[m] = {
      ops: opsMilestones.filter((mi) => mi.monthStart <= m && mi.monthEnd >= m),
      content: contentMilestones.filter((mi) => mi.monthStart <= m && mi.monthEnd >= m),
    };
  }

  return NextResponse.json({
    currentMonth,
    programStartsAt: PROGRAM_START.toISOString(),
    hasStarted,
    tracks: {
      OPERATIONS_GROWTH: {
        name: "Operations & Growth Coordinator",
        intern: pickInternForTrack(interns, "OPERATIONS_GROWTH"),
        milestones: opsMilestones,
        progress: computeProgress(opsMilestones),
        graduationRole: "Junior Operations Manager",
      },
      CONTENT_BRAND: {
        name: "Content & Brand Coordinator",
        intern: pickInternForTrack(interns, "CONTENT_BRAND"),
        milestones: contentMilestones,
        progress: computeProgress(contentMilestones),
        graduationRole: "Brand & Marketing Associate",
      },
    },
    interns: interns.map((i) => ({ id: i.id, name: i.name, title: i.title, email: i.email })),
    roadmap,
    recentStandups: standups.map((s) => ({
      id: s.id,
      userId: s.userId,
      date: s.date,
      yesterday: s.yesterday,
      today: s.today,
      blockers: s.blockers,
    })),
  });
}

// ---------------------------------------------------------------
// POST — write actions
// ---------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const isFounder = user.role === "FOUNDER";

  // ---------- update_milestone (FOUNDER + STAFF + INTERN) ----------
  if (body.action === "update_milestone") {
    if (!body.milestoneId) return NextResponse.json({ error: "milestoneId required" }, { status: 400 });
    const data: any = { status: body.status };
    if (body.status === "COMPLETED") data.completedAt = new Date();
    if (body.status === "NOT_STARTED" || body.status === "IN_PROGRESS") data.completedAt = null;
    const updated = await db.internshipMilestone.update({
      where: { id: body.milestoneId },
      data,
    });
    return NextResponse.json({ ok: true, milestone: updated });
  }

  // ---------- submit_standup ----------
  if (body.action === "submit_standup") {
    if (!body.yesterday || !body.today)
      return NextResponse.json({ error: "yesterday and today required" }, { status: 400 });
    const created = await db.dailyStandup.create({
      data: {
        userId: user.id,
        date: new Date(),
        yesterday: body.yesterday,
        today: body.today,
        blockers: body.blockers || null,
      },
    });
    return NextResponse.json({ ok: true, standup: created }, { status: 201 });
  }

  // ---------- add_intern (FOUNDER only) ----------
  if (body.action === "add_intern") {
    if (!isFounder)
      return NextResponse.json({ error: "forbidden — FOUNDER only" }, { status: 403 });

    const name: string | undefined = (body.name ?? "").toString().trim();
    const email: string | undefined = (body.email ?? "").toString().trim().toLowerCase();
    const track: string | undefined = body.track;
    const graduationRole: string | undefined = (body.graduationRole ?? "").toString().trim();
    const password: string | undefined = (body.password ?? "").toString();

    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!track || !["OPERATIONS_GROWTH", "CONTENT_BRAND"].includes(track))
      return NextResponse.json({ error: "track must be OPERATIONS_GROWTH or CONTENT_BRAND" }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });

    const title =
      track === "OPERATIONS_GROWTH"
        ? "Operations & Growth Coordinator"
        : "Content & Brand Coordinator";

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "email_taken" }, { status: 400 });

    const created = await db.user.create({
      data: {
        name,
        email,
        role: "INTERN",
        title,
        password: hashPassword(password),
        capacity: 40,
        isActive: true,
      },
    });
    return NextResponse.json(
      { ok: true, intern: { id: created.id, name: created.name, title: created.title, email: created.email } },
      { status: 201 }
    );
  }

  // ---------- add_milestone (FOUNDER only) ----------
  if (body.action === "add_milestone") {
    if (!isFounder)
      return NextResponse.json({ error: "forbidden — FOUNDER only" }, { status: 403 });

    const track: string | undefined = body.track;
    const title: string | undefined = (body.title ?? "").toString().trim();
    const phase: string = (body.phase ?? "").toString().trim() || "General";
    const description: string | undefined = (body.description ?? "").toString().trim();
    const monthStart: number = Number(body.monthStart);
    const monthEnd: number = Number(body.monthEnd) || monthStart;
    const deliverable: string | undefined = body.deliverable ? String(body.deliverable).trim() : undefined;
    const kpi: string | undefined = body.kpi ? String(body.kpi).trim() : undefined;
    const assigneeId: string | undefined = body.assigneeId || undefined;

    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (!track || !["OPERATIONS_GROWTH", "CONTENT_BRAND"].includes(track))
      return NextResponse.json({ error: "track must be OPERATIONS_GROWTH or CONTENT_BRAND" }, { status: 400 });
    if (!monthStart || monthStart < 1 || monthStart > 12)
      return NextResponse.json({ error: "monthStart must be 1-12" }, { status: 400 });
    if (monthEnd < 1 || monthEnd > 12 || monthEnd < monthStart)
      return NextResponse.json({ error: "monthEnd must be 1-12 and ≥ monthStart" }, { status: 400 });

    const created = await db.internshipMilestone.create({
      data: {
        track,
        title,
        phase,
        description: description || "",
        monthStart,
        monthEnd,
        deliverable,
        kpi,
        assigneeId,
        status: "NOT_STARTED",
      },
    });
    return NextResponse.json({ ok: true, milestone: created }, { status: 201 });
  }

  // ---------- edit_milestone (FOUNDER only) ----------
  if (body.action === "edit_milestone") {
    if (!isFounder)
      return NextResponse.json({ error: "forbidden — FOUNDER only" }, { status: 403 });
    if (!body.milestoneId) return NextResponse.json({ error: "milestoneId required" }, { status: 400 });

    const data: any = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.phase === "string" && body.phase.trim()) data.phase = body.phase.trim();
    if (typeof body.description === "string") data.description = body.description;
    if (body.monthStart != null) {
      const ms = Number(body.monthStart);
      if (ms >= 1 && ms <= 12) data.monthStart = ms;
    }
    if (body.monthEnd != null) {
      const me = Number(body.monthEnd);
      if (me >= 1 && me <= 12) data.monthEnd = me;
    }
    if (typeof body.deliverable === "string") data.deliverable = body.deliverable.trim() || null;
    if (typeof body.kpi === "string") data.kpi = body.kpi.trim() || null;
    if (typeof body.assigneeId === "string") data.assigneeId = body.assigneeId || null;
    if (body.track && ["OPERATIONS_GROWTH", "CONTENT_BRAND"].includes(body.track))
      data.track = body.track;

    const updated = await db.internshipMilestone.update({
      where: { id: body.milestoneId },
      data,
    });
    return NextResponse.json({ ok: true, milestone: updated });
  }

  // ---------- delete_milestone (FOUNDER only) ----------
  if (body.action === "delete_milestone") {
    if (!isFounder)
      return NextResponse.json({ error: "forbidden — FOUNDER only" }, { status: 403 });
    if (!body.milestoneId) return NextResponse.json({ error: "milestoneId required" }, { status: 400 });
    await db.internshipMilestone.delete({ where: { id: body.milestoneId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
