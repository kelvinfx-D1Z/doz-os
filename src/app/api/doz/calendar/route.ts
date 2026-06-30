import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [projects, tasks, invoices, followUps] = await Promise.all([
    db.project.findMany({ where: { eventDate: { not: null } }, include: { account: true } }),
    db.task.findMany({ where: { dueDate: { not: null }, status: { not: "DONE" } }, include: { assignee: true } }),
    db.invoice.findMany({ where: { dueDate: { not: null }, status: { not: "PAID" } }, include: { account: true } }),
    db.followUp.findMany({ where: { dueDate: { not: null }, completed: false }, include: { contact: true } }),
  ]);

  const events: any[] = [];

  for (const p of projects) {
    events.push({
      id: p.id, type: "PROJECT", title: p.name, date: p.eventDate,
      color: "emerald",
      project: { name: p.name, status: p.status, venue: p.venue },
    });
  }
  for (const t of tasks) {
    events.push({
      id: t.id, type: "TASK", title: t.title, date: t.dueDate,
      color: "teal",
      assignee: t.assignee?.name,
    });
  }
  for (const inv of invoices) {
    events.push({
      id: inv.id, type: "INVOICE", title: `${inv.code ?? "Invoice"} — ${inv.account?.name ?? "Client"}`, date: inv.dueDate,
      color: "amber",
      amount: inv.amount - inv.amountPaid,
    });
  }
  for (const f of followUps) {
    events.push({
      id: f.id, type: "FOLLOWUP", title: f.subject, date: f.dueDate,
      color: "rose",
      contact: f.contact?.name,
    });
  }

  return NextResponse.json({ events });
}

// POST — create a task (which appears on the calendar as an event)
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body.date) return NextResponse.json({ error: "title and date required" }, { status: 400 });

  const created = await db.task.create({
    data: {
      title: String(body.title),
      description: body.description || null,
      dueDate: new Date(body.date),
      assigneeId: user.id,
      creatorId: user.id,
      priority: body.priority || "MEDIUM",
      category: body.category || "OPERATIONAL",
      status: "TODO",
    },
  });

  return NextResponse.json({ ok: true, event: { id: created.id, type: "TASK", title: created.title, date: created.dueDate, color: "teal" } }, { status: 201 });
}
