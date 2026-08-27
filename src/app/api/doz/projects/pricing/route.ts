import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  suggestOfficialPrice, baseTotal, officialTotal, marginFor, unpricedLines,
  type PricedLine,
} from "@/lib/pricing";

/**
 * Base-price / official-price handover. FOUNDER ONLY, without exception:
 * every figure this route returns is either a client price or a margin.
 */
async function founderOnly() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "FOUNDER") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, pricingStage: true, convertedToOfficialAt: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db.projectService.findMany({
    where: { projectId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  const lines: PricedLine[] = rows.map((r) => ({
    section: r.category, quantity: r.quantity, days: r.days,
    unitPrice: r.unitPrice, clientPrice: r.clientPrice,
  }));
  const base = baseTotal(lines);
  const official = officialTotal(lines);

  return NextResponse.json({
    stage: project.pricingStage,
    convertedAt: project.convertedToOfficialAt,
    lines: rows.map((r) => ({
      id: r.id, serviceName: r.serviceName, section: r.category,
      quantity: r.quantity, days: r.days, status: r.status,
      unitPrice: r.unitPrice, clientPrice: r.clientPrice,
      // A starting point, recomputed on every read so a changed cost is
      // reflected. Never written unless the founder confirms it.
      suggested: suggestOfficialPrice(r.unitPrice, r.category),
    })),
    baseTotal: base,
    officialTotal: official,
    margin: marginFor(base, official),
    unpriced: unpricedLines(lines),
  });
}

export async function POST(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;
  const user = gate.user!;

  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: { id: true, name: true, pricingStage: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "reopen") {
    if (project.pricingStage !== "OFFICIAL") {
      return NextResponse.json({ error: "This project is already open for edits." }, { status: 409 });
    }
    // Prices already set are KEPT. Anything the PM adds while reopened arrives
    // with clientPrice null, so it shows as unpriced when you convert again.
    await db.project.update({
      where: { id: project.id },
      data: { pricingStage: "BASE", convertedToOfficialAt: null, convertedById: null },
    });
    try {
      await db.activityLog.create({
        data: {
          userId: user.id, action: "REOPENED_PRICING", entityType: "PROJECT", entityId: project.id,
          detail: `Reopened "${project.name}" so the cost sheet can be added to`,
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, stage: "BASE" });
  }

  if (body.action !== "convert") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (project.pricingStage === "OFFICIAL") {
    return NextResponse.json({ error: "This project has already been priced." }, { status: 409 });
  }

  const rows = await db.projectService.findMany({ where: { projectId: project.id } });
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "There is nothing to price yet — the cost sheet is empty." },
      { status: 409 },
    );
  }

  // Pricing a job whose costs are not settled produces a margin that is not
  // real, so the budget must be approved first.
  const unapproved = rows.filter((r) => r.status !== "APPROVED").length;
  if (unapproved > 0) {
    return NextResponse.json(
      { error: `${unapproved} cost line(s) are not approved yet. Approve the budget before pricing the job.` },
      { status: 409 },
    );
  }

  const prices: Record<string, unknown> = body.prices ?? {};
  const updates = rows.map((r) => {
    const raw = prices[r.id];
    const n = typeof raw === "string" ? Number(raw) : raw;
    const price = typeof n === "number" && Number.isFinite(n) && n >= 0
      ? n
      : suggestOfficialPrice(r.unitPrice, r.category);
    return { id: r.id, clientPrice: price };
  });

  await db.$transaction([
    ...updates.map((u) =>
      db.projectService.update({ where: { id: u.id }, data: { clientPrice: u.clientPrice } }),
    ),
    db.project.update({
      where: { id: project.id },
      data: { pricingStage: "OFFICIAL", convertedToOfficialAt: new Date(), convertedById: user.id },
    }),
  ]);

  try {
    await db.activityLog.create({
      data: {
        userId: user.id, action: "PRICED_PROJECT", entityType: "PROJECT", entityId: project.id,
        detail: `Priced "${project.name}" and closed the cost sheet`,
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, stage: "OFFICIAL", priced: updates.length });
}
