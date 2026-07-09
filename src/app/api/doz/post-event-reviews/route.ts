import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — post-event reviews (optionally filtered by project)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const reviews = await db.postEventReview.findMany({
    where: projectId ? { projectId } : undefined,
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  // Pattern detection: find recurring issues across reviews
  const allLessons = reviews.filter(r => r.lessonsLearned).map(r => r.lessonsLearned!);
  const allWrong = reviews.filter(r => r.whatWentWrong).map(r => r.whatWentWrong!);

  return NextResponse.json({
    reviews: reviews.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project?.name,
      timelineAdherence: r.timelineAdherence,
      budgetVariance: r.budgetVariance,
      clientSatisfaction: r.clientSatisfaction,
      crewPerformance: r.crewPerformance,
      equipmentIssues: r.equipmentIssues,
      lessonsLearned: r.lessonsLearned,
      whatWentWell: r.whatWentWell,
      whatWentWrong: r.whatWentWrong,
      whatToChange: r.whatToChange,
      completedBy: r.completedBy,
      createdAt: r.createdAt,
    })),
    patterns: {
      totalReviews: reviews.length,
      avgTimeline: reviews.length > 0 ? reviews.reduce((s, r) => s + r.timelineAdherence, 0) / reviews.length : 0,
      avgClientSatisfaction: reviews.length > 0 ? reviews.reduce((s, r) => s + r.clientSatisfaction, 0) / reviews.length : 0,
      avgCrewPerformance: reviews.length > 0 ? reviews.reduce((s, r) => s + r.crewPerformance, 0) / reviews.length : 0,
      avgBudgetVariance: reviews.length > 0 ? reviews.reduce((s, r) => s + r.budgetVariance, 0) / reviews.length : 0,
      commonIssues: allWrong.slice(0, 5),
      lessonsList: allLessons.slice(0, 5),
    },
  });
}

// POST — create or update a post-event review
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "create" || body.action === "update") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    const existing = await db.postEventReview.findFirst({ where: { projectId: body.projectId } });
    const data = {
      timelineAdherence: Number(body.timelineAdherence) || 0,
      budgetVariance: Number(body.budgetVariance) || 0,
      clientSatisfaction: Number(body.clientSatisfaction) || 0,
      crewPerformance: Number(body.crewPerformance) || 0,
      equipmentIssues: body.equipmentIssues || null,
      lessonsLearned: body.lessonsLearned || null,
      whatWentWell: body.whatWentWell || null,
      whatWentWrong: body.whatWentWrong || null,
      whatToChange: body.whatToChange || null,
      completedBy: user.name,
    };

    if (existing) {
      const updated = await db.postEventReview.update({ where: { id: existing.id }, data });
      return NextResponse.json({ ok: true, review: updated });
    }

    const created = await db.postEventReview.create({ data: { projectId: body.projectId, ...data } });
    return NextResponse.json({ ok: true, review: created }, { status: 201 });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
