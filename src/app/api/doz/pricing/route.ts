import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — pricing templates (PM sees cost only, founder sees cost + price)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const isFounder = user.role === "FOUNDER";
  const templates = await db.pricingTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    templates: templates.map(t => {
      const base: any = {
        id: t.id,
        name: t.name,
        serviceType: t.serviceType,
        description: t.description,
        baseCost: t.baseCost, // PM can see this
        margin: t.margin,
        lineItems: t.lineItems ? JSON.parse(t.lineItems) : [],
        isActive: t.isActive,
      };
      // FOUNDER can see the selling price; PM/STAFF/INTERN cannot
      if (isFounder) {
        base.basePrice = t.basePrice;
      }
      return base;
    }),
    canSeePricing: isFounder, // flag for the UI
  });
}

// POST — create/update/delete pricing template (FOUNDER only)
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "create") {
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const baseCost = Number(body.baseCost) || 0;
    const basePrice = Number(body.basePrice) || 0;
    const margin = baseCost > 0 ? ((basePrice - baseCost) / baseCost) * 100 : 0;

    const created = await db.pricingTemplate.create({
      data: {
        name: body.name,
        serviceType: body.serviceType || "EVENT_PRODUCTION",
        description: body.description || null,
        baseCost,
        basePrice,
        margin: Math.round(margin * 10) / 10,
        lineItems: body.lineItems ? JSON.stringify(body.lineItems) : "[]",
        isActive: true,
      },
    });
    return NextResponse.json({ ok: true, template: created }, { status: 201 });
  }

  if (body.action === "update") {
    if (!body.templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });
    const existing = await db.pricingTemplate.findUnique({ where: { id: body.templateId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const baseCost = body.baseCost !== undefined ? Number(body.baseCost) : existing.baseCost;
    const basePrice = body.basePrice !== undefined ? Number(body.basePrice) : existing.basePrice;
    const margin = baseCost > 0 ? ((basePrice - baseCost) / baseCost) * 100 : 0;

    const updated = await db.pricingTemplate.update({
      where: { id: body.templateId },
      data: {
        name: body.name || existing.name,
        serviceType: body.serviceType || existing.serviceType,
        description: body.description !== undefined ? body.description : existing.description,
        baseCost,
        basePrice,
        margin: Math.round(margin * 10) / 10,
        lineItems: body.lineItems ? JSON.stringify(body.lineItems) : existing.lineItems,
      },
    });
    return NextResponse.json({ ok: true, template: updated });
  }

  if (body.action === "delete") {
    if (!body.templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });
    await db.pricingTemplate.update({ where: { id: body.templateId }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  }

  // Calculate price from line items (PM uses this — only shows cost, not selling price)
  if (body.action === "calculate_cost") {
    if (!body.lineItems || !Array.isArray(body.lineItems)) {
      return NextResponse.json({ error: "lineItems array required" }, { status: 400 });
    }
    const totalCost = body.lineItems.reduce((s: number, item: any) => {
      return s + (Number(item.cost) || 0) * (Number(item.quantity) || 1);
    }, 0);

    // Return only the cost — the PM does NOT see the selling price or margin
    return NextResponse.json({
      totalCost,
      itemCount: body.lineItems.length,
      // Intentionally NOT returning suggestedPrice or margin
      // The founder sees those; the PM only sees cost
    });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
