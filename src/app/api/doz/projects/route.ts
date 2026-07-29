import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// PROJECTS & EVENT OPERATIONS API
//   GET  /api/doz/projects  -> aggregate all projects with crew,
//                              milestones, deliverables, related
//                              counts and per-project P&L computed
//                              in JS (now includes received/balance).
//   POST /api/doz/projects  -> create a new project. Required body:
//                              name, serviceType, budget, revenue.
// ============================================================

const VALID_SERVICE_TYPES = [
  "EVENT_PRODUCTION",
  "VIDEO_PRODUCTION",
  "CONFERENCE_PRODUCTION",
  "EVENT_MANAGEMENT",
  "TITLE_SEQUENCE",
  "COLOR_GRADING",
  "PHOTOGRAPHY",
  "DOCUMENTARY",
  "CORPORATE_VIDEO",
  "MOTION_GRAPHICS",
  "LIVESTREAM",
  "POST_PRODUCTION",
  "EXHIBITION_BOOTH",
  "CONSULTANCY",
  "OTHERS",
] as const;
type ServiceType = string;

function isValidServiceType(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if ((VALID_SERVICE_TYPES as readonly string[]).includes(trimmed)) return true;
  return /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed);
}

// Map a service type to a short code prefix used when auto-generating
// project codes like EVT-2025-001, VID-2025-014, etc.
const SERVICE_PREFIX: Record<string, string> = {
  EVENT_PRODUCTION: "EVT",
  EVENT_MANAGEMENT: "EVT",
  CONFERENCE_PRODUCTION: "CONF",
  VIDEO_PRODUCTION: "VID",
  CORPORATE_VIDEO: "VID",
  DOCUMENTARY: "DOC",
  TITLE_SEQUENCE: "TITLE",
  COLOR_GRADING: "GRADE",
  MOTION_GRAPHICS: "MOG",
  LIVESTREAM: "LIVE",
  POST_PRODUCTION: "POST",
  PHOTOGRAPHY: "PHOTO",
  EXHIBITION_BOOTH: "EXH",
  CONSULTANCY: "CONS",
  OTHERS: "PRJ",
};

const VALID_STATUSES = ["PLANNING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"];

// ------------------------------------------------------------
// GET — aggregate all projects (P&L + received/balance computed)
// ------------------------------------------------------------
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isFounder = user.role === "FOUNDER";
  const isFreelancer = user.role === "FREELANCER";

  // FREELANCERs (PMs) only see projects they manage. Founders and staff
  // see all projects. This prevents a PM from reading other PMs' financials.
  const projectWhere = isFreelancer ? { managerId: user.id } : undefined;

  // Single efficient query: one trip to the DB for everything we need.
  const [projects, expenses, invoices] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
      include: {
        account: { select: { id: true, name: true, isStrategic: true } },
        manager: { select: { id: true, name: true } },
        crew: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        milestones: { orderBy: { dueDate: "asc" } },
        deliverables: { orderBy: { dueDate: "asc" } },
        _count: { select: { tasks: true, invoices: true, expenses: true } },
      },
    }),
    // Pull expenses separately and group in JS — keeps the include graph lean
    // and lets us compute totals per project in one pass.
    db.expense.findMany({
      where: { projectId: { not: null } },
      select: { projectId: true, amount: true },
    }),
    // Same trick for invoices — we only need amountPaid per project so we can
    // compute "received" (sum of amountPaid) without bloating each project row.
    db.invoice.findMany({
      where: { projectId: { not: null } },
      select: { projectId: true, amountPaid: true, amount: true, status: true },
    }),
  ]);

  // Build a lookup of expensesTotal per projectId.
  const expensesByProject = new Map<string, number>();
  for (const e of expenses) {
    if (!e.projectId) continue;
    expensesByProject.set(e.projectId, (expensesByProject.get(e.projectId) ?? 0) + e.amount);
  }

  // Build a lookup of received (sum of amountPaid) per projectId.
  const receivedByProject = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.projectId) continue;
    receivedByProject.set(inv.projectId, (receivedByProject.get(inv.projectId) ?? 0) + (inv.amountPaid ?? 0));
  }

  // Compute per-project profit/margin and decorate payload.
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalReceived = 0;
  let totalBalance = 0;
  let activeCount = 0;
  let completedCount = 0;
  let marginSum = 0; // for averaging margins across revenue-generating projects
  let marginSamples = 0;

  const decorated = projects.map((p) => {
    const expensesTotal = expensesByProject.get(p.id) ?? 0;
    const received = receivedByProject.get(p.id) ?? 0;
    const balance = Math.max(0, (p.revenue ?? 0) - received);
    const profit = (p.revenue ?? 0) - expensesTotal;
    const margin = p.revenue && p.revenue > 0 ? (profit / p.revenue) * 100 : 0;

    // roll-up stats
    totalRevenue += p.revenue ?? 0;
    totalExpenses += expensesTotal;
    totalReceived += received;
    totalBalance += balance;
    if (["PLANNING", "CONFIRMED", "IN_PROGRESS"].includes(p.status)) activeCount += 1;
    if (p.status === "COMPLETED") completedCount += 1;
    if (p.revenue && p.revenue > 0) {
      marginSum += margin;
      marginSamples += 1;
    }

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      serviceType: p.serviceType,
      status: p.status,
      eventDate: p.eventDate,
      venue: p.venue,
      // FREELANCERs (PMs) do NOT see company financials (revenue, budget,
      // profit, margin, received, balance). They only see their project's
      // expenses (their budget) — not what the client paid.
      budget: isFreelancer ? undefined : p.budget,
      revenue: isFreelancer ? undefined : p.revenue,
      progress: p.progress,
      startDate: p.startDate,
      endDate: p.endDate,
      // accountId is exposed so the Edit Project dialog can pre-select the
      // current client — the nested `account` object has no id.
      accountId: p.accountId,
      account: p.account
        ? { name: p.account.name, isStrategic: p.account.isStrategic }
        : null,
      managerId: p.managerId,
      manager: p.manager ? { name: p.manager.name } : null,
      crew: p.crew.map((c) => ({
        id: c.id,
        role: c.role,
        status: c.status,
        dayRate: c.dayRate,
        user: { name: c.user.name },
      })),
      milestones: p.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        dueDate: m.dueDate,
        status: m.status,
        completedAt: m.completedAt,
      })),
      deliverables: p.deliverables.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        status: d.status,
        dueDate: d.dueDate,
        clientApproved: d.clientApproved,
        deliveredAt: d.deliveredAt,
      })),
      _count: p._count,
      // computed financial fields — hidden from FREELANCERs
      expensesTotal: isFreelancer ? undefined : expensesTotal,
      received: isFreelancer ? undefined : received,
      balance: isFreelancer ? undefined : balance,
      profit: isFreelancer ? undefined : profit,
      margin: isFreelancer ? undefined : margin,
    };
  });

  const totalProfit = totalRevenue - totalExpenses;
  const avgMargin = marginSamples > 0 ? marginSum / marginSamples : 0;

  // FREELANCERs get a scoped summary (no company financials)
  const stats = isFreelancer
    ? {
        total: projects.length,
        active: activeCount,
        completed: completedCount,
      }
    : {
        total: projects.length,
        active: activeCount,
        completed: completedCount,
        totalRevenue,
        totalExpenses,
        totalProfit,
        totalReceived,
        totalBalance,
        avgMargin,
      };

  return NextResponse.json({ stats, projects: decorated });
}

// ------------------------------------------------------------
// POST — create a new project
// Body: { name, code?, serviceType, status?, accountId?, managerId?,
//         eventDate?, venue?, budget, revenue }
// ------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // Auth: only FOUNDER and STAFF can create projects.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "FOUNDER" && user.role !== "STAFF") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      name,
      code,
      serviceType,
      status,
      accountId,
      managerId,
      eventDate,
      venue,
      budget,
      revenue,
    } = body as {
      name?: unknown;
      code?: unknown;
      serviceType?: unknown;
      status?: unknown;
      accountId?: unknown;
      managerId?: unknown;
      eventDate?: unknown;
      venue?: unknown;
      budget?: unknown;
      revenue?: unknown;
    };

    // ---- Validate required fields ----
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }
    if (typeof serviceType !== "string" || !isValidServiceType(serviceType)) {
      return NextResponse.json(
        {
          error: `Invalid serviceType. Must be one of: ${VALID_SERVICE_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    const budgetNum = typeof budget === "string" ? Number(budget) : budget;
    const revenueNum = typeof revenue === "string" ? Number(revenue) : revenue;
    if (typeof budgetNum !== "number" || isNaN(budgetNum) || budgetNum < 0) {
      return NextResponse.json(
        { error: "Missing or invalid required field: budget (must be a non-negative number)" },
        { status: 400 }
      );
    }
    if (typeof revenueNum !== "number" || isNaN(revenueNum) || revenueNum < 0) {
      return NextResponse.json(
        { error: "Missing or invalid required field: revenue (must be a non-negative number)" },
        { status: 400 }
      );
    }

    // ---- Validate optional fields ----
    let statusValue = "PLANNING";
    if (status !== undefined && status !== null && status !== "") {
      if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      statusValue = status;
    }

    let eventDateValue: Date | null = null;
    if (eventDate !== undefined && eventDate !== null && eventDate !== "") {
      const d = new Date(eventDate as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid eventDate (must be ISO date string)" },
          { status: 400 }
        );
      }
      eventDateValue = d;
    }

    let venueValue: string | null = null;
    if (venue !== undefined && venue !== null) {
      if (typeof venue !== "string") {
        return NextResponse.json(
          { error: "Invalid venue (must be a string)" },
          { status: 400 }
        );
      }
      venueValue = venue.trim() || null;
    }

    let accountValue: string | null = null;
    if (accountId !== undefined && accountId !== null && accountId !== "") {
      if (typeof accountId !== "string") {
        return NextResponse.json(
          { error: "Invalid accountId (must be a string)" },
          { status: 400 }
        );
      }
      accountValue = accountId;
    }

    let managerValue: string | null = null;
    if (managerId !== undefined && managerId !== null && managerId !== "") {
      if (typeof managerId !== "string") {
        return NextResponse.json(
          { error: "Invalid managerId (must be a string)" },
          { status: 400 }
        );
      }
      managerValue = managerId;
    }

    // ---- Optional: verify account & manager exist (warn softly if not) ----
    if (accountValue) {
      const acc = await db.account.findUnique({ where: { id: accountValue }, select: { id: true } });
      if (!acc) {
        return NextResponse.json(
          { error: `Account not found for id=${accountValue}` },
          { status: 404 }
        );
      }
    }
    if (managerValue) {
      const mgr = await db.user.findUnique({ where: { id: managerValue }, select: { id: true } });
      if (!mgr) {
        return NextResponse.json(
          { error: `Manager (User) not found for id=${managerValue}` },
          { status: 404 }
        );
      }
    }

    // ---- Determine project code ----
    let finalCode: string | null = null;
    if (typeof code === "string" && code.trim()) {
      finalCode = code.trim();
    } else {
      // Auto-generate: PREFIX-YYYY-<count padded to 3 digits>
      // Count = current total project count + 1.
      const prefix = SERVICE_PREFIX[serviceType] ?? "PRJ";
      const year = new Date().getFullYear();
      const existingCount = await db.project.count();
      const seq = (existingCount + 1).toString().padStart(3, "0");
      finalCode = `${prefix}-${year}-${seq}`;
    }

    // ---- Create the project ----
    const created = await db.project.create({
      data: {
        name: name.trim(),
        code: finalCode,
        serviceType,
        status: statusValue,
        accountId: accountValue,
        managerId: managerValue,
        eventDate: eventDateValue,
        venue: venueValue,
        budget: budgetNum,
        revenue: revenueNum,
        progress: 0,
      },
      include: {
        account: { select: { id: true, name: true, isStrategic: true } },
        manager: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      {
        project: {
          id: created.id,
          name: created.name,
          code: created.code,
          serviceType: created.serviceType,
          status: created.status,
          eventDate: created.eventDate,
          venue: created.venue,
          budget: created.budget,
          revenue: created.revenue,
          progress: created.progress,
          startDate: created.startDate,
          endDate: created.endDate,
          account: created.account
            ? {
                name: created.account.name,
                isStrategic: created.account.isStrategic,
              }
            : null,
          manager: created.manager ? { name: created.manager.name } : null,
          // newly created — no expenses or invoices yet
          received: 0,
          balance: created.revenue,
          expensesTotal: 0,
          profit: created.revenue - 0,
          margin:
            created.revenue && created.revenue > 0
              ? ((created.revenue - 0) / created.revenue) * 100
              : 0,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/doz/projects] error:", err);
    return NextResponse.json(
      { error: "Failed to create project", detail: message },
      { status: 500 }
    );
  }
}

// PATCH — update a project (including managerId for PM assignment)
// ====================================================================
// RECEIVED / PAYMENT RECONCILIATION
// ====================================================================

/** An error whose message is safe to show the founder in a toast. */
class ReceivedError extends Error {}

/** Recompute an invoice's status from its amounts — mirrors verify_payment. */
function invoiceStatusFor(amount: number, amountPaid: number, current: string) {
  const balance = amount - amountPaid;
  if (balance <= 0.0001 && amountPaid > 0) {
    return { status: "PAID", paidDate: new Date() as Date | null };
  }
  if (amountPaid > 0) return { status: "PARTIAL", paidDate: null };
  // Back to nothing paid — fall back to SENT unless it was still a draft.
  return { status: current === "DRAFT" ? "DRAFT" : "SENT", paidDate: null };
}

/**
 * Reconcile a project's invoices so that sum(amountPaid) === newTotal.
 *
 * Applies the difference oldest-invoice-first (a client paying down their
 * bills settles the oldest one first). If the project has no invoice yet,
 * one is created from its revenue figure so the money has somewhere to land
 * — this is the common case for work invoiced outside the app.
 */
async function reconcileReceived(projectId: string, newTotal: number, userId: string) {
  await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ReceivedError("Project not found.");

    let invoices = await tx.invoice.findMany({
      where: { projectId },
      orderBy: { issuedDate: "asc" },
    });

    // No invoice yet → create one so there's a ledger entry to pay against.
    if (invoices.length === 0) {
      if (newTotal === 0) return; // nothing received, nothing to record
      const invoiceAmount = Math.max(project.revenue ?? 0, newTotal);
      const year = new Date().getFullYear();
      const count = await tx.invoice.count();
      const created = await tx.invoice.create({
        data: {
          code: `INV-${year}-${String(count + 1).padStart(3, "0")}`,
          projectId,
          accountId: project.accountId,
          amount: invoiceAmount,
          status: "SENT",
          amountPaid: 0,
          issuedDate: new Date(),
        },
      });
      invoices = [created];
    }

    const invoiceCapacity = invoices.reduce((sum, i) => sum + i.amount, 0);
    if (newTotal - invoiceCapacity > 0.0001) {
      throw new ReceivedError(
        `Received (₦${newTotal.toLocaleString("en-NG")}) is more than this project has been invoiced ` +
          `(₦${invoiceCapacity.toLocaleString("en-NG")}). Raise the invoice or the project's revenue first.`,
      );
    }

    const currentTotal = invoices.reduce((sum, i) => sum + (i.amountPaid ?? 0), 0);
    const delta = newTotal - currentTotal;
    if (Math.abs(delta) < 0.0001) return; // no change

    // Spread the new total across invoices, oldest first, capped at each amount.
    let remaining = newTotal;
    for (const inv of invoices) {
      const paidHere = Math.min(inv.amount, Math.max(0, remaining));
      remaining -= paidHere;
      if (Math.abs(paidHere - (inv.amountPaid ?? 0)) < 0.0001) continue;
      const { status, paidDate } = invoiceStatusFor(inv.amount, paidHere, inv.status);
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: paidHere, status, paidDate: paidDate ?? inv.paidDate },
      });
    }

    // Audit trail — same shape as a client-confirmed, founder-verified payment.
    await tx.paymentConfirmation.create({
      data: {
        invoiceId: invoices[0].id,
        accountId: project.accountId,
        amount: delta,
        method: null,
        note:
          delta > 0
            ? "Payment recorded by founder from Projects & Events"
            : "Received amount corrected down by founder from Projects & Events",
        status: "VERIFIED",
      },
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: delta > 0 ? "Recorded payment received" : "Corrected payment received",
        entityType: "PROJECT",
        entityId: projectId,
        detail:
          `${project.name}: received set to ₦${newTotal.toLocaleString("en-NG")} ` +
          `(${delta > 0 ? "+" : ""}₦${delta.toLocaleString("en-NG")})`,
      },
    });
  }, { timeout: 20000 });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const existing = await db.project.findUnique({ where: { id: body.projectId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Permission: FOUNDER can edit anything. STAFF can edit projects they manage.
  // FREELANCERs can only edit projects they manage (and only non-financial fields).
  // INTERNs cannot edit projects.
  const isFounder = user.role === "FOUNDER";
  const isManager = existing.managerId === user.id;
  if (!isFounder && !isManager) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // FREELANCERs cannot change financial fields (budget, revenue) — only the founder can.
  const canEditFinancials = isFounder;

  // ------------------------------------------------------------------
  // "Received" — money actually collected from the client.
  //
  // There is no `received` column: every screen derives it from
  // sum(Invoice.amountPaid). So setting it here reconciles the invoice
  // ledger to the figure the founder typed, using the SAME rules as the
  // client-portal verification path in /api/doz/reminders (verify_payment):
  //   balance <= 0        -> PAID   (+ paidDate)
  //   amountPaid > 0      -> PARTIAL
  // A VERIFIED PaymentConfirmation is written for each adjustment so the
  // money has an audit trail, exactly like a client-confirmed payment.
  //
  // FOUNDER-only: this moves money in the books.
  // ------------------------------------------------------------------
  if (body.receivedTotal !== undefined && body.receivedTotal !== null) {
    if (!canEditFinancials) {
      return NextResponse.json(
        { error: "Only the founder can record payments received." },
        { status: 403 },
      );
    }
    const newTotal = Number(body.receivedTotal);
    if (!Number.isFinite(newTotal) || newTotal < 0) {
      return NextResponse.json(
        { error: "Received must be a positive amount." },
        { status: 400 },
      );
    }

    try {
      await reconcileReceived(body.projectId, newTotal, user.id);
    } catch (err) {
      const message =
        err instanceof ReceivedError
          ? err.message
          : "Could not record the payment. Nothing was changed.";
      if (!(err instanceof ReceivedError)) {
        console.error("[projects] receivedTotal failed for", body.projectId, err);
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.code !== undefined) data.code = body.code;
  if (body.serviceType !== undefined) data.serviceType = body.serviceType;
  if (body.status !== undefined) data.status = body.status;
  if (body.eventDate !== undefined) data.eventDate = body.eventDate ? new Date(body.eventDate) : null;
  if (body.venue !== undefined) data.venue = body.venue;
  if (canEditFinancials && body.budget !== undefined) data.budget = Number(body.budget);
  if (canEditFinancials && body.revenue !== undefined) data.revenue = Number(body.revenue);
  // Only FOUNDER can reassign manager or account
  if (isFounder && body.managerId !== undefined) data.managerId = body.managerId || null;
  if (isFounder && body.accountId !== undefined) data.accountId = body.accountId || null;
  if (body.progress !== undefined) data.progress = Number(body.progress);

  const updated = await db.project.update({ where: { id: body.projectId }, data });
  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const existing = await db.project.findUnique({ where: { id: projectId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isFounder = user.role === "FOUNDER";
  const isManager = existing.managerId === user.id;
  if (!isFounder && !isManager) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ------------------------------------------------------------------
  // Delete project-owned child records FIRST, then the project itself.
  //
  // WHY: every FK below is declared without `onDelete`, so Postgres uses
  // RESTRICT for required relations. A bare `db.project.delete()` always
  // threw a foreign-key violation for any project that had a budget,
  // milestone, deliverable, crew member, etc. — which is every real
  // project — and the UI just showed "Failed to delete project".
  //
  // Records NOT listed here have an optional `projectId` (SET NULL), so
  // Postgres detaches them automatically and they survive on purpose:
  // Invoice, Expense, PaymentRequest, PurchaseOrder, Rfq, Task,
  // TimeEntry and VendorReview stay in the books as financial/audit
  // history with their project link cleared.
  //
  // All the tables below are leaves (nothing references them), so a
  // single ordered pass inside one transaction is enough.
  // ------------------------------------------------------------------
  const where = { projectId };
  try {
    await db.$transaction([
      db.budget.deleteMany({ where }),
      db.clientFeedback.deleteMany({ where }),
      db.contract.deleteMany({ where }),
      db.crewAssignment.deleteMany({ where }),
      db.deliverable.deleteMany({ where }),
      db.eventDayLog.deleteMany({ where }),
      db.eventDayStatus.deleteMany({ where }),
      db.milestone.deleteMany({ where }),
      db.postEventReview.deleteMany({ where }),
      db.projectEquipment.deleteMany({ where }),
      db.projectService.deleteMany({ where }),
      db.projectVendorCost.deleteMany({ where }),
      db.resourceBooking.deleteMany({ where }),
      db.project.delete({ where: { id: projectId } }),
    ]);
  } catch (err) {
    // Surface a real message instead of an opaque 500 so the toast is useful.
    console.error("[projects] DELETE failed for", projectId, err);
    return NextResponse.json(
      { error: "Could not delete this project. Nothing was removed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
