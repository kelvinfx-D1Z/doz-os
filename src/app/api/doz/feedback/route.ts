import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — list feedback (optionally filtered by project)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const feedback = await db.clientFeedback.findMany({
    where: projectId ? { projectId } : undefined,
    include: { project: true, account: true },
    orderBy: { createdAt: "desc" },
  });

  const avgRating = feedback.length > 0 ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;
  const avgSatisfaction = feedback.length > 0 ? feedback.reduce((s, f) => s + (f.satisfactionScore || 0), 0) / feedback.length : 0;
  const wouldRecommendCount = feedback.filter(f => f.wouldRecommend).length;
  const approvedTestimonials = feedback.filter(f => f.testimonialApproved && f.testimonial);

  return NextResponse.json({
    feedback: feedback.map(f => ({
      id: f.id,
      projectId: f.projectId,
      projectName: f.project?.name,
      accountName: f.account?.name,
      rating: f.rating,
      satisfactionScore: f.satisfactionScore,
      whatWentWell: f.whatWentWell,
      whatCouldImprove: f.whatCouldImprove,
      wouldRecommend: f.wouldRecommend,
      testimonial: f.testimonial,
      testimonialApproved: f.testimonialApproved,
      submittedVia: f.submittedVia,
      createdAt: f.createdAt,
    })),
    stats: {
      total: feedback.length,
      avgRating: Math.round(avgRating * 10) / 10,
      avgSatisfaction: Math.round(avgSatisfaction),
      wouldRecommendCount,
      wouldRecommendPct: feedback.length > 0 ? Math.round((wouldRecommendCount / feedback.length) * 100) : 0,
      approvedTestimonials: approvedTestimonials.length,
    },
  });
}

// POST — submit feedback (from portal or manual), approve testimonial
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "submit") {
    // Portal submissions don't require auth (token-based)
    if (!body.projectId || !body.rating) {
      return NextResponse.json({ error: "projectId and rating required" }, { status: 400 });
    }
    const created = await db.clientFeedback.create({
      data: {
        projectId: body.projectId,
        accountId: body.accountId || null,
        rating: Number(body.rating),
        satisfactionScore: body.satisfactionScore ? Number(body.satisfactionScore) : null,
        whatWentWell: body.whatWentWell || null,
        whatCouldImprove: body.whatCouldImprove || null,
        wouldRecommend: body.wouldRecommend ?? null,
        testimonial: body.testimonial || null,
        submittedVia: body.submittedVia || "PORTAL",
      },
    });
    return NextResponse.json({ ok: true, feedback: created }, { status: 201 });
  }

  // Approve testimonial (FOUNDER only)
  if (body.action === "approve_testimonial") {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.feedbackId) return NextResponse.json({ error: "feedbackId required" }, { status: 400 });

    const updated = await db.clientFeedback.update({
      where: { id: body.feedbackId },
      data: { testimonialApproved: true },
    });
    return NextResponse.json({ ok: true, feedback: updated });
  }

  // Delete feedback (FOUNDER only)
  if (body.action === "delete") {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.feedbackId) return NextResponse.json({ error: "feedbackId required" }, { status: 400 });
    await db.clientFeedback.delete({ where: { id: body.feedbackId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
