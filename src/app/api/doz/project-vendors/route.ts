import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canSeeFinancials } from "@/lib/auth";

// GET — list vendor costs for a project + financial summary
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const canSeeClientMoney = canSeeFinancials(user.role);

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const [vendorCosts, invoices] = await Promise.all([
    db.projectVendorCost.findMany({
      where: { projectId },
      include: { vendor: true },
      orderBy: { createdAt: "desc" },
    }),
    db.invoice.findMany({ where: { projectId } }),
  ]);

  const totalFee = vendorCosts.reduce((s, v) => s + v.fee, 0);
  const totalPaid = vendorCosts.reduce((s, v) => s + v.amountPaid, 0);
  const totalBalance = vendorCosts.reduce((s, v) => s + v.balance, 0);
  const receivedFromClient = invoices.reduce((s, i) => s + i.amountPaid, 0);

  return NextResponse.json({
    vendorCosts: vendorCosts.map((v) => ({
      id: v.id,
      projectId: v.projectId,
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      item: v.item,
      fee: v.fee,
      amountPaid: v.amountPaid,
      balance: v.balance,
      status: v.status,
      approvalStatus: v.approvalStatus,
      submittedById: v.submittedById,
      notes: v.notes,
      vendor: v.vendor ? { name: v.vendor.name, category: v.vendor.category, phone: v.vendor.phone } : null,
    })),
    // What we owe vendors is operational and safe for an operations coordinator.
    // What the CLIENT paid us, and the profit that implies, is not — those are
    // withheld from anyone who is not FOUNDER or STAFF.
    summary: {
      totalFee,
      totalPaid,
      totalBalance,
      receivedFromClient: canSeeClientMoney ? receivedFromClient : undefined,
      projectProfit: canSeeClientMoney ? receivedFromClient - totalPaid : undefined,
    },
  });
}

// POST — add a vendor cost
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const fee = Number(body.fee) || 0;
  const amountPaid = Number(body.amountPaid) || 0;
  const balance = fee - amountPaid;
  const status = amountPaid === 0 ? "UNPAID" : amountPaid >= fee ? "PAID" : "PARTIAL";

  let vendorName = body.vendorName || "Unknown Vendor";
  if (body.vendorId) {
    const vendor = await db.vendor.findUnique({ where: { id: body.vendorId } });
    if (vendor) vendorName = vendor.name;
  }

  // Anyone below FOUNDER may attach a vendor to a project, but it lands PENDING
  // and does not count anywhere until the founder approves it.
  const isFounder = user.role === "FOUNDER";

  const created = await db.projectVendorCost.create({
    data: {
      projectId: body.projectId,
      vendorId: body.vendorId || null,
      vendorName,
      item: body.item || "Service",
      fee,
      amountPaid: isFounder ? amountPaid : 0, // only the founder records payments
      balance: isFounder ? balance : fee,
      status: isFounder ? status : "UNPAID",
      approvalStatus: isFounder ? "APPROVED" : "PENDING",
      submittedById: user.id,
      approvedById: isFounder ? user.id : null,
      approvedAt: isFounder ? new Date() : null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json(
    { ok: true, vendorCost: created, pendingApproval: !isFounder },
    { status: 201 },
  );
}

// PATCH — update a vendor cost
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.costId) return NextResponse.json({ error: "costId required" }, { status: 400 });

  const existing = await db.projectVendorCost.findUnique({ where: { id: body.costId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Approve / reject — FOUNDER only.
  if (body.action === "approve" || body.action === "reject") {
    if (user.role !== "FOUNDER") {
      return NextResponse.json({ error: "forbidden \u2014 founder only" }, { status: 403 });
    }
    const updated = await db.projectVendorCost.update({
      where: { id: body.costId },
      data: {
        approvalStatus: body.action === "approve" ? "APPROVED" : "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, vendorCost: updated });
  }

  // Editing an already-approved cost, or recording payments, is FOUNDER-only.
  if (user.role !== "FOUNDER") {
    if (existing.approvalStatus !== "PENDING" || existing.submittedById !== user.id) {
      return NextResponse.json(
        { error: "You can only edit your own vendor entries while they are awaiting approval." },
        { status: 403 },
      );
    }
    if (body.amountPaid !== undefined) {
      return NextResponse.json({ error: "Only the founder can record payments." }, { status: 403 });
    }
  }

  const fee = body.fee !== undefined ? Number(body.fee) : existing.fee;
  const amountPaid = body.amountPaid !== undefined ? Number(body.amountPaid) : existing.amountPaid;
  const balance = fee - amountPaid;
  const status = amountPaid === 0 ? "UNPAID" : amountPaid >= fee ? "PAID" : "PARTIAL";

  const updated = await db.projectVendorCost.update({
    where: { id: body.costId },
    data: {
      vendorId: body.vendorId !== undefined ? body.vendorId || null : existing.vendorId,
      vendorName: body.vendorName || existing.vendorName,
      item: body.item || existing.item,
      fee,
      amountPaid,
      balance,
      status,
      notes: body.notes !== undefined ? body.notes : existing.notes,
    },
  });

  return NextResponse.json({ ok: true, vendorCost: updated });
}

// DELETE — remove a vendor cost
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.costId) return NextResponse.json({ error: "costId required" }, { status: 400 });

  const target = await db.projectVendorCost.findUnique({ where: { id: body.costId } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role !== "FOUNDER") {
    if (target.approvalStatus !== "PENDING" || target.submittedById !== user.id) {
      return NextResponse.json(
        { error: "You can only remove your own entries while they are awaiting approval." },
        { status: 403 },
      );
    }
  }

  await db.projectVendorCost.delete({ where: { id: body.costId } });
  return NextResponse.json({ ok: true });
}
