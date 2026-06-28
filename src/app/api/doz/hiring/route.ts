import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [users, hiringStages] = await Promise.all([
    db.user.findMany({ orderBy: { role: "asc" } }),
    db.hiringStage.findMany({ orderBy: { stage: "asc" } }),
  ]);

  const currentTeam = users.map(u => ({
    id: u.id, name: u.name, role: u.role, title: u.title, capacity: u.capacity, isActive: u.isActive,
  }));

  const openPositions = hiringStages.filter(h => ["OPEN","INTERVIEWING","OFFERED"].includes(h.status)).length;
  const forecastedPositions = hiringStages.filter(h => h.status === "FORECASTED").length;
  const monthlySalaryBudget = hiringStages.filter(h => h.status !== "HIRED" && h.status !== "ONBOARDED").reduce((s, h) => s + (h.salaryBudget || 0), 0);
  const activeMembers = users.filter(u => u.isActive).length;
  const teamUtilization = activeMembers > 0 ? Math.min(100, Math.round((activeMembers / Math.max(activeMembers, 1)) * 80)) : 0;

  return NextResponse.json({
    currentTeam,
    hiringPlan: hiringStages.map(h => ({
      id: h.id, stage: h.stage, role: h.role, reason: h.reason, successMetric: h.successMetric,
      status: h.status, salaryBudget: h.salaryBudget, targetDate: h.targetDate, hiredName: h.hiredName, hiredAt: h.hiredAt, notes: h.notes,
    })),
    stats: { totalTeam: users.length, openPositions, forecastedPositions, monthlySalaryBudget, teamUtilization },
  });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.stageId) return NextResponse.json({ error: "stageId required" }, { status: 400 });

  const data: any = { status: body.status };
  if (body.hiredName) data.hiredName = body.hiredName;
  if (body.notes) data.notes = body.notes;
  if (body.status === "HIRED") data.hiredAt = new Date();

  const updated = await db.hiringStage.update({ where: { id: body.stageId }, data });
  return NextResponse.json({ ok: true, stage: updated });
}
