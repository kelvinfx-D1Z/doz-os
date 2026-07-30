import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword, parsePermissions } from "@/lib/auth";
import type { ModuleId } from "@/lib/store";

// All routes require FOUNDER role
async function requireFounder() {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role !== "FOUNDER") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

// Must stay in sync with ModuleId in src/lib/store.ts and the NAV list in
// app-shell.tsx. Anything missing here is silently stripped when the founder
// saves a custom permission set, which then removes that module from the user.
const VALID_MODULES: ModuleId[] = [
  "command", "planning", "routines", "ai", "field", "crm", "marketing",
  "projects", "procurement", "finance", "team", "staff-hub", "sop", "help", "updates",
  "profile", "messages",
];

function sanitizePermissions(input: any): string[] | null {
  if (!Array.isArray(input)) return null;
  const filtered = input.filter((p) => typeof p === "string" && VALID_MODULES.includes(p as ModuleId));
  return filtered.length > 0 ? filtered : null;
}

// POST — create a new team member
export async function POST(req: Request) {
  const auth = await requireFounder();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.role || !body?.password) {
    return NextResponse.json({ error: "name, email, role, and password are required" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "email already exists" }, { status: 409 });

  const perms = sanitizePermissions(body.permissions);
  const created = await db.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      role: body.role,
      title: body.title || null,
      phone: body.phone || null,
      address: body.address || null,
      bankName: body.bankName || null,
      bankAccount: body.bankAccount || null,
      bankAccountName: body.bankAccountName || null,
      capacity: Number(body.capacity) || 40,
      password: hashPassword(body.password),
      isActive: true,
      permissions: perms ? JSON.stringify(perms) : null,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      title: created.title,
      phone: created.phone,
      address: created.address,
      bankName: created.bankName,
      bankAccount: created.bankAccount,
      bankAccountName: created.bankAccountName,
      capacity: created.capacity,
      isActive: created.isActive,
      permissions: parsePermissions(created.permissions),
    },
  }, { status: 201 });
}

// PATCH — update a team member, change password, or update permissions
export async function PATCH(req: Request) {
  const auth = await requireFounder();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const existing = await db.user.findUnique({ where: { id: body.userId } });
  if (!existing) return NextResponse.json({ error: "user not found" }, { status: 404 });

  if (body.action === "change_password") {
    if (!body.newPassword || body.newPassword.length < 6) {
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
    }
    await db.user.update({
      where: { id: body.userId },
      data: { password: hashPassword(body.newPassword) },
    });
    return NextResponse.json({ ok: true });
  }

  // Update permissions only (used by the Permissions dialog in Team module)
  if (body.action === "update_permissions") {
    const perms = sanitizePermissions(body.permissions);
    await db.user.update({
      where: { id: body.userId },
      data: { permissions: perms ? JSON.stringify(perms) : null },
    });
    try {
      await db.activityLog.create({
        data: {
          userId: auth.user.id,
          action: "UPDATED_PERMISSIONS",
          detail: `Set ${existing.name}'s module access to ${perms ? `${perms.length} module(s)` : "role defaults"}`,
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, userId: body.userId, permissions: perms });
  }

  // Regular update (name, email, title, phone, role, capacity, isActive)
  const data: any = {
    name: body.name || existing.name,
    title: body.title !== undefined ? body.title : existing.title,
    phone: body.phone !== undefined ? body.phone : existing.phone,
    address: body.address !== undefined ? body.address : existing.address,
    bankName: body.bankName !== undefined ? body.bankName : existing.bankName,
    bankAccount: body.bankAccount !== undefined ? body.bankAccount : existing.bankAccount,
    bankAccountName: body.bankAccountName !== undefined ? body.bankAccountName : existing.bankAccountName,
    role: body.role || existing.role,
    capacity: body.capacity !== undefined ? Number(body.capacity) : existing.capacity,
    isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
  };
  // ------------------------------------------------------------------
  // Email (= the sign-in username). Only touched when the founder
  // actually sends a new one, so existing callers are unaffected.
  // Normalised to lowercase, format-checked, and uniqueness-checked
  // before it reaches the DB so we return 409 instead of a raw
  // Prisma unique-constraint 500.
  // ------------------------------------------------------------------
  if (body.email !== undefined && body.email !== null) {
    const nextEmail = String(body.email).toLowerCase().trim();
    if (!nextEmail) {
      return NextResponse.json({ error: "email cannot be empty" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return NextResponse.json({ error: "that is not a valid email address" }, { status: 400 });
    }
    if (nextEmail !== existing.email) {
      const taken = await db.user.findUnique({ where: { email: nextEmail } });
      if (taken) {
        return NextResponse.json({ error: "email_taken" }, { status: 409 });
      }
      data.email = nextEmail;
    }
  }

  // If permissions are provided on a regular update, sanitize + persist them too
  if (body.permissions !== undefined) {
    const perms = sanitizePermissions(body.permissions);
    data.permissions = perms ? JSON.stringify(perms) : null;
  }

  const updated = await db.user.update({
    where: { id: body.userId },
    data,
  });

  // Log the sign-in-name change — it changes how that person logs in.
  if (data.email) {
    try {
      await db.activityLog.create({
        data: {
          userId: auth.user.id,
          action: "UPDATED_EMAIL",
          detail: `Changed ${existing.name}'s sign-in email from ${existing.email} to ${data.email}`,
        },
      });
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      title: updated.title,
      phone: updated.phone,
      address: updated.address,
      bankName: updated.bankName,
      bankAccount: updated.bankAccount,
      bankAccountName: updated.bankAccountName,
      capacity: updated.capacity,
      isActive: updated.isActive,
      permissions: parsePermissions(updated.permissions),
    },
  });
}

// DELETE — deactivate a team member
export async function DELETE(req: Request) {
  const auth = await requireFounder();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Prevent self-deactivation
  if ("user" in auth && auth.user.id === body.userId) {
    return NextResponse.json({ error: "cannot deactivate yourself" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { id: body.userId } });
  if (!existing) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // ------------------------------------------------------------------
  // `permanent: true` hard-deletes the person instead of deactivating.
  //
  // Ten columns reference User with a REQUIRED foreign key (Goal.ownerId,
  // CrewAssignment.userId, PaymentRequest.requesterId, Approval.approverId,
  // DailyReport.userId, WeeklyReport.userId, RoutineLog.userId,
  // FounderTimeLog.userId, TimeEntry.userId, CrewAvailability.userId), so a
  // bare delete would either be blocked by Postgres or, for the nullable
  // ones, silently strip the person's name off records of work they did.
  //
  // So: only delete someone with no history. Anyone who has actually worked
  // gets deactivated — that is what preserves who filed a report, who was on
  // a crew, and who approved a payment.
  // ------------------------------------------------------------------
  if (body.permanent === true) {
    const uid = body.userId;
    const [
      goals, crew, paymentsRequested, approvals, dailyReports, weeklyReports,
      routineLogs, timeEntries, availability, tasksAssigned, tasksCreated, projectsManaged,
    ] = await Promise.all([
      db.goal.count({ where: { ownerId: uid } }),
      db.crewAssignment.count({ where: { userId: uid } }),
      db.paymentRequest.count({ where: { requesterId: uid } }),
      db.approval.count({ where: { approverId: uid } }),
      db.dailyReport.count({ where: { userId: uid } }),
      db.weeklyReport.count({ where: { userId: uid } }),
      db.routineLog.count({ where: { userId: uid } }),
      db.timeEntry.count({ where: { userId: uid } }),
      db.crewAvailability.count({ where: { userId: uid } }),
      db.task.count({ where: { assigneeId: uid } }),
      db.task.count({ where: { creatorId: uid } }),
      db.project.count({ where: { managerId: uid } }),
    ]);

    // Message FKs are ON DELETE RESTRICT, so anyone who has sent or received
    // a message cannot be hard-deleted by Postgres regardless of the rest.
    const messages = await db.message.count({
      where: { OR: [{ senderId: uid }, { recipientId: uid }] },
    });

    const blockers: string[] = [];
    const add = (n: number, one: string, many: string) => {
      if (n > 0) blockers.push(`${n} ${n === 1 ? one : many}`);
    };
    add(dailyReports, "daily report", "daily reports");
    add(weeklyReports, "weekly report", "weekly reports");
    add(crew, "crew assignment", "crew assignments");
    add(tasksAssigned, "assigned task", "assigned tasks");
    add(tasksCreated, "created task", "created tasks");
    add(projectsManaged, "managed project", "managed projects");
    add(goals, "owned goal", "owned goals");
    add(paymentsRequested, "payment request", "payment requests");
    add(approvals, "approval", "approvals");
    add(routineLogs, "routine log", "routine logs");
    add(timeEntries, "time entry", "time entries");
    add(availability, "availability record", "availability records");
    add(messages, "message", "messages");

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error:
            `${existing.name} has ${blockers.join(", ")} on record. ` +
            `Deleting them would erase who did that work. Deactivate them instead — ` +
            `they lose access immediately but the history stays intact.`,
        },
        { status: 409 },
      );
    }

    await db.user.delete({ where: { id: uid } });
    try {
      await db.activityLog.create({
        data: {
          userId: auth.user.id,
          action: "DELETED_TEAM_MEMBER",
          detail: `Permanently deleted ${existing.name} <${existing.email}> — no work history on record`,
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, deleted: true });
  }

  await db.user.update({
    where: { id: body.userId },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
