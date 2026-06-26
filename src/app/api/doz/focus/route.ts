import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Focus & Alignment Score API (DOZ OS — Gap #4)
//
// Measures whether daily tasks are connected to strategic goals
// and surfaces misalignment. Makes focus measurable + visible.
//
// GET -> auth-gated. Returns:
//   { score, rating, breakdown, alignment, weeklyGoalProgress,
//     dailyTaskCompletion, distractionsCount, recommendations }
//
// Focus score (0-100) algorithm:
//   - Alignment score  (40 pts max): alignmentPct * 0.40
//   - Strategic weight (30 pts max): (strategic/totalActive) * 30
//   - Distraction pen  (20 pts max): max(0, 20 - distractions * 5)
//   - Weekly progress  (10 pts max): (weeklyProgress / 100) * 10
// ============================================================

// ---------------------------------------------------------------
// Date helpers (local day boundaries)
// ---------------------------------------------------------------
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function endOfToday(): Date {
  const s = startOfToday();
  return new Date(s.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Wednesday or later in the week counts as "past midweek"
// (week treated Mon → Sun). getDay(): 0=Sun, 1=Mon, ..., 6=Sat.
function isPastMidweek(): boolean {
  const d = new Date().getDay();
  // Wed(3), Thu(4), Fri(5), Sat(6), Sun(0) → past midweek
  return d === 0 || d >= 3;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    // -------------------------------------------------------------
    // Parallel fetch: active tasks + weekly goal
    // -------------------------------------------------------------
    const [activeTasks, weeklyGoal] = await Promise.all([
      db.task.findMany({
        where: { status: { not: "DONE" } },
        select: {
          id: true,
          category: true,
          isDistraction: true,
          goalId: true,
          status: true,
          dueDate: true,
        },
      }),
      db.goal.findFirst({
        where: {
          type: "WEEKLY",
          status: { in: ["ACTIVE", "ON_HOLD"] },
        },
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, progress: true, dueDate: true },
      }),
    ]);

    // Also need today's tasks (any status) for dailyTaskCompletion.
    // activeTasks already excludes DONE, so fetch separately for completion pct.
    const todaysTasks = await db.task.findMany({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      select: { id: true, status: true },
    });

    // -------------------------------------------------------------
    // Breakdown — category counts across all active tasks
    // -------------------------------------------------------------
    let strategicTasks = 0;
    let operationalTasks = 0;
    let adminTasks = 0;
    let distractionTasks = 0;
    let linkedToGoal = 0;

    for (const t of activeTasks) {
      const cat = t.category ?? "";
      if (cat === "STRATEGIC") strategicTasks += 1;
      else if (cat === "OPERATIONAL") operationalTasks += 1;
      else if (cat === "ADMIN") adminTasks += 1;

      // Distraction = explicit DISTRACTION category OR isDistraction flag
      if (cat === "DISTRACTION" || t.isDistraction) distractionTasks += 1;

      if (t.goalId) linkedToGoal += 1;
    }

    const totalActive = activeTasks.length;
    const unlinked = totalActive - linkedToGoal;
    const alignmentPct =
      totalActive > 0 ? Math.round((linkedToGoal / totalActive) * 100) : 0;

    // -------------------------------------------------------------
    // Weekly goal progress
    // -------------------------------------------------------------
    const weeklyGoalProgress = weeklyGoal?.progress ?? 0;

    // -------------------------------------------------------------
    // Daily task completion (today's tasks)
    // -------------------------------------------------------------
    const todayTotal = todaysTasks.length;
    const todayDone = todaysTasks.filter((t) => t.status === "DONE").length;
    const completionPct =
      todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;

    // -------------------------------------------------------------
    // Focus score (0-100)
    // -------------------------------------------------------------
    // Avoid divide-by-zero — empty task list means no measurable focus.
    const safeTotal = Math.max(1, totalActive);

    const alignmentScore = alignmentPct * 0.4; // 0-40
    const strategicScore = (strategicTasks / safeTotal) * 30; // 0-30
    const distractionScore = Math.max(0, 20 - distractionTasks * 5); // 0-20
    const weeklyScore = (weeklyGoalProgress / 100) * 10; // 0-10

    const raw =
      alignmentScore + strategicScore + distractionScore + weeklyScore;
    const score =
      totalActive === 0 ? 0 : Math.round(Math.max(0, Math.min(100, raw)));

    let rating: "ALIGNED" | "MODERATE" | "SCATTERED";
    if (score >= 75) rating = "ALIGNED";
    else if (score >= 50) rating = "MODERATE";
    else rating = "SCATTERED";

    // -------------------------------------------------------------
    // Recommendations (capped at 3, priority-ordered)
    // -------------------------------------------------------------
    const recs: string[] = [];

    if (totalActive === 0) {
      recs.push("No active tasks — plan your day to start measuring focus.");
    }

    if (strategicTasks === 0 && totalActive > 0) {
      recs.push("No strategic tasks today — are you just firefighting?");
    }

    if (distractionTasks > 0) {
      recs.push(
        `⚠ ${distractionTasks} distraction ${
          distractionTasks === 1 ? "task" : "tasks"
        } detected — batch them into a 30-min block`,
      );
    }

    if (unlinked > 3) {
      recs.push(
        `${unlinked} tasks aren't linked to any goal — link them or deprioritize`,
      );
    }

    if (weeklyGoal && weeklyGoalProgress < 50 && isPastMidweek()) {
      recs.push(
        `Weekly objective is only ${weeklyGoalProgress}% complete — accelerate`,
      );
    }

    if (alignmentPct < 50 && totalActive > 0) {
      recs.push("Less than half your tasks connect to strategic goals");
    }

    if (score >= 75) {
      recs.push("You're focused and aligned — keep it up");
    }

    // Cap at 3 recommendations (priority order preserved — first added wins)
    const recommendations = recs.slice(0, 3);

    return NextResponse.json({
      score,
      rating,
      breakdown: {
        strategicTasks,
        operationalTasks,
        adminTasks,
        distractionTasks,
        totalActive,
      },
      alignment: {
        linkedToGoal,
        unlinked,
        alignmentPct,
      },
      weeklyGoalProgress,
      weeklyGoal: weeklyGoal
        ? {
            id: weeklyGoal.id,
            title: weeklyGoal.title,
            progress: weeklyGoal.progress,
            dueDate: weeklyGoal.dueDate?.toISOString() ?? null,
          }
        : null,
      dailyTaskCompletion: {
        done: todayDone,
        total: todayTotal,
        pct: completionPct,
      },
      distractionsCount: distractionTasks,
      recommendations,
    });
  } catch (e) {
    console.error("[GET /api/doz/focus] error", e);
    return NextResponse.json(
      {
        error: "failed_to_compute_focus",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
