import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Tasks API (DOZ OS — Task C4)
// Daily tasks + weekly intern task assignment.
//
// GET    -> list tasks. Query params:
//           ?assigneeId=xxx                      -> tasks assigned to that user
//           ?scope=my-day                         -> current user's tasks due today/overdue
//           ?scope=week                           -> tasks due this week (Mon–Sun)
//           ?assigneeId=xxx&scope=week            -> both filters combined
//
// POST   -> create a task. creatorId comes from the session.
//           Body: { title, description?, priority?, category?,
//                   assigneeId, dueDate?, goalId?, projectId? }
//
// PATCH  -> toggle task status. Body: { taskId, action: "toggle"|"complete"|"reopen" }
//           - toggle: flip between DONE/TODO
//           - complete: force DONE
//           - reopen: force TODO
// ============================================================

// ---------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function endOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
}
function startOfWeek(): Date {
  // Week = Monday → Sunday
  const n = new Date();
  const day = n.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift back to Monday
  const monday = new Date(n.getFullYear(), n.getMonth(), n.getDate() + diff);
  return monday;
}
function endOfWeek(): Date {
  const monday = startOfWeek();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

// ---------------------------------------------------------------
// Shared task-shaper — keeps include shape consistent across handlers
// ---------------------------------------------------------------
const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, role: true, title: true } },
  creator: { select: { id: true, name: true } },
  goal: { select: { id: true, title: true } },
  project: { select: { id: true, name: true } },
} as const;

function shapeTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    isDistraction: t.isDistraction,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt ? t.createdAt.toISOString() : null,
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, role: t.assignee.role }
      : null,
    creator: t.creator ? { id: t.creator.id, name: t.creator.name } : null,
    goal: t.goal ? { id: t.goal.id, title: t.goal.title } : null,
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
  };
}

// ---------------------------------------------------------------
// GET
// ---------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assigneeId = url.searchParams.get("assigneeId");
    const scope = url.searchParams.get("scope"); // "my-day" | "week"

    // For "my-day" we need the current user
    let filterAssigneeId = assigneeId;
    if (scope === "my-day") {
      const user = await getSessionUser();
      if (!user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      filterAssigneeId = user.id;
    }

    const where: any = {};
    if (filterAssigneeId) where.assigneeId = filterAssigneeId;

    if (scope === "my-day") {
      // Tasks due today or overdue (not done)
      const dayEnd = endOfToday();
      where.status = { not: "DONE" };
      where.dueDate = { lte: dayEnd };
    } else if (scope === "week") {
      // Tasks due this week (Mon–Sun) — include null dueDate as well? No, must be in the week.
      const wkStart = startOfWeek();
      const wkEnd = endOfWeek();
      where.dueDate = { gte: wkStart, lte: wkEnd };
    }

    const tasks = await db.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [
        { status: "asc" }, // DONE last
        { priority: "asc" },
        { dueDate: "asc" },
      ],
    });

    return NextResponse.json({ tasks: tasks.map(shapeTask) });
  } catch (e) {
    console.error("[GET /api/doz/tasks] error", e);
    return NextResponse.json(
      { error: "failed_to_load_tasks", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------
// POST — create task
// ---------------------------------------------------------------
export async function POST(req: Request) {
  try {
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

    const { title, description, priority, category, assigneeId, dueDate, goalId, projectId } =
      body ?? {};

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "missing_title" }, { status: 400 });
    }
    if (!assigneeId || typeof assigneeId !== "string") {
      return NextResponse.json({ error: "missing_assigneeId" }, { status: 400 });
    }

    // Validate priority (if provided)
    const validPriorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];
    const finalPriority =
      priority && validPriorities.includes(priority) ? priority : "MEDIUM";

    // Parse dueDate if provided
    let dueDateParsed: Date | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (!isNaN(d.getTime())) dueDateParsed = d;
    }

    const created = await db.task.create({
      data: {
        title: title.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        priority: finalPriority,
        category: typeof category === "string" ? category : null,
        assigneeId,
        creatorId: user.id,
        goalId: typeof goalId === "string" && goalId ? goalId : null,
        projectId: typeof projectId === "string" && projectId ? projectId : null,
        dueDate: dueDateParsed,
        status: "TODO",
        isDistraction: false,
      },
      include: TASK_INCLUDE,
    });

    // Log activity for the founder/staff feed
    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "CREATED_TASK",
          detail: `Assigned "${title.trim()}"${created.assignee ? ` to ${created.assignee.name}` : ""}`,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ task: shapeTask(created) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/doz/tasks] error", e);
    return NextResponse.json(
      { error: "failed_to_create_task", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------
// PATCH — toggle task status
// ---------------------------------------------------------------
export async function PATCH(req: Request) {
  try {
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

    const { taskId, action } = body ?? {};
    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json({ error: "missing_taskId" }, { status: 400 });
    }
    if (!["toggle", "complete", "reopen"].includes(action)) {
      return NextResponse.json(
        { error: "invalid_action", detail: "action must be toggle|complete|reopen" },
        { status: 400 },
      );
    }

    const existing = await db.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    if (!existing) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }

    const isDone = existing.status === "DONE";
    let nextStatus: string;
    let nextCompletedAt: Date | null;

    if (action === "complete") {
      nextStatus = "DONE";
      nextCompletedAt = new Date();
    } else if (action === "reopen") {
      nextStatus = "TODO";
      nextCompletedAt = null;
    } else {
      // toggle
      nextStatus = isDone ? "TODO" : "DONE";
      nextCompletedAt = isDone ? null : new Date();
    }

    const updated = await db.task.update({
      where: { id: taskId },
      data: { status: nextStatus, completedAt: nextCompletedAt },
      include: TASK_INCLUDE,
    });

    // Log activity
    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: nextStatus === "DONE" ? "COMPLETED_TASK" : "REOPENED_TASK",
          detail: `"${updated.title}"`,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ task: shapeTask(updated) });
  } catch (e) {
    console.error("[PATCH /api/doz/tasks] error", e);
    return NextResponse.json(
      { error: "failed_to_update_task", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
