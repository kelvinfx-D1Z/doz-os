import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — vendor reviews + scorecards
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get("vendorId");

  const [reviews, vendors] = await Promise.all([
    db.vendorReview.findMany({
      where: vendorId ? { vendorId } : undefined,
      include: { vendor: true, project: true },
      orderBy: { createdAt: "desc" },
    }),
    db.vendor.findMany({ include: { _count: { select: { vendorReviews: true } } } }),
  ]);

  // Build vendor scorecards
  const scorecards = vendors.map(v => {
    const vReviews = reviews.filter(r => r.vendorId === v.id);
    const avgOverall = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.overallScore, 0) / vReviews.length : 0;
    const avgQuality = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.qualityScore, 0) / vReviews.length : 0;
    const avgTimeliness = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.timelinessScore, 0) / vReviews.length : 0;
    const avgProf = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.professionalismScore, 0) / vReviews.length : 0;
    const avgValue = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.valueScore, 0) / vReviews.length : 0;
    return {
      vendorId: v.id,
      vendorName: v.name,
      category: v.category,
      reviewCount: vReviews.length,
      avgOverall: Math.round(avgOverall * 10) / 10,
      avgQuality: Math.round(avgQuality * 10) / 10,
      avgTimeliness: Math.round(avgTimeliness * 10) / 10,
      avgProfessionalism: Math.round(avgProf * 10) / 10,
      avgValue: Math.round(avgValue * 10) / 10,
      isFlagged: avgOverall > 0 && avgOverall < 3,
      isPreferred: avgOverall >= 4,
    };
  });

  return NextResponse.json({
    reviews: reviews.map(r => ({
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendor?.name,
      projectName: r.project?.name,
      qualityScore: r.qualityScore,
      timelinessScore: r.timelinessScore,
      professionalismScore: r.professionalismScore,
      valueScore: r.valueScore,
      overallScore: r.overallScore,
      comments: r.comments,
      reviewedBy: r.reviewedBy,
      createdAt: r.createdAt,
    })),
    scorecards: scorecards.sort((a, b) => b.avgOverall - a.avgOverall),
    stats: {
      totalVendors: vendors.length,
      reviewed: scorecards.filter(s => s.reviewCount > 0).length,
      flagged: scorecards.filter(s => s.isFlagged).length,
      preferred: scorecards.filter(s => s.isPreferred).length,
    },
  });
}

// POST — submit a vendor review
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "review") {
    if (!body.vendorId || !body.qualityScore || !body.timelinessScore || !body.professionalismScore || !body.valueScore) {
      return NextResponse.json({ error: "vendorId and all scores required" }, { status: 400 });
    }
    const q = Number(body.qualityScore), t = Number(body.timelinessScore), p = Number(body.professionalismScore), v = Number(body.valueScore);
    const overall = Math.round(((q + t + p + v) / 4) * 10) / 10;

    const created = await db.vendorReview.create({
      data: {
        vendorId: body.vendorId,
        projectId: body.projectId || null,
        qualityScore: q, timelinessScore: t, professionalismScore: p, valueScore: v,
        overallScore: overall,
        comments: body.comments || null,
        reviewedBy: user.name,
      },
    });

    // Update vendor's overall rating
    const allReviews = await db.vendorReview.findMany({ where: { vendorId: body.vendorId } });
    const avgRating = allReviews.length > 0 ? Math.round(allReviews.reduce((s, r) => s + r.overallScore, 0) / allReviews.length) : 0;
    await db.vendor.update({ where: { id: body.vendorId }, data: { rating: avgRating } });

    return NextResponse.json({ ok: true, review: created }, { status: 201 });
  }

  if (body.action === "delete") {
    if (!body.reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 });
    await db.vendorReview.delete({ where: { id: body.reviewId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
