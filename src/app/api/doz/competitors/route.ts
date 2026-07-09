import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — competitor list
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const competitors = await db.competitor.findMany({ orderBy: { updatedAt: "desc" } });

  return NextResponse.json({
    competitors: competitors.map(c => ({
      id: c.id,
      name: c.name,
      services: c.services,
      pricingRange: c.pricingRange,
      keyClients: c.keyClients,
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      website: c.website,
      linkedin: c.linkedin,
      instagram: c.instagram,
      lastUpdated: c.lastUpdated,
    })),
    stats: { total: competitors.length },
  });
}

// POST — add/update/delete competitor (FOUNDER/STAFF only)
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "create") {
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const created = await db.competitor.create({
      data: {
        name: body.name,
        services: body.services || null,
        pricingRange: body.pricingRange || null,
        keyClients: body.keyClients || null,
        strengths: body.strengths || null,
        weaknesses: body.weaknesses || null,
        website: body.website || null,
        linkedin: body.linkedin || null,
        instagram: body.instagram || null,
        lastUpdated: new Date(),
      },
    });
    return NextResponse.json({ ok: true, competitor: created }, { status: 201 });
  }

  if (body.action === "update") {
    if (!body.competitorId) return NextResponse.json({ error: "competitorId required" }, { status: 400 });
    const existing = await db.competitor.findUnique({ where: { id: body.competitorId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const updated = await db.competitor.update({
      where: { id: body.competitorId },
      data: {
        name: body.name || existing.name,
        services: body.services !== undefined ? body.services : existing.services,
        pricingRange: body.pricingRange !== undefined ? body.pricingRange : existing.pricingRange,
        keyClients: body.keyClients !== undefined ? body.keyClients : existing.keyClients,
        strengths: body.strengths !== undefined ? body.strengths : existing.strengths,
        weaknesses: body.weaknesses !== undefined ? body.weaknesses : existing.weaknesses,
        website: body.website !== undefined ? body.website : existing.website,
        linkedin: body.linkedin !== undefined ? body.linkedin : existing.linkedin,
        instagram: body.instagram !== undefined ? body.instagram : existing.instagram,
        lastUpdated: new Date(),
      },
    });
    return NextResponse.json({ ok: true, competitor: updated });
  }

  if (body.action === "delete") {
    if (!body.competitorId) return NextResponse.json({ error: "competitorId required" }, { status: 400 });
    await db.competitor.delete({ where: { id: body.competitorId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
