import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function weekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const founder = await db.user.findFirst({ where: { role: "FOUNDER" } });
  if (!founder) return NextResponse.json({ error: "no founder" }, { status: 404 });

  const [totalP, withoutP, approvals, delegated, tasks, sopTasks, opps, timeLogs] = await Promise.all([
    db.project.count(),
    db.project.count({ where: { NOT: { managerId: founder.id } } }),
    db.approval.count(),
    db.approval.count({ where: { NOT: { approverId: founder.id } } }),
    db.task.count(),
    db.task.count({ where: { NOT: { assigneeId: founder.id }, status: "DONE" } }),
    db.opportunity.findMany({ where: { stage: "WON" } }),
    db.founderTimeLog.findMany({ where: { date: { gte: weekStart() } } }),
  ]);

  const pp = totalP > 0 ? (withoutP / totalP) * 100 : 0;
  const dp = approvals > 0 ? (delegated / approvals) * 100 : 0;
  const sp = tasks > 0 ? (sopTasks / tasks) * 100 : 0;
  const rp = opps.length > 0 ? (opps.filter(o => o.source !== "REFERRAL").length / opps.length) * 100 : 0;

  const total = timeLogs.reduce((s, l) => s + l.hours, 0);
  const strategy = timeLogs.filter(l => l.category === "STRATEGY").reduce((s, l) => s + l.hours, 0);
  const ops = timeLogs.filter(l => ["OPERATIONS","DELIVERY"].includes(l.category)).reduce((s, l) => s + l.hours, 0);
  const admin = timeLogs.filter(l => l.category === "ADMINISTRATION").reduce((s, l) => s + l.hours, 0);
  const sales = timeLogs.filter(l => l.category === "SALES").reduce((s, l) => s + l.hours, 0);
  const delivery = timeLogs.filter(l => l.category === "DELIVERY").reduce((s, l) => s + l.hours, 0);
  const stratRatio = (strategy + ops) > 0 ? (strategy / (strategy + ops)) * 100 : 0;

  const score = Math.round(pp * 0.25 + dp * 0.20 + stratRatio * 0.20 + sp * 0.15 + rp * 0.20);
  const rating = score < 30 ? "FLEDGLING" : score < 60 ? "PROGRESSING" : "INDEPENDENT";

  const recommendations: string[] = [];
  if (admin > 4) recommendations.push(`You spent ${admin} hours on admin this week — delegate invoice verification`);
  if (pp < 30) recommendations.push(`You're managing ${totalP - withoutP} of ${totalP} projects — assign project leads`);
  if (stratRatio < 15) recommendations.push(`Only ${stratRatio.toFixed(0)}% of your time is strategic — block 2 hours daily for deep work`);
  if (score < 30) recommendations.push(`Your Freedom Score is ${score} — the business depends on you for everything. Focus on delegation this week.`);
  if (recommendations.length === 0) recommendations.push("Your Freedom Score is healthy — keep delegating and building systems.");

  return NextResponse.json({
    score,
    rating,
    metrics: {
      projectsWithoutFounder: { value: withoutP, total: totalP, pct: Math.round(pp) },
      delegatedDecisions: { value: delegated, total: approvals, pct: Math.round(dp) },
      strategyVsOps: { strategyHours: strategy, opsHours: ops, ratio: Math.round(stratRatio) },
      sopTasksNoEscalation: { value: sopTasks, total: tasks, pct: Math.round(sp) },
      revenueWithoutFounderSales: { value: opps.filter(o => o.source !== "REFERRAL").length, total: opps.length, pct: Math.round(rp) },
    },
    timeAllocation: { sales, operations: timeLogs.filter(l => l.category === "OPERATIONS").reduce((s,l) => s+l.hours, 0), administration: admin, strategy, delivery },
    recommendations,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.action !== "log_time") return NextResponse.json({ error: "invalid action" }, { status: 400 });
  if (!body.category || !body.hours) return NextResponse.json({ error: "category and hours required" }, { status: 400 });

  const valid = ["SALES","OPERATIONS","ADMINISTRATION","STRATEGY","DELIVERY"];
  if (!valid.includes(body.category)) return NextResponse.json({ error: "invalid category" }, { status: 400 });

  await db.founderTimeLog.create({
    data: { userId: user.id, date: new Date(), category: body.category, hours: Number(body.hours), notes: body.notes || null },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
