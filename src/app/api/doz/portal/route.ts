import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============================================================
// Client Portal API (DOZ OS — Task P3-C)
//
// A client-facing endpoint (NO DOZ OS login required). The client
// accesses the portal via ?portal=TOKEN where TOKEN is the
// Account.portalToken. We only ever expose client-facing fields —
// never internal costs, profit, team, vendor or expense data.
//
// GET  /api/doz/portal?token=TOKEN
//   → 404 { error: "invalid_token" } if token is missing/inactive
//   → 200 { account, projects[], invoices[], paymentConfirmations[] }
//
// POST /api/doz/portal   { token, action, ...payload }
//   action: "approve_deliverable"  { deliverableId, note? }
//   action: "reject_deliverable"   { deliverableId, note }
//   action: "confirm_payment"      { invoiceId, amount, method, reference?, note? }
//   → 401 { error: "invalid_token" } if token missing/inactive
//   → 200 { ...updated entity }
// ============================================================

const VALID_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH", "CARD"]);

interface PortalAccount {
  id: string;
  name: string;
  industry: string | null;
  isStrategic: boolean;
}

async function resolveAccountByToken(
  token: string
): Promise<PortalAccount | null> {
  if (!token || typeof token !== "string") return null;
  const account = await db.account.findFirst({
    where: { portalToken: token, portalActive: true },
    select: { id: true, name: true, industry: true, isStrategic: true },
  });
  return account ?? null;
}

// ---------- GET ----------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  const account = await resolveAccountByToken(token);
  if (!account) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  // Fetch all client-facing data in parallel.
  const [projects, invoices, accountConfirmations] = await Promise.all([
    db.project.findMany({
      where: { accountId: account.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        deliverables: {
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            dueDate: true,
            clientApproved: true,
            clientApprovedAt: true,
            clientApprovalNote: true,
            clientRejectedAt: true,
            deliveredAt: true,
          },
        },
      },
    }),
    db.invoice.findMany({
      where: {
        OR: [{ accountId: account.id }, { project: { accountId: account.id } }],
      },
      orderBy: { issuedDate: "desc" },
      include: {
        project: { select: { name: true } },
        paymentConfirmations: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            method: true,
            reference: true,
            note: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
    db.paymentConfirmation.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      include: {
        invoice: { select: { code: true } },
      },
    }),
  ]);

  // Shape projects — strip ALL internal fields (budget, revenue, managerId, etc.)
  const shapedProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    serviceType: p.serviceType,
    status: p.status,
    eventDate: p.eventDate,
    venue: p.venue,
    progress: p.progress,
    deliverables: p.deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      dueDate: d.dueDate,
      clientApproved: d.clientApproved,
      clientApprovedAt: d.clientApprovedAt,
      clientApprovalNote: d.clientApprovalNote,
      clientRejectedAt: d.clientRejectedAt,
      deliveredAt: d.deliveredAt,
    })),
  }));

  // Shape invoices — include computed balance, project name, and confirmations
  const shapedInvoices = invoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    amount: inv.amount,
    tax: inv.tax,
    amountPaid: inv.amountPaid,
    balance: Math.max(0, inv.amount - inv.amountPaid),
    status: inv.status,
    issuedDate: inv.issuedDate,
    dueDate: inv.dueDate,
    project: inv.project ? { name: inv.project.name } : null,
    paymentConfirmations: inv.paymentConfirmations.map((pc) => ({
      id: pc.id,
      amount: pc.amount,
      method: pc.method,
      reference: pc.reference,
      note: pc.note,
      status: pc.status,
      createdAt: pc.createdAt,
    })),
  }));

  // Shape top-level confirmations list (for the third tab)
  const shapedConfirmations = accountConfirmations.map((pc) => ({
    id: pc.id,
    invoiceCode: pc.invoice?.code ?? "—",
    amount: pc.amount,
    method: pc.method,
    reference: pc.reference,
    status: pc.status,
    createdAt: pc.createdAt,
  }));

  return NextResponse.json({
    account: {
      name: account.name,
      industry: account.industry,
      isStrategic: account.isStrategic,
    },
    projects: shapedProjects,
    invoices: shapedInvoices,
    paymentConfirmations: shapedConfirmations,
  });
}

// ---------- POST ----------
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 }
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const account = await resolveAccountByToken(token);
  if (!account) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  switch (action) {
    // -------- APPROVE DELIVERABLE --------
    case "approve_deliverable": {
      const deliverableId =
        typeof body.deliverableId === "string" ? body.deliverableId : "";
      if (!deliverableId) {
        return NextResponse.json(
          { error: "missing_deliverableId" },
          { status: 400 }
        );
      }
      const note =
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : null;

      // Look up the deliverable + its project to verify ownership
      const deliverable = await db.deliverable.findUnique({
        where: { id: deliverableId },
        include: { project: { select: { accountId: true } } },
      });
      if (!deliverable) {
        return NextResponse.json(
          { error: "deliverable_not_found" },
          { status: 404 }
        );
      }
      if (deliverable.project.accountId !== account.id) {
        // Not owned by this account — refuse to act
        return NextResponse.json(
          { error: "not_authorized" },
          { status: 403 }
        );
      }

      const now = new Date();
      const newStatus =
        deliverable.status === "REVIEW" ? "DELIVERED" : deliverable.status;

      const updated = await db.deliverable.update({
        where: { id: deliverableId },
        data: {
          clientApproved: true,
          clientApprovedAt: now,
          clientApprovalNote: note,
          clientRejectedAt: null,
          status: newStatus,
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          dueDate: true,
          clientApproved: true,
          clientApprovedAt: true,
          clientApprovalNote: true,
          clientRejectedAt: true,
          deliveredAt: true,
        },
      });

      return NextResponse.json({ deliverable: updated });
    }

    // -------- REJECT DELIVERABLE --------
    case "reject_deliverable": {
      const deliverableId =
        typeof body.deliverableId === "string" ? body.deliverableId : "";
      if (!deliverableId) {
        return NextResponse.json(
          { error: "missing_deliverableId" },
          { status: 400 }
        );
      }
      const note =
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : null;
      if (!note) {
        return NextResponse.json(
          { error: "note_required_for_rejection" },
          { status: 400 }
        );
      }

      const deliverable = await db.deliverable.findUnique({
        where: { id: deliverableId },
        include: { project: { select: { accountId: true } } },
      });
      if (!deliverable) {
        return NextResponse.json(
          { error: "deliverable_not_found" },
          { status: 404 }
        );
      }
      if (deliverable.project.accountId !== account.id) {
        return NextResponse.json(
          { error: "not_authorized" },
          { status: 403 }
        );
      }

      const now = new Date();
      const updated = await db.deliverable.update({
        where: { id: deliverableId },
        data: {
          clientApproved: false,
          clientRejectedAt: now,
          clientApprovalNote: note,
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          dueDate: true,
          clientApproved: true,
          clientApprovedAt: true,
          clientApprovalNote: true,
          clientRejectedAt: true,
          deliveredAt: true,
        },
      });

      return NextResponse.json({ deliverable: updated });
    }

    // -------- CONFIRM PAYMENT --------
    case "confirm_payment": {
      const invoiceId =
        typeof body.invoiceId === "string" ? body.invoiceId : "";
      if (!invoiceId) {
        return NextResponse.json(
          { error: "missing_invoiceId" },
          { status: 400 }
        );
      }
      const amount =
        typeof body.amount === "number" && Number.isFinite(body.amount)
          ? body.amount
          : NaN;
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "invalid_amount" },
          { status: 400 }
        );
      }
      const method =
        typeof body.method === "string" ? body.method : "";
      if (!VALID_METHODS.has(method)) {
        return NextResponse.json(
          { error: "invalid_method" },
          { status: 400 }
        );
      }
      const reference =
        typeof body.reference === "string" && body.reference.trim()
          ? body.reference.trim()
          : null;
      const note =
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : null;

      // Verify the invoice belongs to this account
      const invoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: { project: { select: { accountId: true } } },
      });
      if (!invoice) {
        return NextResponse.json(
          { error: "invoice_not_found" },
          { status: 404 }
        );
      }
      const invoiceOwnedByAccount =
        invoice.accountId === account.id ||
        invoice.project?.accountId === account.id;
      if (!invoiceOwnedByAccount) {
        return NextResponse.json(
          { error: "not_authorized" },
          { status: 403 }
        );
      }

      // Create the confirmation as PENDING — founder verifies first.
      // We deliberately do NOT touch invoice.status or invoice.amountPaid here.
      const confirmation = await db.paymentConfirmation.create({
        data: {
          invoiceId,
          accountId: account.id,
          amount,
          method,
          reference,
          note,
          status: "PENDING",
        },
        select: {
          id: true,
          invoiceId: true,
          amount: true,
          method: true,
          reference: true,
          note: true,
          status: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ confirmation }, { status: 201 });
    }

    default:
      return NextResponse.json(
        { error: "unknown_action", action },
        { status: 400 }
      );
  }
}
