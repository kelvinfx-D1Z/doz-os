import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Routines API (DOZ OS — Task C5)
// Business rhythm: daily / weekly / event-day / monthly
// routine templates + their run-through logs.
//
// GET  -> { routines, recentLogs, stats }
// POST -> { action: "start" | "toggle_step" | "complete", ... }
// ============================================================

function parseSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function parseStepsDone(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  // Week starts on Monday
  const day = d.getDay(); // 0 = Sun, 1 = Mon ...
  const diff = (day === 0 ? -6 : 1 - day); // days since Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday;
}

// ---------------------------------------------------------------
// GET — list routines + recent logs + stats
// ---------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const [routines, recentLogs, allCompleted] = await Promise.all([
      db.routine.findMany({
        where: { isActive: true },
        orderBy: [{ frequency: "asc" }, { name: "asc" }],
      }),
      db.routineLog.findMany({
        take: 20,
        orderBy: { startedAt: "desc" },
        include: {
          routine: { select: { name: true, icon: true, color: true } },
          user: { select: { name: true } },
        },
      }),
      // All completed logs — used for streak computation (last 60 days is enough)
      db.routineLog.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
        },
        select: { completedAt: true },
      }),
    ]);

    // ---- routines shaped
    const routinesShaped = routines.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      frequency: r.frequency,
      steps: parseSteps(r.steps),
      icon: r.icon,
      color: r.color,
      isActive: r.isActive,
    }));

    // ---- recentLogs shaped
    const recentLogsShaped = recentLogs.map((log) => {
      const steps = parseSteps(
        // We don't have the routine's steps on the log itself; we need
        // totalSteps from the parent routine. Look it up from routines list.
        routines.find((r) => r.id === log.routineId)?.steps ?? "[]"
      );
      const stepsDone = parseStepsDone(log.stepsDone);
      return {
        id: log.id,
        routineId: log.routineId,
        routineName: log.routine?.name ?? "—",
        routineIcon: log.routine?.icon ?? null,
        routineColor: log.routine?.color ?? null,
        status: log.status,
        stepsDoneCount: stepsDone.length,
        totalSteps: steps.length,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt ? log.completedAt.toISOString() : null,
        userId: log.userId,
        userName: log.user?.name ?? null,
      };
    });

    // ---- stats
    const completedToday = allCompleted.filter(
      (l) => l.completedAt && l.completedAt >= todayStart
    ).length;
    const completedThisWeek = allCompleted.filter(
      (l) => l.completedAt && l.completedAt >= weekStart
    ).length;

    // streakDays: consecutive days (ending today or yesterday) with ≥1 completion
    const dayMap = new Set<string>();
    for (const l of allCompleted) {
      if (!l.completedAt) continue;
      const d = startOfDay(l.completedAt);
      dayMap.add(d.toISOString());
    }

    let streakDays = 0;
    const cursor = startOfDay(now);
    // If nothing done today, streak still counts if it ended yesterday
    let dayProbe = new Date(cursor);
    if (!dayMap.has(dayProbe.toISOString())) {
      // step back one day to see if streak ended yesterday
      dayProbe = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
      if (!dayMap.has(dayProbe.toISOString())) {
        streakDays = 0;
      }
    }
    if (streakDays === 0 && dayMap.has(dayProbe.toISOString())) {
      // Walk back from dayProbe counting consecutive days
      let p = new Date(dayProbe);
      while (dayMap.has(p.toISOString())) {
        streakDays++;
        p = new Date(p.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    return NextResponse.json({
      routines: routinesShaped,
      recentLogs: recentLogsShaped,
      stats: {
        totalRoutines: routinesShaped.length,
        completedToday,
        completedThisWeek,
        streakDays,
      },
    });
  } catch (err: any) {
    console.error("[routines] GET error", err);
    return NextResponse.json(
      { error: "failed_to_load_routines", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST — start | toggle_step | complete
// ---------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action: string | undefined = body?.action;

  function shapeLog(log: any) {
    const routine = log.routine;
    const steps = parseSteps(routine?.steps ?? "[]");
    const stepsDone = parseStepsDone(log.stepsDone);
    return {
      id: log.id,
      routineId: log.routineId,
      status: log.status,
      stepsDone,
      stepsDoneCount: stepsDone.length,
      totalSteps: steps.length,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt ? log.completedAt.toISOString() : null,
      userId: log.userId,
      routine: routine
        ? {
            id: routine.id,
            name: routine.name,
            description: routine.description,
            frequency: routine.frequency,
            steps,
            icon: routine.icon,
            color: routine.color,
          }
        : null,
    };
  }

  // =====================================================
  // start — create a new RoutineLog (IN_PROGRESS)
  // =====================================================
  if (action === "start") {
    const routineId: string | undefined = body?.routineId;
    if (!routineId) {
      return NextResponse.json({ error: "routineId_required" }, { status: 400 });
    }

    try {
      const routine = await db.routine.findUnique({ where: { id: routineId } });
      if (!routine) {
        return NextResponse.json({ error: "routine_not_found" }, { status: 404 });
      }
      if (!routine.isActive) {
        return NextResponse.json({ error: "routine_inactive" }, { status: 400 });
      }

      const log = await db.routineLog.create({
        data: {
          routineId,
          userId: user.id,
          status: "IN_PROGRESS",
          stepsDone: "[]",
        },
        include: { routine: true },
      });

      return NextResponse.json({ log: shapeLog(log) });
    } catch (err: any) {
      console.error("[routines] start error", err);
      return NextResponse.json(
        { error: "start_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // toggle_step — add/remove a step index from stepsDone
  // =====================================================
  if (action === "toggle_step") {
    const logId: string | undefined = body?.logId;
    const stepIndex: number | undefined = body?.stepIndex;

    if (!logId) {
      return NextResponse.json({ error: "logId_required" }, { status: 400 });
    }
    if (typeof stepIndex !== "number" || !Number.isInteger(stepIndex) || stepIndex < 0) {
      return NextResponse.json({ error: "invalid_step_index" }, { status: 400 });
    }

    try {
      const updated = await db.$transaction(async (tx) => {
        const log = await tx.routineLog.findUnique({
          where: { id: logId },
          include: { routine: true },
        });
        if (!log) throw new Error("log_not_found");

        const totalSteps = parseSteps(log.routine?.steps ?? "[]").length;
        const current = parseStepsDone(log.stepsDone);

        let next: number[];
        if (current.includes(stepIndex)) {
          next = current.filter((i) => i !== stepIndex);
        } else {
          next = [...current, stepIndex].sort((a, b) => a - b);
        }

        // If all steps done, auto-complete; if not all done anymore, revert to IN_PROGRESS
        const allDone = totalSteps > 0 && next.length === totalSteps;
        const data: any = { stepsDone: JSON.stringify(next) };
        if (allDone && log.status !== "COMPLETED") {
          data.status = "COMPLETED";
          data.completedAt = new Date();
        } else if (!allDone && log.status === "COMPLETED") {
          data.status = "IN_PROGRESS";
          data.completedAt = null;
        }

        return tx.routineLog.update({
          where: { id: logId },
          data,
          include: { routine: true },
        });
      });

      return NextResponse.json({ log: shapeLog(updated) });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg === "log_not_found") {
        return NextResponse.json({ error: "log_not_found" }, { status: 404 });
      }
      console.error("[routines] toggle_step error", err);
      return NextResponse.json(
        { error: "toggle_step_failed", detail: msg },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // complete — mark the log COMPLETED
  // =====================================================
  if (action === "complete") {
    const logId: string | undefined = body?.logId;
    if (!logId) {
      return NextResponse.json({ error: "logId_required" }, { status: 400 });
    }

    try {
      const updated = await db.routineLog.update({
        where: { id: logId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
        include: { routine: true },
      });

      return NextResponse.json({ log: shapeLog(updated) });
    } catch (err: any) {
      // Prisma throws P2025 if record not found
      if (err?.code === "P2025") {
        return NextResponse.json({ error: "log_not_found" }, { status: 404 });
      }
      console.error("[routines] complete error", err);
      return NextResponse.json(
        { error: "complete_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
