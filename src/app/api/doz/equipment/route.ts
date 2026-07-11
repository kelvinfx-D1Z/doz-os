import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Equipment API — Full PM Workflow
//
// WORKFLOW:
// 1. Founder creates project + assigns PM (CrewAssignment role=PRODUCTION_MANAGER)
// 2. PM logs in → sees ONLY their assigned project
// 3. PM selects equipment from library, sets costs, attaches vendors (from DB or new)
// 4. PM adds vendor bank details to each equipment item
// 5. PM submits budget (status → BUDGET_SUBMITTED on all items)
// 6. Founder reviews → approves or rejects
// 7. On approval → auto-creates payment requests with vendor bank details
// 8. Founder/accountant releases payments
// ============================================================

// GET — equipment library + project equipment (PM-scoped)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  // If PM/Freelancer: find their assigned project
  let effectiveProjectId = projectId;
  let assignedProjects: string[] = [];

  if (user.role === "FREELANCER") {
    // Find projects where this user is assigned as PRODUCTION_MANAGER
    const assignments = await db.crewAssignment.findMany({
      where: { userId: user.id, role: "PRODUCTION_MANAGER", status: { in: ["ASSIGNED", "CONFIRMED"] } },
      select: { projectId: true },
    });
    assignedProjects = assignments.map(a => a.projectId);

    if (!effectiveProjectId) {
      // PM didn't specify a project — return their assigned projects list
      const projects = await db.project.findMany({
        where: { id: { in: assignedProjects } },
        select: { id: true, name: true, code: true, status: true, eventDate: true, venue: true },
      });
      return NextResponse.json({
        pmProjects: projects,
        categories: [],
        projectEquipment: [],
        totals: { items: 0, totalValue: 0, priced: 0, approved: 0, paid: 0, submitted: 0 },
        canManage: true,
        canApprove: false,
        isPM: true,
      });
    }

    // PM specified a project — verify they're assigned to it
    if (!assignedProjects.includes(effectiveProjectId)) {
      return NextResponse.json({ error: "not_assigned_to_project" }, { status: 403 });
    }
  }

  const [categories, projectEquipment] = await Promise.all([
    db.equipmentCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { name: "asc" } } },
    }),
    effectiveProjectId ? db.projectEquipment.findMany({
      where: { projectId: effectiveProjectId },
      include: { vendor: true },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
  ]);

  const totals = projectEquipment.length > 0 ? {
    items: projectEquipment.length,
    totalValue: projectEquipment.reduce((s, e) => s + (e.totalPrice || e.unitPrice * e.quantity), 0),
    priced: projectEquipment.filter(e => e.unitPrice > 0).length,
    approved: projectEquipment.filter(e => e.status === "APPROVED").length,
    paid: projectEquipment.filter(e => e.status === "PAID").length,
    submitted: projectEquipment.filter(e => e.status === "BUDGET_SUBMITTED").length,
    listed: projectEquipment.filter(e => e.status === "LISTED").length,
  } : { items: 0, totalValue: 0, priced: 0, approved: 0, paid: 0, submitted: 0, listed: 0 };

  // Budget status: is the whole list submitted for approval?
  const budgetStatus = projectEquipment.length > 0
    ? projectEquipment.every(e => e.status === "BUDGET_SUBMITTED" || e.status === "APPROVED" || e.status === "PAID")
      ? projectEquipment.every(e => e.status === "APPROVED" || e.status === "PAID") ? "APPROVED" : "SUBMITTED"
      : "DRAFT"
    : "EMPTY";

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
    budgetStatus,
    canManage: user.role === "FOUNDER" || user.role === "STAFF" || user.role === "FREELANCER",
    canApprove: user.role === "FOUNDER" || user.role === "STAFF",
    isPM: user.role === "FREELANCER",
  });
}

// POST — full PM workflow
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // ===== PM: Add equipment to project =====
  if (body.action === "add_equipment") {
    if (!body.projectId || !body.itemName) {
      return NextResponse.json({ error: "projectId and itemName required" }, { status: 400 });
    }

    // If PM, verify assignment
    if (user.role === "FREELANCER") {
      const assigned = await db.crewAssignment.findFirst({
        where: { userId: user.id, projectId: body.projectId, role: "PRODUCTION_MANAGER" },
      });
      if (!assigned) return NextResponse.json({ error: "not_assigned" }, { status: 403 });
    }

    // If vendorId provided, auto-fill vendor details from database
    let vendorName = body.vendorName || null;
    let vendorContact = body.vendorContact || null;
    let vendorPhone = body.vendorPhone || null;
    let vendorEmail = body.vendorEmail || null;
    let vendorBankDetails = body.vendorBankDetails || null;

    if (body.vendorId) {
      const vendor = await db.vendor.findUnique({ where: { id: body.vendorId } });
      if (vendor) {
        vendorName = vendor.name;
        vendorContact = vendor.contactName;
        vendorPhone = vendor.phone;
        vendorEmail = vendor.email;
        vendorBankDetails = vendor.bankAccount;
      }
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
        vendorName,
        vendorContact,
        vendorPhone,
        vendorEmail,
        vendorBankDetails,
        status: "LISTED",
        notes: body.notes || null,
        createdBy: user.id,
      },
    });
    return NextResponse.json({ ok: true, equipment: created }, { status: 201 });
  }

  // ===== PM: Update equipment (price, vendor, bank details) =====
  if (body.action === "update_equipment") {
    if (!body.equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });
    const existing = await db.projectEquipment.findUnique({ where: { id: body.equipmentId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    // PM can only edit items that are in LISTED status (not submitted/approved)
    if (user.role === "FREELANCER" && existing.status !== "LISTED") {
      return NextResponse.json({ error: "cannot_edit_submitted_item" }, { status: 403 });
    }

    const data: any = {};
    if (body.quantity !== undefined) {
      data.quantity = Number(body.quantity);
      data.totalPrice = (Number(body.unitPrice) || existing.unitPrice) * data.quantity;
    }
    if (body.unitPrice !== undefined) {
      data.unitPrice = Number(body.unitPrice);
      data.totalPrice = data.unitPrice * (existing.quantity || 1);
    }
    if (body.vendorId !== undefined) {
      data.vendorId = body.vendorId || null;
      // Auto-fill from vendor database
      if (body.vendorId) {
        const vendor = await db.vendor.findUnique({ where: { id: body.vendorId } });
        if (vendor) {
          data.vendorName = vendor.name;
          data.vendorContact = vendor.contactName;
          data.vendorPhone = vendor.phone;
          data.vendorEmail = vendor.email;
          data.vendorBankDetails = vendor.bankAccount;
        }
      }
    }
    if (body.vendorName !== undefined) data.vendorName = body.vendorName;
    if (body.vendorContact !== undefined) data.vendorContact = body.vendorContact;
    if (body.vendorPhone !== undefined) data.vendorPhone = body.vendorPhone;
    if (body.vendorEmail !== undefined) data.vendorEmail = body.vendorEmail;
    if (body.vendorBankDetails !== undefined) data.vendorBankDetails = body.vendorBankDetails;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await db.projectEquipment.update({ where: { id: body.equipmentId }, data });
    return NextResponse.json({ ok: true, equipment: updated });
  }

  // ===== PM: Submit budget for approval =====
  if (body.action === "submit_budget") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    // Verify PM is assigned
    if (user.role === "FREELANCER") {
      const assigned = await db.crewAssignment.findFirst({
        where: { userId: user.id, projectId: body.projectId, role: "PRODUCTION_MANAGER" },
      });
      if (!assigned) return NextResponse.json({ error: "not_assigned" }, { status: 403 });
    }

    // Update all LISTED items to BUDGET_SUBMITTED
    const result = await db.projectEquipment.updateMany({
      where: { projectId: body.projectId, status: "LISTED" },
      data: { status: "BUDGET_SUBMITTED" },
    });

    return NextResponse.json({
      ok: true,
      submitted: result.count,
      message: `Budget submitted: ${result.count} items sent for approval`,
    });
  }

  // ===== FOUNDER: Approve budget =====
  if (body.action === "approve_budget") {
    if (user.role !== "FOUNDER" && user.role !== "STAFF") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    // Get all submitted items
    const items = await db.projectEquipment.findMany({
      where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" },
    });

    if (items.length === 0) {
      return NextResponse.json({ error: "no_submitted_items" }, { status: 400 });
    }

    // Approve all items
    await db.projectEquipment.updateMany({
      where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" },
      data: { status: "APPROVED" },
    });

    // Auto-create payment requests for each item with a vendor and bank details
    let paymentsCreated = 0;
    for (const item of items) {
      if (item.vendorName && item.totalPrice > 0) {
        // Check if payment request already exists for this equipment
        const existing = await db.paymentRequest.findFirst({
          where: {
            description: { contains: item.itemName },
            amount: item.totalPrice,
          },
        });

        if (!existing) {
          await db.paymentRequest.create({
            data: {
              code: `PR-EQ-${Date.now().toString().slice(-6)}`,
              projectId: body.projectId,
              amount: item.totalPrice,
              description: `${item.itemName} — ${item.vendorName}${item.vendorBankDetails ? ` (Bank: ${item.vendorBankDetails})` : ""}`,
              status: "PENDING",
              requesterId: user.id,
            },
          });
          paymentsCreated++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      approved: items.length,
      paymentsCreated,
      message: `Budget approved: ${items.length} items. ${paymentsCreated} payment requests created with vendor bank details.`,
    });
  }

  // ===== FOUNDER: Reject budget =====
  if (body.action === "reject_budget") {
    if (user.role !== "FOUNDER" && user.role !== "STAFF") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    if (!body.reason) return NextResponse.json({ error: "reason required" }, { status: 400 });

    // Send items back to LISTED so PM can edit
    await db.projectEquipment.updateMany({
      where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" },
      data: { status: "LISTED", notes: `Rejected: ${body.reason}` },
    });

    return NextResponse.json({ ok: true, message: "Budget rejected and sent back to PM for revision" });
  }

  // ===== Delete equipment =====
  if (body.action === "delete_equipment") {
    if (!body.equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });
    const existing = await db.projectEquipment.findUnique({ where: { id: body.equipmentId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    // PM can only delete LISTED items
    if (user.role === "FREELANCER" && existing.status !== "LISTED") {
      return NextResponse.json({ error: "cannot_delete_submitted_item" }, { status: 403 });
    }

    await db.projectEquipment.delete({ where: { id: body.equipmentId } });
    return NextResponse.json({ ok: true });
  }

  // ===== Add custom item to library =====
  if (body.action === "add_custom_item") {
    if (!body.categoryId || !body.name) return NextResponse.json({ error: "categoryId and name required" }, { status: 400 });
    const created = await db.equipmentItem.create({
      data: { categoryId: body.categoryId, name: body.name, isCustom: true },
    });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  }

  // ===== PM: Add new vendor to database (while building equipment list) =====
  if (body.action === "add_vendor") {
    if (!body.name || !body.category) return NextResponse.json({ error: "name and category required" }, { status: 400 });
    const created = await db.vendor.create({
      data: {
        name: body.name,
        category: body.category,
        contactName: body.contactName || null,
        phone: body.phone || null,
        email: body.email || null,
        bankAccount: body.bankAccount || null,
        isActive: true,
      },
    });
    return NextResponse.json({ ok: true, vendor: { id: created.id, name: created.name } }, { status: 201 });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
