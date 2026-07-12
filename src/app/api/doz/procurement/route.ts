import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireStaff } from "@/lib/auth";

// ============================================================
// Procurement & Vendor Management API
// Enforces 3-way segregation: Requester ≠ Approver ≠ Payer
// APPROVE/REJECT/PAY actions are FOUNDER-only; the approverId and
// payerId are derived from the session, NEVER from the request body.
// ============================================================

export async function GET(req: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;
  const now = new Date();

  const [vendors, rfqs, purchaseOrders, paymentRequests, approvals] = await Promise.all([
    db.vendor.findMany({
      include: {
        _count: { select: { quotes: true, pos: true } },
      },
      orderBy: { totalSpent: "desc" },
    }),
    db.rfq.findMany({
      include: {
        project: { select: { name: true } },
        quotes: {
          include: { vendor: { select: { name: true, rating: true } } },
          orderBy: { amount: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.purchaseOrder.findMany({
      include: {
        vendor: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.paymentRequest.findMany({
      include: {
        requester: { select: { name: true, role: true } },
        approver: { select: { name: true, role: true } },
        payer: { select: { name: true, role: true } },
        project: { select: { name: true } },
        purchaseOrder: { select: { code: true } },
      },
      orderBy: { requestedAt: "desc" },
    }),
    db.approval.findMany({
      include: { approver: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // ---------- Stats ----------
  const pendingApprovals = paymentRequests.filter((p) => p.status === "PENDING");
  const pendingPaymentsValue = pendingApprovals.reduce((s, p) => s + p.amount, 0);
  const openRfqs = rfqs.filter((r) => r.status === "OPEN");
  const totalVendorSpend = vendors.reduce((s, v) => s + v.totalSpent, 0);
  const activeVendors = vendors.filter((v) => v.isActive).length;
  const ratedVendors = vendors.filter((v) => v.rating > 0);
  const avgVendorRating =
    ratedVendors.length > 0
      ? ratedVendors.reduce((s, v) => s + v.rating, 0) / ratedVendors.length
      : 0;

  // Overdue payments = APPROVED but not paid for > 3 days, OR PENDING > 7 days
  const overduePayments = paymentRequests.filter((p) => {
    if (p.status === "PAID" || p.status === "REJECTED") return false;
    const age = (now.getTime() - new Date(p.requestedAt).getTime()) / 86400000;
    if (p.status === "PENDING") return age > 7;
    if (p.status === "APPROVED") return age > 3;
    return false;
  });

  // Segregation-of-duties violations
  const segregationViolations = paymentRequests.filter((p) => {
    if (p.status === "PENDING" || p.status === "REJECTED") {
      // not yet routed — only meaningful if approver/payer already assigned
      return p.approverId && p.approverId === p.requesterId;
    }
    const r = p.requesterId;
    const a = p.approverId;
    const y = p.payerId;
    if (a && a === r) return true;
    if (y && y === r) return true;
    if (a && y && a === y) return true;
    return false;
  }).length;

  // ---------- Shape response ----------
  return NextResponse.json({
    stats: {
      pendingApprovals: pendingApprovals.length,
      pendingPaymentsValue,
      openRfqs: openRfqs.length,
      totalVendorSpend,
      activeVendors,
      overduePayments: overduePayments.length,
      segregationViolations,
      avgVendorRating: Number(avgVendorRating.toFixed(2)),
    },
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      contactName: v.contactName,
      phone: v.phone,
      email: v.email,
      rating: v.rating,
      totalSpent: v.totalSpent,
      isActive: v.isActive,
      _count: { quotes: v._count.quotes, pos: v._count.pos },
    })),
    rfqs: rfqs.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      description: r.description,
      category: r.category,
      budget: r.budget,
      status: r.status,
      neededBy: r.neededBy,
      project: r.project ? { name: r.project.name } : null,
      quotes: r.quotes.map((q) => ({
        id: q.id,
        amount: q.amount,
        deliveryDays: q.deliveryDays,
        notes: q.notes,
        isRecommended: q.isRecommended,
        isApproved: q.isApproved,
        vendor: { name: q.vendor.name, rating: q.vendor.rating },
      })),
    })),
    purchaseOrders: purchaseOrders.map((p) => ({
      id: p.id,
      code: p.code,
      vendor: { name: p.vendor.name },
      project: p.project ? { name: p.project.name } : null,
      amount: p.amount,
      description: p.description,
      status: p.status,
      issuedAt: p.issuedAt,
    })),
    paymentRequests: paymentRequests.map((p) => ({
      id: p.id,
      code: p.code,
      amount: p.amount,
      description: p.description,
      status: p.status,
      requesterId: p.requesterId,
      approverId: p.approverId,
      payerId: p.payerId,
      requester: { name: p.requester.name, role: p.requester.role },
      approver: p.approver ? { name: p.approver.name, role: p.approver.role } : null,
      payer: p.payer ? { name: p.payer.name, role: p.payer.role } : null,
      project: p.project ? { name: p.project.name } : null,
      purchaseOrder: p.purchaseOrder ? { code: p.purchaseOrder.code } : null,
      requestedAt: p.requestedAt,
      approvedAt: p.approvedAt,
      paidAt: p.paidAt,
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      decision: a.decision,
      comment: a.comment,
      approver: { name: a.approver.name },
      createdAt: a.createdAt,
    })),
  });
}

// ============================================================
// POST — Approve / Reject / Pay a payment request
// Maintains the segregation-of-duties rules.
// Body: { id: string, action: "APPROVE" | "REJECT" | "PAY", approverId?: string, payerId?: string, comment?: string }
// For demo simplicity we route the acting user via the body; in production this
// comes from the authenticated session. We hard-verify that the acting user
// is NOT the requester (and, for PAY, NOT the approver).
// ============================================================
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ===== Auth: all POST actions require at least a signed-in user =====
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  // ===== Create RFQ =====
  if (body.action === "create_rfq") {
    if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const count = await db.rfq.count();
    const code = `RFQ-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const created = await db.rfq.create({
      data: {
        code,
        projectId: body.projectId || null,
        title: body.title,
        description: body.description || null,
        category: body.category || null,
        budget: Number(body.budget) || null,
        status: "OPEN",
        neededBy: body.neededBy ? new Date(body.neededBy) : null,
      },
    });
    return NextResponse.json({ ok: true, rfq: created }, { status: 201 });
  }

  // ===== Create Purchase Order =====
  if (body.action === "create_po") {
    if (!body.vendorId || !body.amount) return NextResponse.json({ error: "vendorId and amount required" }, { status: 400 });
    const count = await db.purchaseOrder.count();
    const code = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const created = await db.purchaseOrder.create({
      data: {
        code,
        projectId: body.projectId || null,
        vendorId: body.vendorId,
        quoteId: body.quoteId || null,
        amount: Number(body.amount),
        description: body.description || null,
        status: "DRAFT",
      },
    });
    return NextResponse.json({ ok: true, po: created }, { status: 201 });
  }

  const { id, action, comment } = body as {
    id?: string;
    action?: "APPROVE" | "REJECT" | "PAY";
    comment?: string;
  };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  // APPROVE / REJECT / PAY are FOUNDER-only actions. The approverId and
  // payerId come from the session, NEVER from the request body — this
  // prevents privilege escalation and identity spoofing.
  if (user.role !== "FOUNDER") {
    return NextResponse.json(
      { error: "forbidden — only the founder can approve, reject, or pay payment requests" },
      { status: 403 },
    );
  }

  const pr = await db.paymentRequest.findUnique({ where: { id } });
  if (!pr) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }

  if (action === "APPROVE" || action === "REJECT") {
    // Segregation: founder cannot approve their own request
    if (user.id === pr.requesterId) {
      return NextResponse.json(
        { error: "Segregation violation: requester cannot approve their own request" },
        { status: 403 }
      );
    }
    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await db.paymentRequest.update({
      where: { id },
      data: {
        status: newStatus,
        approverId: user.id,
        approvedAt: new Date(),
      },
    });
    await db.approval.create({
      data: {
        entityType: "PAYMENT_REQUEST",
        entityId: id,
        paymentRequestId: id,
        approverId: user.id,
        decision: newStatus,
        comment: comment ?? null,
      },
    });
    return NextResponse.json({ ok: true, paymentRequest: updated });
  }

  if (action === "PAY") {
    // Segregation: founder cannot pay a request they requested or approved
    if (user.id === pr.requesterId) {
      return NextResponse.json(
        { error: "Segregation violation: requester cannot pay their own request" },
        { status: 403 }
      );
    }
    if (pr.approverId && user.id === pr.approverId) {
      return NextResponse.json(
        { error: "Segregation violation: approver cannot pay the request they approved" },
        { status: 403 }
      );
    }
    if (pr.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Payment request must be APPROVED before paying" },
        { status: 400 }
      );
    }
    const updated = await db.paymentRequest.update({
      where: { id },
      data: {
        status: "PAID",
        payerId: user.id,
        paidAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, paymentRequest: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
