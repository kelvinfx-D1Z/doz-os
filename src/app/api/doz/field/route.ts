import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Field Mode API (DOZ OS — Phase 4, Task P4-A)
// Mobile-first on-site experience: quick daily report filing
// + offline-capable event day run-sheet.
//
// GET  -> current user's context (tasks, projects they're crew/manager
//         on, today's report, crew assignments)
// POST -> { action: "submit_report" | "toggle_milestone", ... }
// ============================================================

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// ---------------------------------------------------------------
// GET — current user's field-mode context
// ---------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = startOfToday();

  try {
    // Single parallel batch:
    //  - tasks assigned to this user (not DONE) with project name
    //  - crew assignments for this user (with project + milestones)
    //  - projects where this user is the manager (with milestones)
    //  - today's report for this user
    const [tasks, crewAssignments, managedProjects, todaysReport] = await Promise.all([
      db.task.findMany({
        where: {
          assigneeId: user.id,
          status: { not: "DONE" },
        },
        include: {
          project: { select: { name: true } },
        },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      }),
      db.crewAssignment.findMany({
        where: { userId: user.id },
        include: {
          project: {
            include: {
              milestones: { orderBy: { dueDate: "asc" } },
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      db.project.findMany({
        where: { managerId: user.id },
        include: {
          milestones: { orderBy: { dueDate: "asc" } },
        },
        orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
      }),
      db.dailyReport.findFirst({
        where: { userId: user.id, reportDate: today },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // ---- myTasks: shaped
    const myTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      project: t.project ? { name: t.project.name } : null,
    }));

    // ---- myProjects: merge projects where user is crew OR manager
    // Use a Map to dedupe (a user can be both manager and crew on same project).
    type ShapedProject = {
      id: string;
      name: string;
      code: string | null;
      eventDate: string | null;
      venue: string | null;
      serviceType: string;
      status: string;
      role: string; // crew role or "MANAGER"
      milestones: {
        id: string;
        title: string;
        dueDate: string;
        status: string;
        completedAt: string | null;
      }[];
    };

    const projectMap = new Map<string, ShapedProject>();

    for (const ca of crewAssignments) {
      const p = ca.project;
      if (!p) continue;
      // Only show "active" projects: PLANNING, CONFIRMED, IN_PROGRESS, ON_HOLD
      if (!["PLANNING", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(p.status)) continue;
      projectMap.set(p.id, {
        id: p.id,
        name: p.name,
        code: p.code,
        eventDate: p.eventDate ? p.eventDate.toISOString() : null,
        venue: p.venue,
        serviceType: p.serviceType,
        status: p.status,
        role: ca.role,
        milestones: p.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          dueDate: m.dueDate.toISOString(),
          status: m.status,
          completedAt: m.completedAt ? m.completedAt.toISOString() : null,
        })),
      });
    }

    for (const p of managedProjects) {
      if (!["PLANNING", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(p.status)) continue;
      // If already in map (user is also crew), keep the crew role but ensure presence.
      if (!projectMap.has(p.id)) {
        projectMap.set(p.id, {
          id: p.id,
          name: p.name,
          code: p.code,
          eventDate: p.eventDate ? p.eventDate.toISOString() : null,
          venue: p.venue,
          serviceType: p.serviceType,
          status: p.status,
          role: "MANAGER",
          milestones: p.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            dueDate: m.dueDate.toISOString(),
            status: m.status,
            completedAt: m.completedAt ? m.completedAt.toISOString() : null,
          })),
        });
      }
    }

    // Sort: upcoming event date first, then by name
    const myProjects = Array.from(projectMap.values()).sort((a, b) => {
      const da = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const db = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name);
    });

    // ---- crewAssignments: shaped (for display in field mode)
    const crewAssignmentsShaped = crewAssignments.map((ca) => ({
      id: ca.id,
      projectName: ca.project?.name ?? "—",
      role: ca.role,
      status: ca.status,
      dayRate: ca.dayRate,
    }));

    // ---- todayReport: shaped
    const todayReport = todaysReport
      ? {
          id: todaysReport.id,
          tasksDone: todaysReport.tasksDone,
          tasksPlanned: todaysReport.tasksPlanned,
          blockers: todaysReport.blockers,
          hoursWorked: todaysReport.hoursWorked,
          mood: todaysReport.mood,
          reportDate: todaysReport.reportDate.toISOString(),
        }
      : null;

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        title: user.title ?? null,
      },
      myTasks,
      myProjects,
      todayReport,
      crewAssignments: crewAssignmentsShaped,
    });
  } catch (err: any) {
    console.error("[field] GET error", err);
    return NextResponse.json(
      { error: "failed_to_load_field_context", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST — submit_report | toggle_milestone
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

  // =====================================================
  // submit_report
  // =====================================================
  if (action === "submit_report") {
    const tasksDone: string | undefined = body?.tasksDone;
    const tasksPlanned: string | undefined = body?.tasksPlanned;
    const blockers: string | undefined = body?.blockers;
    const hoursWorked: number = Number(body?.hoursWorked ?? 0);
    const mood: string | undefined = body?.mood;

    if (!tasksDone || typeof tasksDone !== "string" || tasksDone.trim().length === 0) {
      return NextResponse.json({ error: "tasks_done_required" }, { status: 400 });
    }
    if (mood && !["GREAT", "OK", "STRESSED"].includes(mood)) {
      return NextResponse.json({ error: "invalid_mood" }, { status: 400 });
    }

    const today = startOfToday();

    try {
      // Use a transaction: look up existing report for today, then update or create.
      const report = await db.$transaction(async (tx) => {
        const existing = await tx.dailyReport.findFirst({
          where: { userId: user.id, reportDate: today },
          orderBy: { createdAt: "desc" },
        });

        if (existing) {
          return tx.dailyReport.update({
            where: { id: existing.id },
            data: {
              tasksDone: tasksDone.trim(),
              tasksPlanned: tasksPlanned?.trim() || null,
              blockers: blockers?.trim() || null,
              hoursWorked: isNaN(hoursWorked) ? 0 : hoursWorked,
              mood: mood ?? null,
            },
          });
        }

        return tx.dailyReport.create({
          data: {
            userId: user.id,
            reportDate: today,
            tasksDone: tasksDone.trim(),
            tasksPlanned: tasksPlanned?.trim() || null,
            blockers: blockers?.trim() || null,
            hoursWorked: isNaN(hoursWorked) ? 0 : hoursWorked,
            mood: mood ?? null,
          },
        });
      });

      return NextResponse.json({
        ok: true,
        report: {
          id: report.id,
          tasksDone: report.tasksDone,
          tasksPlanned: report.tasksPlanned,
          blockers: report.blockers,
          hoursWorked: report.hoursWorked,
          mood: report.mood,
          reportDate: report.reportDate.toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[field] submit_report error", err);
      return NextResponse.json(
        { error: "submit_report_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // toggle_milestone
  // =====================================================
  if (action === "toggle_milestone") {
    const milestoneId: string | undefined = body?.milestoneId;
    const done: boolean | undefined = body?.done;

    if (!milestoneId || typeof done !== "boolean") {
      return NextResponse.json({ error: "milestoneId_and_done_required" }, { status: 400 });
    }

    try {
      const updated = await db.$transaction(async (tx) => {
        const milestone = await tx.milestone.findUnique({
          where: { id: milestoneId },
        });
        if (!milestone) {
          throw new Error("milestone_not_found");
        }

        // Anyone crew on the project can toggle — but verify the user IS crew or manager.
        const crew = await tx.crewAssignment.findFirst({
          where: { projectId: milestone.projectId, userId: user.id },
        });
        const project = await tx.project.findUnique({
          where: { id: milestone.projectId },
          select: { managerId: true },
        });
        const isManager = project?.managerId === user.id;

        if (!crew && !isManager) {
          throw new Error("not_authorized_for_milestone");
        }

        const newStatus = done ? "DONE" : "PENDING";
        return tx.milestone.update({
          where: { id: milestoneId },
          data: {
            status: newStatus,
            completedAt: done ? new Date() : null,
          },
        });
      });

      return NextResponse.json({
        ok: true,
        milestone: {
          id: updated.id,
          title: updated.title,
          dueDate: updated.dueDate.toISOString(),
          status: updated.status,
          completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
        },
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg === "milestone_not_found") {
        return NextResponse.json({ error: "milestone_not_found" }, { status: 404 });
      }
      if (msg === "not_authorized_for_milestone") {
        return NextResponse.json({ error: "not_authorized_for_milestone" }, { status: 403 });
      }
      console.error("[field] toggle_milestone error", err);
      return NextResponse.json(
        { error: "toggle_milestone_failed", detail: msg },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
