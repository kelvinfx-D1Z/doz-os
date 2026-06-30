import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const milestones = await db.founderMilestone.findMany({ orderBy: [{ quarter: "asc" }, { dueMonth: "asc" }] });

  const stats = {
    total: milestones.length,
    completed: milestones.filter(m => m.status === "COMPLETED").length,
    inProgress: milestones.filter(m => m.status === "IN_PROGRESS").length,
    notStarted: milestones.filter(m => m.status === "NOT_STARTED").length,
  };

  const weeklySchedule = [
    { day: "Monday", focus: "Leadership Meeting — Review KPIs, assign work, sales pipeline, cashflow", icon: "Users" },
    { day: "Tuesday", focus: "Sales — Client meetings, proposal review, business development", icon: "TrendingUp" },
    { day: "Wednesday", focus: "Creative — Review edits, content strategy, mentor interns", icon: "Clapperboard" },
    { day: "Thursday", focus: "Product Day — Fiestivo.com, FounderOS, AI, automation, process improvements", icon: "Rocket" },
    { day: "Friday", focus: "Review — Finance, weekly reports, learning session, plan next week", icon: "Wallet" },
  ];

  const monthlyTargets = [
    "Meet 5 potential clients", "Attend 1 networking event", "Publish 1 case study",
    "Launch 1 improvement", "Document 1 process", "Teach 1 internal workshop",
    "Read 1 business book", "Review financial dashboard",
  ];

  const scorecard = [
    "Did we improve a system?", "Did we acquire new clients?", "Did we improve our brand?",
    "Did we create a reusable asset?", "Did we increase recurring revenue?",
  ];

  const ecosystem = {
    "DOZ Studios": "Corporate Films, Documentaries, Photography, Livestreaming, Events",
    "Fiestivo.com": "Registration, Check-in, Live Polls, Q&A, Surveys, Event Reports",
    "FounderOS": "CRM, Projects, Finance, HR, SOPs, Business Systems",
  };

  return NextResponse.json({ milestones, stats, weeklySchedule, monthlyTargets, scorecard, ecosystem });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.milestoneId) return NextResponse.json({ error: "milestoneId required" }, { status: 400 });

  const data: any = { status: body.status };
  if (body.status === "COMPLETED") data.completedAt = new Date();
  if (body.status === "NOT_STARTED") data.completedAt = null;

  const updated = await db.founderMilestone.update({ where: { id: body.milestoneId }, data });
  return NextResponse.json({ ok: true, milestone: updated });
}
