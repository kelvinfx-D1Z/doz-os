import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — list contracts (optionally filtered by project)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const contracts = await db.contract.findMany({
    where: projectId ? { projectId } : undefined,
    include: { project: true, account: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    contracts: contracts.map(c => ({
      id: c.id,
      projectId: c.projectId,
      projectName: c.project?.name,
      accountId: c.accountId,
      accountName: c.account?.name,
      title: c.title,
      contractNumber: c.contractNumber,
      status: c.status,
      value: c.value,
      startDate: c.startDate,
      endDate: c.endDate,
      signedDate: c.signedDate,
      signedBy: c.signedBy,
      fileUrl: c.fileUrl,
      terms: c.terms,
      notes: c.notes,
      createdAt: c.createdAt,
    })),
    stats: {
      total: contracts.length,
      active: contracts.filter(c => c.status === "ACTIVE").length,
      draft: contracts.filter(c => c.status === "DRAFT").length,
      pending: contracts.filter(c => c.status === "SENT").length,
      expired: contracts.filter(c => c.status === "EXPIRED").length,
    },
  });
}

// POST — create or update a contract
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (body.action === "create") {
    if (!body.projectId || !body.title) {
      return NextResponse.json({ error: "projectId and title required" }, { status: 400 });
    }
    const created = await db.contract.create({
      data: {
        projectId: body.projectId,
        accountId: body.accountId || null,
        title: body.title,
        contractNumber: body.contractNumber || null,
        status: body.status || "DRAFT",
        value: Number(body.value) || 0,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        terms: body.terms || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ ok: true, contract: created }, { status: 201 });
  }

  if (body.action === "update") {
    if (!body.contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });
    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.contractNumber !== undefined) data.contractNumber = body.contractNumber;
    if (body.status !== undefined) data.status = body.status;
    if (body.value !== undefined) data.value = Number(body.value);
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.signedDate !== undefined) data.signedDate = body.signedDate ? new Date(body.signedDate) : null;
    if (body.signedBy !== undefined) data.signedBy = body.signedBy;
    if (body.terms !== undefined) data.terms = body.terms;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.fileUrl !== undefined) data.fileUrl = body.fileUrl;

    const updated = await db.contract.update({ where: { id: body.contractId }, data });
    return NextResponse.json({ ok: true, contract: updated });
  }

  if (body.action === "delete") {
    if (!body.contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });
    await db.contract.delete({ where: { id: body.contractId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
