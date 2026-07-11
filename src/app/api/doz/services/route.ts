import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — service library + project services
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const [categories, projectServices] = await Promise.all([
    db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { name: "asc" } } } }),
    projectId ? db.projectService.findMany({ where: { projectId }, include: { vendor: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);

  const totals = projectServices.length > 0 ? {
    items: projectServices.length,
    totalValue: projectServices.reduce((s, e) => s + (e.totalPrice || e.unitPrice * e.quantity), 0),
    priced: projectServices.filter(e => e.unitPrice > 0).length,
    approved: projectServices.filter(e => e.status === "APPROVED").length,
  } : { items: 0, totalValue: 0, priced: 0, approved: 0 };

  return NextResponse.json({
    categories: categories.map(c => ({
      id: c.id, name: c.name, icon: c.icon,
      items: c.items.map(i => ({ id: i.id, name: i.name, isCustom: i.isCustom })),
    })),
    projectServices: projectServices.map(s => ({
      id: s.id, projectId: s.projectId, serviceName: s.serviceName, category: s.category,
      quantity: s.quantity, unitPrice: s.unitPrice, totalPrice: s.totalPrice || s.unitPrice * s.quantity,
      vendorId: s.vendorId, vendorName: s.vendorName, vendorContact: s.vendorContact,
      vendorPhone: s.vendorPhone, vendorEmail: s.vendorEmail, vendorBankDetails: s.vendorBankDetails,
      status: s.status, notes: s.notes, createdBy: s.createdBy, createdAt: s.createdAt,
    })),
    totals,
    canManage: true,
    canApprove: user.role === "FOUNDER" || user.role === "STAFF",
  });
}

// POST — add/update/delete service + submit/approve budget
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "add_service") {
    if (!body.projectId || !body.serviceName) return NextResponse.json({ error: "projectId and serviceName required" }, { status: 400 });
    let vendorName = body.vendorName || null, vendorContact = body.vendorContact || null, vendorPhone = body.vendorPhone || null, vendorEmail = body.vendorEmail || null, vendorBankDetails = body.vendorBankDetails || null;
    if (body.vendorId) { const v = await db.vendor.findUnique({ where: { id: body.vendorId } }); if (v) { vendorName = v.name; vendorContact = v.contactName; vendorPhone = v.phone; vendorEmail = v.email; vendorBankDetails = v.bankAccount; } }
    const created = await db.projectService.create({
      data: { projectId: body.projectId, serviceName: body.serviceName, category: body.category || "Other",
        quantity: Number(body.quantity) || 1, unitPrice: Number(body.unitPrice) || 0,
        totalPrice: (Number(body.unitPrice) || 0) * (Number(body.quantity) || 1),
        vendorId: body.vendorId || null, vendorName, vendorContact, vendorPhone, vendorEmail, vendorBankDetails,
        status: "LISTED", notes: body.notes || null, createdBy: user.id },
    });
    return NextResponse.json({ ok: true, service: created }, { status: 201 });
  }

  if (body.action === "update_service") {
    if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });
    const existing = await db.projectService.findUnique({ where: { id: body.serviceId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (user.role === "FREELANCER" && existing.status !== "LISTED") return NextResponse.json({ error: "cannot_edit_submitted" }, { status: 403 });
    const data: any = {};
    if (body.quantity !== undefined) { data.quantity = Number(body.quantity); data.totalPrice = (Number(body.unitPrice) || existing.unitPrice) * data.quantity; }
    if (body.unitPrice !== undefined) { data.unitPrice = Number(body.unitPrice); data.totalPrice = data.unitPrice * (existing.quantity || 1); }
    if (body.vendorId !== undefined) { data.vendorId = body.vendorId || null; if (body.vendorId) { const v = await db.vendor.findUnique({ where: { id: body.vendorId } }); if (v) { data.vendorName = v.name; data.vendorContact = v.contactName; data.vendorPhone = v.phone; data.vendorEmail = v.email; data.vendorBankDetails = v.bankAccount; } } }
    if (body.vendorName !== undefined) data.vendorName = body.vendorName;
    if (body.vendorContact !== undefined) data.vendorContact = body.vendorContact;
    if (body.vendorPhone !== undefined) data.vendorPhone = body.vendorPhone;
    if (body.vendorEmail !== undefined) data.vendorEmail = body.vendorEmail;
    if (body.vendorBankDetails !== undefined) data.vendorBankDetails = body.vendorBankDetails;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;
    const updated = await db.projectService.update({ where: { id: body.serviceId }, data });
    return NextResponse.json({ ok: true, service: updated });
  }

  if (body.action === "delete_service") {
    if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });
    const existing = await db.projectService.findUnique({ where: { id: body.serviceId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (user.role === "FREELANCER" && existing.status !== "LISTED") return NextResponse.json({ error: "cannot_delete_submitted" }, { status: 403 });
    await db.projectService.delete({ where: { id: body.serviceId } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "submit_budget") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const result = await db.projectService.updateMany({ where: { projectId: body.projectId, status: "LISTED" }, data: { status: "BUDGET_SUBMITTED" } });
    return NextResponse.json({ ok: true, submitted: result.count });
  }

  if (body.action === "approve_budget") {
    if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const items = await db.projectService.findMany({ where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" } });
    await db.projectService.updateMany({ where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" }, data: { status: "APPROVED" } });
    let paymentsCreated = 0;
    for (const item of items) {
      if (item.vendorName && item.totalPrice > 0) {
        const existing = await db.paymentRequest.findFirst({ where: { description: { contains: item.serviceName }, amount: item.totalPrice } });
        if (!existing) {
          await db.paymentRequest.create({ data: { code: `PR-SV-${Date.now().toString().slice(-6)}`, projectId: body.projectId, amount: item.totalPrice, description: `${item.serviceName} — ${item.vendorName}${item.vendorBankDetails ? ` (Bank: ${item.vendorBankDetails})` : ""}`, status: "PENDING", requesterId: user.id } });
          paymentsCreated++;
        }
      }
    }
    return NextResponse.json({ ok: true, approved: items.length, paymentsCreated });
  }

  if (body.action === "add_custom_item") {
    if (!body.categoryId || !body.name) return NextResponse.json({ error: "categoryId and name required" }, { status: 400 });
    const created = await db.serviceItem.create({ data: { categoryId: body.categoryId, name: body.name, isCustom: true } });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
