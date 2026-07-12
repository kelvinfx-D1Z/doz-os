import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword, parsePermissions } from "@/lib/auth";
import type { ModuleId } from "@/lib/store";

// All valid module IDs — used to validate the permissions array.
const VALID_MODULES: ModuleId[] = [
  "command", "planning", "routines", "ai", "field", "crm", "marketing",
  "projects", "procurement", "finance", "team", "staff-hub", "sop", "help", "updates",
];

// Sanitize an incoming permissions array → valid ModuleId[] | null.
// Returns null if the input is empty or invalid (so role defaults kick in).
function sanitizePermissions(input: any): string[] | null {
  if (!Array.isArray(input)) return null;
  const filtered = input.filter((p) => typeof p === "string" && VALID_MODULES.includes(p as ModuleId));
  return filtered.length > 0 ? filtered : null;
}

// GET — staff overview with roles, responsibilities, and tasks.
// FOUNDER sees ALL tasks for every staff member (including completed).
// STAFF/INTERN only see their own open tasks (they cannot open this page
// anyway — it's restricted — but the API stays safe by filtering to their id).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const isFounder = user.role === "FOUNDER";

  const [users, staffRoles, tasks] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["FOUNDER", "STAFF", "INTERN"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.staffRole.findMany(),
    db.task.findMany({
      // Founder sees every non-archived task; non-founders only see their own
      where: isFounder
        ? undefined
        : { assigneeId: user.id },
      include: { assignee: true, creator: true },
      orderBy: [
        { status: "asc" }, // DONE last
        { dueDate: "asc" },
      ],
    }),
  ]);

  // Group tasks by assignee
  const tasksByUser: Record<string, any[]> = {};
  for (const t of tasks) {
    if (t.assigneeId) {
      if (!tasksByUser[t.assigneeId]) tasksByUser[t.assigneeId] = [];
      tasksByUser[t.assigneeId].push({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        dueDate: t.dueDate,
        isDistraction: t.isDistraction,
        completedAt: t.completedAt,
        creator: t.creator?.name,
        creatorId: t.creatorId,
        assigneeId: t.assigneeId,
      });
    }
  }

  // Build staff profiles
  const DAY = 86400000;
  const now = Date.now();
  const staff = users.map(u => {
    const roles = staffRoles.filter(r => r.userId === u.id);
    const userTasks = tasksByUser[u.id] || [];
    const doneToday = userTasks.filter(t => t.status === "DONE" && t.completedAt && new Date(t.completedAt).getTime() > now - DAY).length;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      phone: u.phone,
      capacity: u.capacity,
      isActive: u.isActive,
      // Per-user permissions (null = role defaults apply)
      permissions: parsePermissions(u.permissions),
      roles: roles.map(r => ({
        pillar: r.pillar,
        percentage: r.percentage,
        responsibilities: r.responsibilities ? r.responsibilities.split("\n").filter(Boolean) : [],
      })),
      tasks: {
        today: userTasks.filter(t => t.status !== "DONE" && t.dueDate && new Date(t.dueDate).getTime() <= now + DAY),
        thisWeek: userTasks.filter(t => t.status !== "DONE" && t.dueDate && new Date(t.dueDate).getTime() <= now + 7 * DAY),
        overdue: userTasks.filter(t => t.status !== "DONE" && t.dueDate && new Date(t.dueDate).getTime() < now),
        completed: userTasks.filter(t => t.status === "DONE"),
        total: userTasks.length,
      },
      doneToday,
    };
  });

  // Summary stats
  const summary = {
    totalStaff: users.filter(u => u.isActive).length,
    totalTasks: tasks.filter(t => t.status !== "DONE").length,
    overdueTasks: tasks.filter(t => t.status !== "DONE" && t.dueDate && new Date(t.dueDate).getTime() < now).length,
    todayTasks: tasks.filter(t => t.status !== "DONE" && t.dueDate && new Date(t.dueDate).getTime() <= now + DAY).length,
  };

  return NextResponse.json({ staff, summary, isFounder });
}

// POST — add staff, assign task, create staff role
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // Add new staff member (FOUNDER only)
  if (body.action === "add_staff") {
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.name || !body.email || !body.role || !body.password) {
      return NextResponse.json({ error: "name, email, role, password required" }, { status: 400 });
    }
    const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "email already exists" }, { status: 409 });

    // Sanitize permissions array — null means "use role defaults"
    const perms = sanitizePermissions(body.permissions);
    const created = await db.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role,
        title: body.title || null,
        phone: body.phone || null,
        capacity: Number(body.capacity) || 40,
        password: hashPassword(body.password),
        isActive: true,
        permissions: perms ? JSON.stringify(perms) : null,
      },
    });
    return NextResponse.json({ ok: true, user: { id: created.id, name: created.name } }, { status: 201 });
  }

  // Update permissions (FOUNDER only) — sets the per-user module access list.
  // Body: { action: "update_permissions", userId, permissions: string[] | null }
  // Pass permissions=null (or []) to clear the override and revert to role defaults.
  if (body.action === "update_permissions") {
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const target = await db.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, role: true } });
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const perms = sanitizePermissions(body.permissions);
    await db.user.update({
      where: { id: body.userId },
      data: { permissions: perms ? JSON.stringify(perms) : null },
    });

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATED_PERMISSIONS",
          detail: `Set ${target.name}'s module access to ${perms ? `${perms.length} module(s)` : "role defaults"}`,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, userId: body.userId, permissions: perms });
  }

  // Assign task to a staff member
  if (body.action === "assign_task") {
    if (!body.title || !body.assigneeId) {
      return NextResponse.json({ error: "title and assigneeId required" }, { status: 400 });
    }
    const created = await db.task.create({
      data: {
        title: String(body.title),
        description: body.description || null,
        assigneeId: body.assigneeId,
        creatorId: user.id,
        priority: body.priority || "MEDIUM",
        category: body.category || "OPERATIONAL",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: "TODO",
      },
    });
    return NextResponse.json({ ok: true, task: created }, { status: 201 });
  }

  // Set staff role/responsibilities (pillars)
  if (body.action === "set_roles") {
    if (!body.userId || !body.roles) {
      return NextResponse.json({ error: "userId and roles required" }, { status: 400 });
    }
    // Delete existing roles for this user
    await db.staffRole.deleteMany({ where: { userId: body.userId } });
    // Create new roles
    for (const r of body.roles) {
      await db.staffRole.create({
        data: {
          userId: body.userId,
          pillar: r.pillar,
          percentage: r.percentage,
          responsibilities: Array.isArray(r.responsibilities) ? r.responsibilities.join("\n") : r.responsibilities || "",
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Toggle task status
  if (body.action === "toggle_task") {
    if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const task = await db.task.findUnique({ where: { id: body.taskId } });
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    const newStatus = task.status === "DONE" ? "TODO" : "DONE";
    await db.task.update({
      where: { id: body.taskId },
      data: { status: newStatus, completedAt: newStatus === "DONE" ? new Date() : null },
    });
    return NextResponse.json({ ok: true, status: newStatus });
  }

  // Update task — FOUNDER only. Lets the founder modify any staff/intern task:
  // title, description, priority, category, dueDate, assigneeId, status.
  // Body: { action: "update_task", taskId, fields: { ... } }
  if (body.action === "update_task") {
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
    if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    if (!body.fields || typeof body.fields !== "object") {
      return NextResponse.json({ error: "fields object required" }, { status: 400 });
    }

    const existing = await db.task.findUnique({ where: { id: body.taskId } });
    if (!existing) return NextResponse.json({ error: "task not found" }, { status: 404 });

    const f = body.fields;
    const data: any = {};

    if (typeof f.title === "string" && f.title.trim().length > 0) {
      data.title = f.title.trim();
    }
    if (f.description !== undefined) {
      data.description = typeof f.description === "string" && f.description.trim().length > 0
        ? f.description.trim()
        : null;
    }
    if (typeof f.priority === "string" && ["URGENT", "HIGH", "MEDIUM", "LOW"].includes(f.priority)) {
      data.priority = f.priority;
    }
    if (f.category !== undefined) {
      data.category = (f.category === null || f.category === "" || ["STRATEGIC", "OPERATIONAL", "ADMIN", "DISTRACTION"].includes(f.category))
        ? (f.category === "" ? null : f.category)
        : existing.category;
    }
    if (f.assigneeId !== undefined) {
      if (f.assigneeId === null || f.assigneeId === "") {
        data.assigneeId = null;
      } else if (typeof f.assigneeId === "string") {
        const target = await db.user.findUnique({ where: { id: f.assigneeId }, select: { id: true } });
        if (!target) return NextResponse.json({ error: "assignee not found" }, { status: 400 });
        data.assigneeId = f.assigneeId;
      }
    }
    if (f.dueDate !== undefined) {
      if (f.dueDate === null || f.dueDate === "") {
        data.dueDate = null;
      } else {
        const d = new Date(f.dueDate);
        if (!isNaN(d.getTime())) data.dueDate = d;
      }
    }
    if (typeof f.status === "string" && ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"].includes(f.status)) {
      data.status = f.status;
      data.completedAt = f.status === "DONE" ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const updated = await db.task.update({
      where: { id: body.taskId },
      data,
    });

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATED_TASK",
          detail: `Modified "${updated.title}" (${Object.keys(data).join(", ")})`,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, task: updated });
  }

  // Delete task — FOUNDER only.
  // Body: { action: "delete_task", taskId }
  if (body.action === "delete_task") {
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
    if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const existing = await db.task.findUnique({ where: { id: body.taskId }, select: { id: true, title: true } });
    if (!existing) return NextResponse.json({ error: "task not found" }, { status: 404 });

    await db.task.delete({ where: { id: body.taskId } });

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "DELETED_TASK",
          detail: `Deleted "${existing.title}"`,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, id: body.taskId });
  }

  // DIDI creates activities for staff — uses AI to parse description into structured tasks
  if (body.action === "didi_create_activities") {
    if (!body.description || !body.assigneeId) {
      return NextResponse.json({ error: "description and assigneeId required" }, { status: 400 });
    }

    const assignee = await db.user.findUnique({ where: { id: body.assigneeId } });
    const assigneeName = assignee?.name || "the staff member";

    // Use AI to parse the description into structured tasks
    let parsedTasks: { title: string; priority: string; description: string }[] = [];
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: `You are DIDI, an AI operations assistant for Digit One Zero Ltd. The user has described work that needs to be done by ${assigneeName}. Break this description into clear, actionable individual tasks. Each task should be specific, measurable, and have a clear deliverable.

Return ONLY a JSON array of task objects. Each object must have:
- "title": a clear, concise task title (max 100 chars)
- "priority": "URGENT", "HIGH", "MEDIUM", or "LOW"
- "description": a one-sentence description of what to do

Example: If the description is "Research 20 potential clients in the energy sector. Add them to the CRM with contact info. Follow up with 5 by email."
Return: [{"title":"Research 20 energy sector companies","priority":"HIGH","description":"Identify 20 potential clients in oil & gas, power, and renewable energy sectors."},{"title":"Add contacts to CRM","priority":"HIGH","description":"Add all 20 companies to the CRM with company name, contact person, email, and phone."},{"title":"Send follow-up emails to 5 prospects","priority":"MEDIUM","description":"Draft and send personalized follow-up emails to the 5 most promising leads."}]

Return ONLY the JSON array. No explanation, no markdown.`,
          },
          {
            role: "user",
            content: body.description,
          },
        ],
        thinking: { type: "disabled" },
      });

      const responseText = completion?.choices?.[0]?.message?.content ?? "";
      // Parse the JSON array from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedTasks = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("[DIDI assign] AI parsing failed, falling back to simple split:", err);
    }

    // Fallback: if AI didn't return valid tasks, split by sentences
    if (!parsedTasks || parsedTasks.length === 0) {
      const lines = body.description.split(/\n|\. (?=[A-Z])/).map((s: string) => s.trim()).filter(Boolean);
      parsedTasks = lines.slice(0, 10).map((line: string) => ({
        title: line.substring(0, 200),
        priority: body.priority || "MEDIUM",
        description: `Created by DIDI from: ${body.description}`,
      }));
    }

    // Create the tasks
    const created = [];
    for (const t of parsedTasks.slice(0, 15)) {
      const task = await db.task.create({
        data: {
          title: t.title.substring(0, 200),
          description: t.description || `Created by DIDI: ${body.description}`,
          assigneeId: body.assigneeId,
          creatorId: user.id,
          priority: ["URGENT", "HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : (body.priority || "MEDIUM"),
          category: body.category || "OPERATIONAL",
          dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 7 * 86400000),
          status: "TODO",
        },
      });
      created.push(task);
    }
    return NextResponse.json({ ok: true, created: created.length, tasks: created });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

// DELETE — remove/deactivate staff
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (body.userId === user.id) return NextResponse.json({ error: "cannot deactivate yourself" }, { status: 400 });

  await db.user.update({ where: { id: body.userId }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
