import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

// GET — staff overview with roles, responsibilities, and tasks
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [users, staffRoles, tasks] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["FOUNDER", "STAFF", "INTERN"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.staffRole.findMany(),
    db.task.findMany({
      where: { status: { not: "DONE" } },
      include: { assignee: true, creator: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  // Group tasks by assignee
  const tasksByUser: Record<string, any[]> = {};
  for (const t of tasks) {
    if (t.assigneeId) {
      if (!tasksByUser[t.assigneeId]) tasksByUser[t.assigneeId] = [];
      tasksByUser[t.assigneeId].push({
        id: t.id, title: t.title, status: t.status, priority: t.priority,
        category: t.category, dueDate: t.dueDate, isDistraction: t.isDistraction,
        creator: t.creator?.name,
      });
    }
  }

  // Build staff profiles
  const staff = users.map(u => {
    const roles = staffRoles.filter(r => r.userId === u.id);
    const userTasks = tasksByUser[u.id] || [];
    const doneToday = userTasks.filter(t => t.status === "DONE").length;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      phone: u.phone,
      capacity: u.capacity,
      isActive: u.isActive,
      roles: roles.map(r => ({
        pillar: r.pillar,
        percentage: r.percentage,
        responsibilities: r.responsibilities ? r.responsibilities.split("\n").filter(Boolean) : [],
      })),
      tasks: {
        today: userTasks.filter(t => t.dueDate && new Date(t.dueDate) <= new Date(Date.now() + 86400000)),
        thisWeek: userTasks.filter(t => t.dueDate && new Date(t.dueDate) <= new Date(Date.now() + 7 * 86400000)),
        overdue: userTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE"),
        total: userTasks.length,
      },
    };
  });

  // Summary stats
  const summary = {
    totalStaff: users.filter(u => u.isActive).length,
    totalTasks: tasks.length,
    overdueTasks: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length,
    todayTasks: tasks.filter(t => t.dueDate && new Date(t.dueDate) <= new Date(Date.now() + 86400000)).length,
  };

  return NextResponse.json({ staff, summary });
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
      },
    });
    return NextResponse.json({ ok: true, user: { id: created.id, name: created.name } }, { status: 201 });
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

  // DIDI creates activities for staff
  if (body.action === "didi_create_activities") {
    if (!body.description || !body.assigneeId) {
      return NextResponse.json({ error: "description and assigneeId required" }, { status: 400 });
    }
    // Parse the description into tasks (split by newlines or sentences)
    const lines = body.description.split(/\n|\. (?=[A-Z])/).map((s: string) => s.trim()).filter(Boolean);
    const created = [];
    for (const line of lines.slice(0, 10)) {
      const task = await db.task.create({
        data: {
          title: line.substring(0, 200),
          description: `Created by DIDI: ${body.description}`,
          assigneeId: body.assigneeId,
          creatorId: user.id,
          priority: body.priority || "MEDIUM",
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
