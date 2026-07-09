import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — tax records + compliance dashboard
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const records = await db.taxRecord.findMany({ orderBy: { dueDate: "desc" } });

  const now = new Date();
  const overdue = records.filter(r => r.status === "PENDING" && r.dueDate && new Date(r.dueDate) < now);
  const upcoming = records.filter(r => r.status === "PENDING" && r.dueDate && new Date(r.dueDate) >= now && new Date(r.dueDate) <= new Date(now.getTime() + 14 * 86400000));

  // Auto-generate VAT records from invoices
  const invoices = await db.invoice.findMany();
  const vatDue = invoices.reduce((s, inv) => s + inv.tax, 0);

  return NextResponse.json({
    records: records.map(r => ({
      id: r.id,
      taxType: r.taxType,
      period: r.period,
      amount: r.amount,
      status: r.status,
      dueDate: r.dueDate,
      filedDate: r.filedDate,
      paidDate: r.paidDate,
      notes: r.notes,
    })),
    stats: {
      total: records.length,
      pending: records.filter(r => r.status === "PENDING").length,
      filed: records.filter(r => r.status === "FILED").length,
      paid: records.filter(r => r.status === "PAID").length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      vatDueFromInvoices: vatDue,
    },
    overdue: overdue.map(r => ({ id: r.id, taxType: r.taxType, period: r.period, amount: r.amount, dueDate: r.dueDate })),
    upcoming: upcoming.map(r => ({ id: r.id, taxType: r.taxType, period: r.period, amount: r.amount, dueDate: r.dueDate })),
  });
}

// POST — create/update tax record
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "create") {
    if (!body.taxType || !body.period || !body.amount) {
      return NextResponse.json({ error: "taxType, period, amount required" }, { status: 400 });
    }
    const created = await db.taxRecord.create({
      data: {
        taxType: body.taxType,
        period: body.period,
        amount: Number(body.amount),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ok: true, record: created }, { status: 201 });
  }

  if (body.action === "update") {
    if (!body.recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.filedDate !== undefined) data.filedDate = body.filedDate ? new Date(body.filedDate) : null;
    if (body.paidDate !== undefined) data.paidDate = body.paidDate ? new Date(body.paidDate) : null;
    if (body.notes !== undefined) data.notes = body.notes;
    const updated = await db.taxRecord.update({ where: { id: body.recordId }, data });
    return NextResponse.json({ ok: true, record: updated });
  }

  if (body.action === "delete") {
    if (!body.recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
    await db.taxRecord.delete({ where: { id: body.recordId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
