import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — crew availability for a date range or specific freelancer
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: any = {};
  if (userId) where.userId = userId;
  if (startDate && endDate) {
    where.date = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const [availability, freelancers, crewAssignments] = await Promise.all([
    db.crewAvailability.findMany({
      where,
      include: { user: true },
      orderBy: { date: "asc" },
    }),
    db.user.findMany({
      where: { role: "FREELANCER", isActive: true },
      select: { id: true, name: true, title: true, phone: true },
    }),
    db.crewAssignment.findMany({
      include: { user: true, project: true },
      where: { project: { eventDate: { not: null } } },
    }),
  ]);

  // Build availability map: for each freelancer, what dates are they booked?
  const bookedDates: Record<string, { date: string; projectName: string; projectId: string }[]> = {};
  for (const ca of crewAssignments) {
    if (ca.project?.eventDate) {
      const dateStr = new Date(ca.project.eventDate).toISOString().split("T")[0];
      if (!bookedDates[ca.userId]) bookedDates[ca.userId] = [];
      bookedDates[ca.userId].push({
        date: dateStr,
        projectName: ca.project.name,
        projectId: ca.projectId,
      });
    }
  }

  return NextResponse.json({
    freelancers: freelancers.map(f => ({
      id: f.id,
      name: f.name,
      title: f.title,
      phone: f.phone,
      bookedDates: bookedDates[f.id] || [],
    })),
    availability: availability.map(a => ({
      id: a.id,
      userId: a.userId,
      userName: a.user?.name,
      date: a.date,
      status: a.status,
      projectId: a.projectId,
      notes: a.notes,
    })),
  });
}

// POST — set availability status
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "set_status") {
    if (!body.date || !body.status) {
      return NextResponse.json({ error: "date and status required" }, { status: 400 });
    }
    // SECURITY: Only the FOUNDER can set another user's availability.
    // Staff/interns set their own (body.userId is ignored).
    const targetUserId = (user.role === "FOUNDER" && body.userId) ? body.userId : user.id;
    const validStatuses = ["AVAILABLE", "ASSIGNED", "BLOCKED", "LEAVE"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const date = new Date(body.date);
    const existing = await db.crewAvailability.findFirst({
      where: { userId: targetUserId, date },
    });

    if (existing) {
      const updated = await db.crewAvailability.update({
        where: { id: existing.id },
        data: { status: body.status, projectId: body.projectId || null, notes: body.notes ? String(body.notes).slice(0, 500) : null },
      });
      return NextResponse.json({ ok: true, availability: updated });
    }

    const created = await db.crewAvailability.create({
      data: {
        userId: targetUserId,
        date,
        status: body.status,
        projectId: body.projectId || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ok: true, availability: created }, { status: 201 });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
