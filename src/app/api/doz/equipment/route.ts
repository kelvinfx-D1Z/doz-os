import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — equipment library + project equipment lists
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const [categories, projectEquipment] = await Promise.all([
    db.equipmentCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { name: "asc" } } },
    }),
    projectId ? db.projectEquipment.findMany({
      where: { projectId },
      include: { vendor: true },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
  ]);

  // Compute totals for project equipment
  const totals = projectEquipment.length > 0 ? {
    items: projectEquipment.length,
    totalValue: projectEquipment.reduce((s, e) => s + (e.totalPrice || e.unitPrice * e.quantity), 0),
    priced: projectEquipment.filter(e => e.unitPrice > 0).length,
    approved: projectEquipment.filter(e => e.status === "APPROVED").length,
    paid: projectEquipment.filter(e => e.status === "PAID").length,
  } : { items: 0, totalValue: 0, priced: 0, approved: 0, paid: 0 };

  return NextResponse.json({
    categories: categories.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      items: c.items.map(i => ({ id: i.id, name: i.name, isCustom: i.isCustom })),
    })),
    projectEquipment: projectEquipment.map(e => ({
      id: e.id,
      projectId: e.projectId,
      itemName: e.itemName,
      category: e.category,
      quantity: e.quantity,
      unitPrice: e.unitPrice,
      totalPrice: e.totalPrice || e.unitPrice * e.quantity,
      vendorId: e.vendorId,
      vendorName: e.vendorName,
      vendorContact: e.vendorContact,
      vendorPhone: e.vendorPhone,
      vendorEmail: e.vendorEmail,
      vendorBankDetails: e.vendorBankDetails,
      status: e.status,
      notes: e.notes,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    })),
    totals,
    canManage: user.role === "FOUNDER" || user.role === "STAFF",
  });
}

// POST — add equipment to project, update status, add custom item
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // Add equipment to project
  if (body.action === "add_equipment") {
    if (!body.projectId || !body.itemName) {
      return NextResponse.json({ error: "projectId and itemName required" }, { status: 400 });
    }
    const created = await db.projectEquipment.create({
      data: {
        projectId: body.projectId,
        itemName: body.itemName,
        category: body.category || "Other",
        quantity: Number(body.quantity) || 1,
        unitPrice: Number(body.unitPrice) || 0,
        totalPrice: (Number(body.unitPrice) || 0) * (Number(body.quantity) || 1),
        vendorId: body.vendorId || null,
        vendorName: body.vendorName || null,
        vendorContact: body.vendorContact || null,
        vendorPhone: body.vendorPhone || null,
        vendorEmail: body.vendorEmail || null,
        vendorBankDetails: body.vendorBankDetails || null,
        status: "LISTED",
        notes: body.notes || null,
        createdBy: user.id,
      },
    });
    return NextResponse.json({ ok: true, equipment: created }, { status: 201 });
  }

  // Update equipment (set price, attach vendor, change status)
  if (body.action === "update_equipment") {
    if (!body.equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });
    const existing = await db.projectEquipment.findUnique({ where: { id: body.equipmentId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data: any = {};
    if (body.quantity !== undefined) data.quantity = Number(body.quantity);
    if (body.unitPrice !== undefined) {
      data.unitPrice = Number(body.unitPrice);
      data.totalPrice = data.unitPrice * (existing.quantity || 1);
    }
    if (body.vendorId !== undefined) data.vendorId = body.vendorId || null;
    if (body.vendorName !== undefined) data.vendorName = body.vendorName;
    if (body.vendorContact !== undefined) data.vendorContact = body.vendorContact;
    if (body.vendorPhone !== undefined) data.vendorPhone = body.vendorPhone;
    if (body.vendorEmail !== undefined) data.vendorEmail = body.vendorEmail;
    if (body.vendorBankDetails !== undefined) data.vendorBankDetails = body.vendorBankDetails;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await db.projectEquipment.update({ where: { id: body.equipmentId }, data });
    return NextResponse.json({ ok: true, equipment: updated });
  }

  // Delete equipment
  if (body.action === "delete_equipment") {
    if (!body.equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });
    await db.projectEquipment.delete({ where: { id: body.equipmentId } });
    return NextResponse.json({ ok: true });
  }

  // Add custom item to library
  if (body.action === "add_custom_item") {
    if (!body.categoryId || !body.name) return NextResponse.json({ error: "categoryId and name required" }, { status: 400 });
    const created = await db.equipmentItem.create({
      data: { categoryId: body.categoryId, name: body.name, isCustom: true },
    });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
