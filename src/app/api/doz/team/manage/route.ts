import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

// All routes require FOUNDER role
async function requireFounder() {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role !== "FOUNDER") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
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

  return NextResponse.json({
    ok: true,
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      title: created.title,
      phone: created.phone,
      capacity: created.capacity,
      isActive: created.isActive,
    },
  }, { status: 201 });
}

// PATCH — update a team member or change password
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

  // Regular update
  const updated = await db.user.update({
    where: { id: body.userId },
    data: {
      name: body.name || existing.name,
      title: body.title !== undefined ? body.title : existing.title,
      phone: body.phone !== undefined ? body.phone : existing.phone,
      role: body.role || existing.role,
      capacity: body.capacity !== undefined ? Number(body.capacity) : existing.capacity,
      isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      title: updated.title,
      phone: updated.phone,
      capacity: updated.capacity,
      isActive: updated.isActive,
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

  await db.user.update({
    where: { id: body.userId },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
