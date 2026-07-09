import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — event day status + logs for a project
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (projectId) {
    const [status, logs, project] = await Promise.all([
      db.eventDayStatus.findUnique({ where: { projectId } }),
      db.eventDayLog.findMany({ where: { projectId }, orderBy: { timestamp: "desc" }, take: 50 }),
      db.project.findUnique({ where: { id: projectId }, include: { crew: { include: { user: true } } } }),
    ]);

    return NextResponse.json({
      status: status || {
        projectId,
        crewCheckedIn: 0,
        crewTotal: project?.crew.length || 0,
        equipmentLoaded: false,
        techCheckDone: false,
        doorsOpen: false,
        eventStarted: false,
        eventEnded: false,
        currentStep: "PRE_EVENT",
      },
      logs: logs.map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        category: l.category,
        message: l.message,
        severity: l.severity,
        reportedBy: l.reportedBy,
        resolvedAt: l.resolvedAt,
      })),
      crew: project?.crew.map(c => ({
        id: c.id,
        name: c.user.name,
        role: c.role,
        status: c.status,
      })) || [],
      project: project ? { name: project.name, eventDate: project.eventDate, venue: project.venue } : null,
    });
  }

  // No projectId — return all active event day statuses
  const statuses = await db.eventDayStatus.findMany({
    where: { eventEnded: false },
    include: { project: true },
  });

  return NextResponse.json({
    activeEvents: statuses.map(s => ({
      projectId: s.projectId,
      projectName: s.project?.name,
      currentStep: s.currentStep,
      crewCheckedIn: s.crewCheckedIn,
      crewTotal: s.crewTotal,
      equipmentLoaded: s.equipmentLoaded,
      techCheckDone: s.techCheckDone,
      doorsOpen: s.doorsOpen,
    })),
  });
}

// POST — update event day status or add a log entry
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "init") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const existing = await db.eventDayStatus.findUnique({ where: { projectId: body.projectId } });
    if (existing) return NextResponse.json({ ok: true, status: existing });

    const crewCount = await db.crewAssignment.count({ where: { projectId: body.projectId } });
    const created = await db.eventDayStatus.create({
      data: { projectId: body.projectId, crewTotal: crewCount },
    });
    return NextResponse.json({ ok: true, status: created });
  }

  if (body.action === "update_status") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const data: any = {};
    if (body.crewCheckedIn !== undefined) data.crewCheckedIn = body.crewCheckedIn;
    if (body.equipmentLoaded !== undefined) data.equipmentLoaded = body.equipmentLoaded;
    if (body.techCheckDone !== undefined) data.techCheckDone = body.techCheckDone;
    if (body.doorsOpen !== undefined) data.doorsOpen = body.doorsOpen;
    if (body.eventStarted !== undefined) data.eventStarted = body.eventStarted;
    if (body.eventEnded !== undefined) data.eventEnded = body.eventEnded;
    if (body.currentStep !== undefined) data.currentStep = body.currentStep;

    const updated = await db.eventDayStatus.upsert({
      where: { projectId: body.projectId },
      update: data,
      create: { projectId: body.projectId, ...data },
    });
    return NextResponse.json({ ok: true, status: updated });
  }

  if (body.action === "add_log") {
    if (!body.projectId || !body.message) return NextResponse.json({ error: "projectId and message required" }, { status: 400 });
    const log = await db.eventDayLog.create({
      data: {
        projectId: body.projectId,
        category: body.category || "GENERAL",
        message: body.message,
        severity: body.severity || "INFO",
        reportedBy: user.name,
      },
    });
    return NextResponse.json({ ok: true, log }, { status: 201 });
  }

  if (body.action === "resolve_log") {
    if (!body.logId) return NextResponse.json({ error: "logId required" }, { status: 400 });
    await db.eventDayLog.update({ where: { id: body.logId }, data: { resolvedAt: new Date(), severity: "RESOLVED" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
