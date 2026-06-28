import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — list vendor costs for a project + financial summary
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
      notes: v.notes,
      vendor: v.vendor ? { name: v.vendor.name, category: v.vendor.category, phone: v.vendor.phone } : null,
    })),
    summary: {
      totalFee,
      totalPaid,
      totalBalance,
      receivedFromClient,
      projectProfit: receivedFromClient - totalPaid,
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

  const created = await db.projectVendorCost.create({
    data: {
      projectId: body.projectId,
      vendorId: body.vendorId || null,
      vendorName,
      item: body.item || "Service",
      fee,
      amountPaid,
      balance,
      status,
      notes: body.notes || null,
    },
  });

  return NextResponse.json({ ok: true, vendorCost: created }, { status: 201 });
}

// PATCH — update a vendor cost
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.costId) return NextResponse.json({ error: "costId required" }, { status: 400 });

  const existing = await db.projectVendorCost.findUnique({ where: { id: body.costId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

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

  await db.projectVendorCost.delete({ where: { id: body.costId } });
  return NextResponse.json({ ok: true });
}
