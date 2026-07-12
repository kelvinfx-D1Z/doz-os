import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — time entries (optionally filtered by user, project, or date range)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const projectId = searchParams.get("projectId");

  const where: any = {};
  if (userId) where.userId = userId;
  if (projectId) where.projectId = projectId;

  const [entries, projects, teamMembers] = await Promise.all([
    db.timeEntry.findMany({
      where,
      include: { user: true, project: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { isActive: true, role: { in: ["FOUNDER", "STAFF", "INTERN", "FREELANCER"] } },
      select: { id: true, name: true, role: true, title: true },
    }),
  ]);

  // Compute totals
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hours, 0);
  const byProject: Record<string, { name: string; hours: number }> = {};
  for (const e of entries) {
    const name = e.project?.name || "No project";
    if (!byProject[name]) byProject[name] = { name, hours: 0 };
    byProject[name].hours += e.hours;
  }
  const byUser: Record<string, { name: string; hours: number }> = {};
  for (const e of entries) {
    const name = e.user?.name || "Unknown";
    if (!byUser[name]) byUser[name] = { name, hours: 0 };
    byUser[name].hours += e.hours;
  }

  return NextResponse.json({
    entries: entries.map(e => ({
      id: e.id,
      userId: e.userId,
      userName: e.user?.name,
      projectId: e.projectId,
      projectName: e.project?.name,
      date: e.date,
      hours: e.hours,
      description: e.description,
      billable: e.billable,
      createdAt: e.createdAt,
    })),
    projects,
    teamMembers,
    stats: {
      totalHours: Math.round(totalHours * 10) / 10,
      billableHours: Math.round(billableHours * 10) / 10,
      entryCount: entries.length,
      byProject: Object.values(byProject).sort((a, b) => b.hours - a.hours),
      byUser: Object.values(byUser).sort((a, b) => b.hours - a.hours),
    },
  });
}

// POST — log time entry
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "log") {
    if (!body.hours || !body.date) {
      return NextResponse.json({ error: "hours and date required" }, { status: 400 });
    }
    // SECURITY: Only the FOUNDER can log time on behalf of another user.
    // Staff/interns can only log their own time.
    const targetUserId = (user.role === "FOUNDER" && body.userId) ? body.userId : user.id;
    const created = await db.timeEntry.create({
      data: {
        userId: targetUserId,
        projectId: body.projectId || null,
        date: new Date(body.date),
        hours: Number(body.hours),
        description: body.description ? String(body.description).slice(0, 500) : null,
        billable: body.billable !== false,
      },
    });
    return NextResponse.json({ ok: true, entry: created }, { status: 201 });
  }

  if (body.action === "delete") {
    if (!body.entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });
    // Ownership check: only the entry's owner or a FOUNDER can delete it.
    const entry = await db.timeEntry.findUnique({ where: { id: body.entryId }, select: { userId: true } });
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (entry.userId !== user.id && user.role !== "FOUNDER") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await db.timeEntry.delete({ where: { id: body.entryId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
