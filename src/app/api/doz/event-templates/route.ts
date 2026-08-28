import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canBuildBudget } from "@/lib/auth";

// Reusable service lists. A Production Manager who runs three conferences a
// year should tick the same 20 services once, save it, and reuse it — which is
// exactly how the spreadsheets were actually used: a master list per event
// type, with irrelevant rows left at zero.
//
//   GET  -> templates with their service lines
//   POST -> save a picked list as a named template
//   DELETE -> remove one (creator or founder)

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const templates = await db.eventTemplate.findMany({
    where: { isActive: true },
    include: { items: { orderBy: [{ section: "asc" }, { sortOrder: "asc" }] } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdById: t.createdById,
      // "CATEGORY::Service name" — the same encoding the picker and the project
      // create endpoint use, so a template round-trips without translation.
      services: t.items.map((i) => `${i.section}::${i.name}`),
      // What this template will ACTUALLY seed onto a new project's cost
      // sheet — /api/doz/projects filters on enabledByDefault when creating
      // from a template, so a raw items.length here can promise more lines
      // than land (a disabled complimentary line has no UI to turn back on
      // once the dropdown undercounts it).
      count: t.items.filter((i) => i.enabledByDefault).length,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canBuildBudget(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const services: string[] = Array.isArray(body?.services) ? body.services : [];

  if (!name) return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
  if (services.length === 0) {
    return NextResponse.json({ error: "Pick at least one service before saving" }, { status: 400 });
  }

  const clash = await db.eventTemplate.findUnique({ where: { name } });
  if (clash) {
    return NextResponse.json(
      { error: `A template called "${name}" already exists. Pick another name.` },
      { status: 409 },
    );
  }

  const created = await db.eventTemplate.create({
    data: {
      name,
      description: body?.description ? String(body.description).trim() : null,
      createdById: user.id,
      items: {
        create: services.slice(0, 200).map((entry, i) => {
          const [section, ...rest] = String(entry).split("::");
          return {
            section: rest.length ? section.trim() : "Other",
            name: (rest.join("::") || section).trim(),
            sortOrder: i,
          };
        }),
      },
    },
    include: { items: true },
  });

  return NextResponse.json(
    { ok: true, template: { id: created.id, name: created.name, count: created.items.length } },
    { status: 201 },
  );
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.templateId ?? "").trim();
  if (!id) return NextResponse.json({ error: "templateId required" }, { status: 400 });

  const tpl = await db.eventTemplate.findUnique({ where: { id }, select: { id: true, createdById: true, name: true } });
  if (!tpl) return NextResponse.json({ error: "template not found" }, { status: 404 });

  // Your own, or anything if you're the founder.
  if (user.role !== "FOUNDER" && tpl.createdById !== user.id) {
    return NextResponse.json({ error: "You can only delete templates you created" }, { status: 403 });
  }

  await db.$transaction([
    db.eventTemplateItem.deleteMany({ where: { templateId: id } }),
    db.eventTemplate.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
