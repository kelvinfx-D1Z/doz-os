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
// PATCH has TWO modes:
//   1) Status toggle (legacy):
//        Body: { taskId, action: "toggle"|"complete"|"reopen" }
//   2) Field update (new):
//        Body: { taskId, fields: { title?, description?, priority?, category?,
//                                  assigneeId?, dueDate?, goalId?, projectId?,
//                                  isDistraction? } }
//      - dueDate may be null (clears), a Date string, or special "tomorrow"|"today"|"next-week".
//      - goalId/projectId/assigneeId may be null to clear.
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

// Parse a date input that may be: an ISO string, null/undefined (clear),
// or one of the words "today" | "tomorrow" | "next-week" | "end-of-week".
function parseDueDate(input: unknown): Date | null | undefined {
  if (input === undefined) return undefined; // no change
  if (input === null) return null; // clear
  if (typeof input === "string") {
    const lower = input.trim().toLowerCase();
    if (lower === "" || lower === "null" || lower === "clear") return null;
    if (lower === "today") return endOfToday();
    if (lower === "tomorrow") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(17, 0, 0, 0);
      return t;
    }
    if (lower === "next-week" || lower === "end-of-week") return endOfWeek();
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
    return undefined; // unrecognized string -> ignore
  }
  if (typeof input === "number" || (input as any) instanceof Date) {
    const d = new Date(input as any);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
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

    // Parse dueDate if provided — accepts YYYY-MM-DD, ISO, and the words
    // "today" / "tomorrow" / "next-week" / "end-of-week".
    let dueDateParsed: Date | null = null;
    if (dueDate !== undefined && dueDate !== null && dueDate !== "") {
      const parsed = parseDueDate(dueDate);
      if (parsed !== undefined) dueDateParsed = parsed;
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
// PATCH — toggle task status OR update task fields
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

    const { taskId } = body ?? {};
    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json({ error: "missing_taskId" }, { status: 400 });
    }

    const existing = await db.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    if (!existing) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }

    // ============================================================
    // MODE 2 — field update
    // ============================================================
    if (body.fields && typeof body.fields === "object") {
      const f = body.fields;
      const data: any = {};

      if (typeof f.title === "string") {
        if (f.title.trim().length === 0) {
          return NextResponse.json({ error: "title_cannot_be_empty" }, { status: 400 });
        }
        data.title = f.title.trim();
      }
      if (f.description !== undefined) {
        data.description =
          typeof f.description === "string" && f.description.trim().length > 0
            ? f.description.trim()
            : null;
      }
      if (typeof f.priority === "string") {
        const validPriorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];
        if (!validPriorities.includes(f.priority)) {
          return NextResponse.json(
            { error: "invalid_priority", detail: `must be one of ${validPriorities.join("|")}` },
            { status: 400 }
          );
        }
        data.priority = f.priority;
      }
      if (f.category !== undefined) {
        const validCategories = ["STRATEGIC", "OPERATIONAL", "ADMIN", "DISTRACTION"];
        if (f.category === null || f.category === "") {
          data.category = null;
        } else if (typeof f.category === "string" && validCategories.includes(f.category)) {
          data.category = f.category;
        } else {
          return NextResponse.json(
            { error: "invalid_category", detail: `must be one of ${validCategories.join("|")} or null` },
            { status: 400 }
          );
        }
      }
      if (f.assigneeId !== undefined) {
        if (f.assigneeId === null || f.assigneeId === "") {
          data.assigneeId = null;
        } else if (typeof f.assigneeId === "string") {
          // Verify the user exists
          const u = await db.user.findUnique({ where: { id: f.assigneeId }, select: { id: true } });
          if (!u) {
            return NextResponse.json({ error: "assignee_not_found" }, { status: 400 });
          }
          data.assigneeId = f.assigneeId;
        }
      }
      if (f.goalId !== undefined) {
        if (f.goalId === null || f.goalId === "") {
          data.goalId = null;
        } else if (typeof f.goalId === "string") {
          const g = await db.goal.findUnique({ where: { id: f.goalId }, select: { id: true } });
          if (!g) {
            return NextResponse.json({ error: "goal_not_found" }, { status: 400 });
          }
          data.goalId = f.goalId;
        }
      }
      if (f.projectId !== undefined) {
        if (f.projectId === null || f.projectId === "") {
          data.projectId = null;
        } else if (typeof f.projectId === "string") {
          const p = await db.project.findUnique({ where: { id: f.projectId }, select: { id: true } });
          if (!p) {
            return NextResponse.json({ error: "project_not_found" }, { status: 400 });
          }
          data.projectId = f.projectId;
        }
      }
      if (f.dueDate !== undefined) {
        const parsed = parseDueDate(f.dueDate);
        if (parsed !== undefined) data.dueDate = parsed;
      }
      if (typeof f.isDistraction === "boolean") {
        data.isDistraction = f.isDistraction;
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { error: "no_fields_to_update", detail: "fields object was empty or contained only unknown keys" },
          { status: 400 }
        );
      }

      const updated = await db.task.update({
        where: { id: taskId },
        data,
        include: TASK_INCLUDE,
      });

      try {
        await db.activityLog.create({
          data: {
            userId: user.id,
            action: "UPDATED_TASK",
            detail: `Edited "${updated.title}" (${Object.keys(data).join(", ")})`,
          },
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({ task: shapeTask(updated) });
    }

    // ============================================================
    // MODE 1 — status toggle (legacy)
    // ============================================================
    const { action } = body ?? {};
    if (!["toggle", "complete", "reopen"].includes(action)) {
      return NextResponse.json(
        { error: "invalid_action", detail: "provide {action: toggle|complete|reopen} OR {fields: {...}}" },
        { status: 400 },
      );
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

// ---------------------------------------------------------------
// DELETE — remove a task
// Body: { taskId } OR query param ?taskId=
// ---------------------------------------------------------------
export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let taskId: string | undefined;
    const url = new URL(req.url);
    const queryTaskId = url.searchParams.get("taskId");
    if (queryTaskId) {
      taskId = queryTaskId;
    } else {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "invalid_json_or_missing_taskId" }, { status: 400 });
      }
      taskId = body?.taskId;
    }

    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json({ error: "missing_taskId" }, { status: 400 });
    }

    const existing = await db.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }

    await db.task.delete({ where: { id: taskId } });

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "DELETED_TASK",
          detail: `"${existing.title}"`,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ ok: true, id: taskId });
  } catch (e) {
    console.error("[DELETE /api/doz/tasks] error", e);
    return NextResponse.json(
      { error: "failed_to_delete_task", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
