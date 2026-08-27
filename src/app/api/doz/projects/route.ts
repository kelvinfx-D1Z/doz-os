import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser, canSeeFinancials, isProjectManagerRole } from "@/lib/auth";
import { lineTotal } from "@/lib/pricing";
import { MONEY_EPSILON, collectableAmount } from "@/lib/received-allocation";
import { nextDocumentCode } from "@/lib/document-code";
import {
  isSyntheticInvoice,
  receivedByProject,
  planReceivedReconciliation,
} from "@/lib/invoice-provenance";

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
  // Both FREELANCER and PRODUCTION_MANAGER see only projects they manage.
  const isFreelancer = isProjectManagerRole(user.role);
  // Who may see client-side money (budget, revenue, profit, margin, received).
  // INTERNs coordinate vendors and logistics, so they must still SEE projects —
  // but not what the client pays or what the company makes. Deliberately NOT
  // reusing `isFreelancer` here: that flag also restricts WHICH projects are
  // visible (managerId only), and an intern manages none, so reusing it would
  // show them an empty list instead of hiding a few fields.
  const canSeeCompanyFinancials = canSeeFinancials(user.role);
  const hideMoney = !canSeeCompanyFinancials;

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
    // Same trick for invoices — we only need enough per project to derive
    // "received" without bloating each project row. `isSynthetic` and the
    // line count come along because "received" is not a plain sum: see
    // receivedByProject in @/lib/invoice-provenance.
    db.invoice.findMany({
      where: { projectId: { not: null } },
      select: {
        projectId: true,
        amountPaid: true,
        amount: true,
        expectedCash: true,
        status: true,
        isSynthetic: true,
        _count: { select: { lines: true } },
      },
    }),
  ]);

  // Who proposed each pending project. `createdById` is a plain column with no
  // relation, so resolve the names in one extra query rather than reshaping the
  // schema — same trick used below for expenses and invoices.
  const proposerIds = [...new Set(projects.map((p) => p.createdById).filter((v): v is string => !!v))];
  const proposerNames = new Map<string, string>();
  if (proposerIds.length > 0) {
    const proposers = await db.user.findMany({
      where: { id: { in: proposerIds } },
      select: { id: true, name: true },
    });
    for (const u of proposers) proposerNames.set(u.id, u.name);
  }

  // Build a lookup of expensesTotal per projectId.
  const expensesByProject = new Map<string, number>();
  for (const e of expenses) {
    if (!e.projectId) continue;
    expensesByProject.set(e.projectId, (expensesByProject.get(e.projectId) ?? 0) + e.amount);
  }

  // Build a lookup of received per projectId.
  //
  // NOT a bare sum over every invoice row. A project can carry both a
  // synthetic reconcileReceived placeholder and a real Documents invoice,
  // and summing both reports the same naira twice — the founder types
  // ₦19,000,000 and the project shows ₦38,000,000 with a ₦0 balance, i.e.
  // "client has paid in full". Finance already resolves this; this route
  // must resolve it the SAME way, so both call the one authority in
  // @/lib/invoice-provenance rather than each carrying its own rule.
  const receivedLookup = receivedByProject(
    invoices.map((i) => ({ ...i, linesCount: i._count.lines })),
  );

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
    const received = receivedLookup.get(p.id) ?? 0;
    const balance = Math.max(0, (p.revenue ?? 0) - received);
    const profit = (p.revenue ?? 0) - expensesTotal;
    const margin = p.revenue && p.revenue > 0 ? (profit / p.revenue) * 100 : 0;

    // roll-up stats — proposed work is excluded until the founder approves it.
    // A PENDING project has no agreed budget or contract value, so counting it
    // would drag the totals and the average margin toward zero.
    const countsTowardStats = (p.approvalStatus ?? "APPROVED") === "APPROVED";
    if (countsTowardStats) {
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
    }

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      serviceType: p.serviceType,
      status: p.status,
      eventDate: p.eventDate,
      venue: p.venue,
      // BASE | OFFICIAL — not money, visible to every role. Lets a
      // non-founder viewer of a project's Services List know the cost sheet
      // has been priced and closed without calling the founder-only
      // /api/doz/projects/pricing endpoint.
      pricingStage: p.pricingStage,
      // FREELANCERs (PMs) do NOT see company financials (revenue, budget,
      // profit, margin, received, balance). They only see their project's
      // expenses (their budget) — not what the client paid.
      budget: hideMoney ? undefined : p.budget,
      revenue: hideMoney ? undefined : p.revenue,
      progress: p.progress,
      startDate: p.startDate,
      endDate: p.endDate,
      // accountId is exposed so the Edit Project dialog can pre-select the
      // current client — the nested `account` object has no id.
      approvalStatus: p.approvalStatus,
      createdById: p.createdById,
      createdByName: p.createdById ? proposerNames.get(p.createdById) ?? null : null,
      rejectionNote: p.rejectionNote,
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
      expensesTotal: hideMoney ? undefined : expensesTotal,
      received: hideMoney ? undefined : received,
      balance: hideMoney ? undefined : balance,
      profit: hideMoney ? undefined : profit,
      margin: hideMoney ? undefined : margin,
    };
  });

  const totalProfit = totalRevenue - totalExpenses;
  const avgMargin = marginSamples > 0 ? marginSum / marginSamples : 0;
  // Same reason as the roll-up above: a proposal isn't a project yet.
  const approvedCount = projects.filter(
    (p) => (p.approvalStatus ?? "APPROVED") === "APPROVED",
  ).length;

  // Anyone who may not see company money gets a scoped summary.
  // (Was gated on isFreelancer alone, so INTERNs received the full company
  // revenue/profit/margin aggregate.)
  const stats = hideMoney
    ? {
        total: approvedCount,
        active: activeCount,
        completed: completedCount,
      }
    : {
        total: approvedCount,
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
    // FOUNDER and STAFF create projects outright. A PRODUCTION_MANAGER may
    // also create one, but it arrives PENDING and is not real work until the
    // founder approves it — they are closest to the job and shouldn't have to
    // wait on the founder to start planning, but they don't get to commit the
    // company on their own.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const canCreateOutright = user.role === "FOUNDER" || user.role === "STAFF";
    const canProposeOnly = user.role === "PRODUCTION_MANAGER";
    if (!canCreateOutright && !canProposeOnly) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const needsApproval = !canCreateOutright;

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
    // Money is founder territory. A proposing PM never sends budget or revenue
    // — they cannot see those figures anywhere in the app, so requiring them
    // here would make proposing impossible. The project opens at zero and the
    // founder prices it when they approve. Anything a PM *did* send is
    // discarded rather than trusted.
    let budgetNum = 0;
    let revenueNum = 0;
    if (canCreateOutright) {
      const b = typeof budget === "string" ? Number(budget) : budget;
      const r = typeof revenue === "string" ? Number(revenue) : revenue;
      if (typeof b !== "number" || isNaN(b) || b < 0) {
        return NextResponse.json(
          { error: "Missing or invalid required field: budget (must be a non-negative number)" },
          { status: 400 }
        );
      }
      if (typeof r !== "number" || isNaN(r) || r < 0) {
        return NextResponse.json(
          { error: "Missing or invalid required field: revenue (must be a non-negative number)" },
          { status: 400 }
        );
      }
      budgetNum = b;
      revenueNum = r;
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
        eventDate: eventDateValue,
        venue: venueValue,
        budget: budgetNum,
        revenue: revenueNum,
        progress: 0,
        approvalStatus: needsApproval ? "PENDING" : "APPROVED",
        createdById: user.id,
        approvedById: needsApproval ? null : user.id,
        approvedAt: needsApproval ? null : new Date(),
        // A PM proposing a job manages it by default — they are the one who
        // will run it, and without this they could not see what they created.
        managerId: managerValue ?? (needsApproval ? user.id : null),
      },
      include: {
        account: { select: { id: true, name: true, isStrategic: true } },
        manager: { select: { id: true, name: true } },
      },
    });

    // Services picked at creation become the opening cost sheet, unpriced.
    // This is the point of the picker: the PM starts from a real list rather
    // than an empty project they then have to populate line by line.
    const picked: string[] = Array.isArray(body.serviceNames) ? body.serviceNames : [];
    if (picked.length > 0) {
      await db.projectService.createMany({
        data: picked.slice(0, 200).map((entry) => {
          const [category, ...rest] = String(entry).split("::");
          const serviceName = rest.join("::") || category;
          return {
            projectId: created.id,
            serviceName: serviceName.trim(),
            category: rest.length ? category.trim() : "Other",
            quantity: 1,
            days: 1,
            unitPrice: 0,
            totalPrice: 0,
            status: "LISTED",
            createdBy: user.id,
          };
        }),
      });
    }

    // A template seeds the cost sheet with the shape of a typical job: the
    // sections, the line names, and the quantities and day counts that
    // usually apply. Costs come through only where the template carries a
    // real one — an unpriced line is honest, an invented one is not.
    if (typeof body.templateId === "string" && body.templateId) {
      const tpl = await db.eventTemplate.findUnique({
        where: { id: body.templateId },
        include: { items: { orderBy: [{ sortOrder: "asc" }, { section: "asc" }] } },
      });
      if (tpl) {
        const enabled = tpl.items.filter((i) => i.enabledByDefault);
        if (enabled.length > 0) {
          await db.projectService.createMany({
            data: enabled.map((i) => ({
              projectId: created.id,
              serviceName: i.name,
              category: i.section,
              quantity: i.defaultQuantity,
              days: i.defaultDays,
              unitPrice: i.defaultUnitCost ?? 0,
              totalPrice: lineTotal({
                quantity: i.defaultQuantity,
                days: i.defaultDays,
                price: i.defaultUnitCost ?? 0,
              }),
              status: "LISTED",
              createdBy: user.id,
            })),
          });
        }
        await db.project.update({ where: { id: created.id }, data: { templateId: tpl.id } });
      }
    }

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: needsApproval ? "PROPOSED_PROJECT" : "CREATED_PROJECT",
          entityType: "PROJECT",
          entityId: created.id,
          detail: needsApproval
            ? `${user.name} proposed "${created.name}" with ${picked.length} service line(s) — awaiting founder approval`
            : `Created "${created.name}"`,
        },
      });
    } catch {}

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

/**
 * Reconcile a project's invoices so that sum(amountPaid) === newTotal.
 *
 * The arithmetic itself (delta-only allocation + status/paidDate rules) lives
 * in @/lib/received-allocation so the rollback verification scripts exercise
 * the exact code that ships here. This function is the DB half: it decides
 * what ledger entries must exist, then writes the allocation and its audit
 * trail.
 *
 * If the project already has a REAL, Documents-issued invoice, the received
 * figure is allocated against those real invoices only — a synthetic one is
 * never minted once real invoicing exists for the project. Only a project
 * with no real invoice yet gets the synthetic-invoice fallback: one is
 * created from its revenue figure so the money has somewhere to land (the
 * common case for work invoiced outside the app), and if what's on file
 * can't hold the new total a supplementary synthetic invoice is raised for
 * the shortfall (no screen in this app can edit an invoice amount, so
 * refusing would leave the founder stuck). See the "stop auto-creating once
 * a real invoice exists" ruling in
 * .superpowers/sdd/2026-08-25-client-documents/final-fix-report.md.
 *
 * Runs inside a caller-supplied transaction so the project's own field
 * update and this reconciliation succeed or fail together.
 */
async function reconcileReceived(
  tx: Prisma.TransactionClient,
  projectId: string,
  newTotal: number,
  userId: string,
) {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ReceivedError("Project not found.");

  const invoicesRaw = await tx.invoice.findMany({
    where: { projectId },
    orderBy: { issuedDate: "asc" },
    include: { _count: { select: { lines: true } } },
  });
  // isSyntheticInvoice also falls back to "zero line items" so the four
  // invoices that existed before the isSynthetic column did are still
  // classified correctly without a data-migration backfill — see
  // @/lib/invoice-provenance.
  const invoices = invoicesRaw.map((i) => ({ ...i, linesCount: i._count.lines }));

  async function createInvoice(amount: number) {
    // ONE numbering authority for invoices, shared with the Documents module.
    // This used to mint `INV-${year}-${count()+1}` from a global row count,
    // which is a different series from the DocumentSequence the Documents
    // builder draws on — two schemes minting into a single namespace, so the
    // first Documents invoice of a year would eventually collide with an
    // invoice raised here. nextDocumentCode reserves atomically inside `tx`,
    // so a rolled-back reconciliation does not burn a number either.
    const code = await nextDocumentCode(tx, "INV");
    // Government clients withhold 5% at source, so an auto-created invoice for
    // such a project should only ever expect the net figure in cash.
    const whtRate = project!.isGovernment ? 5 : 0;
    const whtAmount = whtRate > 0 ? (amount * whtRate) / 100 : 0;
    const created = await tx.invoice.create({
      data: {
        code,
        projectId,
        accountId: project!.accountId,
        amount,
        whtRate,
        whtAmount,
        expectedCash: amount - whtAmount,
        status: "SENT",
        amountPaid: 0,
        issuedDate: new Date(),
        isSynthetic: true,
      },
    });
    // synthetic invoices never get line items
    return { ...created, linesCount: 0, _count: { lines: 0 } };
  }

  // A real (Documents-issued) invoice already exists for this project → the
  // received figure allocates against those real invoices FIRST, and the
  // money already parked on the superseded synthetic rows is swept onto them
  // in the same transaction. Never mint a synthetic invoice alongside a real
  // one: that is exactly how a project ends up carrying two invoices for the
  // same money (see Finance finding 1).
  //
  // Leaving the synthetic's amountPaid where it sat — the previous
  // behaviour — is what stranded the money: allocateDelta derives its delta
  // from the list it is handed, so cash on a row excluded from that list is
  // invisible to the delta and yet still summed by every consumer. The
  // founder typed ₦19,000,000 and the project reported ₦38,000,000. The
  // sweep is the fix; planReceivedReconciliation owns it.
  const realInvoices = invoices.filter((i) => !isSyntheticInvoice(i));

  if (realInvoices.length === 0) {
    // No real invoice yet → the legacy synthetic-ledger path, unchanged.
    // No invoice at all yet → create one so there's a ledger entry to pay against.
    if (invoices.length === 0) {
      if (newTotal === 0) return; // nothing received, nothing to record
      invoices.push(await createInvoice(Math.max(project.revenue ?? 0, newTotal)));
    }

    // Not enough invoiced to hold this much money → raise a supplementary
    // synthetic invoice for the shortfall. Appended last, so it is also last
    // in the oldest-first allocation order below.
    const invoiceCapacity = invoices.reduce((sum, i) => sum + collectableAmount(i), 0);
    const shortfall = newTotal - invoiceCapacity;
    if (shortfall > MONEY_EPSILON) {
      invoices.push(await createInvoice(shortfall));
    }
  }

  // One authority for how received money lands — see @/lib/invoice-provenance.
  // `delta` here is measured across EVERY invoice on the project, so the
  // internal sweep from synthetic to real cannot masquerade as a payment.
  const { previousReceived, delta, writes, payments, unallocated } =
    planReceivedReconciliation(invoices, newTotal);

  if (unallocated > MONEY_EPSILON) {
    if (realInvoices.length > 0) {
      // Real invoicing exists — we deliberately do not mint a top-up
      // invoice here (that would recreate the double-count this function
      // exists to prevent). The founder needs to raise the rest through
      // Documents. `unallocated` is what NO invoice on the project can hold,
      // real or synthetic, so the figure quoted is one the founder can act
      // on rather than an artefact of which list was passed where.
      throw new ReceivedError(
        `This project's invoices can only account for ₦${(newTotal - unallocated).toLocaleString("en-NG")} ` +
          `of the ₦${newTotal.toLocaleString("en-NG")} received. Issue an invoice through ` +
          `Documents for the remaining ₦${unallocated.toLocaleString("en-NG")} before recording it.`,
      );
    }
    // Defensive: the capacity top-up above should make this unreachable.
    throw new ReceivedError(
      `Could not apply ₦${Math.abs(delta).toLocaleString("en-NG")} to this project's invoices.`,
    );
  }

  if (writes.length === 0) return; // ledger already says exactly this

  for (const c of writes) {
    await tx.invoice.update({
      where: { id: c.id },
      data: { amountPaid: c.to, status: c.status, paidDate: c.paidDate },
    });
  }

  // Audit trail — one VERIFIED PaymentConfirmation per invoice that received
  // ACTUAL NEW MONEY, attributed to THAT invoice, with a positive amount.
  // `payments` sums to exactly |delta|, so a project whose ledger was merely
  // migrated from a synthetic row onto its real invoice files nothing: this
  // record is rendered to the CLIENT in the portal, and telling a client we
  // verified a payment they did not make is not a rounding error.
  //
  // The direction is NOT recorded in `note` for the same reason — it stays
  // neutral and client-safe. The signed direction lives in the ActivityLog
  // below, which is internal-only.
  for (const c of payments) {
    const moved = Math.abs(c.to - c.from);
    if (moved <= MONEY_EPSILON) continue;
    await tx.paymentConfirmation.create({
      data: {
        invoiceId: c.id,
        accountId: project.accountId,
        amount: moved,
        method: null,
        note:
          delta > 0
            ? "Payment received — recorded by Digit One Zero."
            : "Payment record updated by Digit One Zero.",
        status: "VERIFIED",
      },
    });
  }

  const isPayment = Math.abs(delta) > MONEY_EPSILON;
  await tx.activityLog.create({
    data: {
      userId,
      action: isPayment
        ? delta > 0
          ? "Recorded payment received"
          : "Corrected payment received"
        : "Moved received onto real invoices",
      entityType: "PROJECT",
      entityId: projectId,
      detail:
        `${project.name}: received ₦${previousReceived.toLocaleString("en-NG")} → ` +
        `₦${newTotal.toLocaleString("en-NG")} ` +
        `(${delta >= 0 ? "+" : "-"}₦${Math.abs(delta).toLocaleString("en-NG")}) — ` +
        writes
          .map(
            (c) =>
              `${c.code ?? c.id}: ₦${c.from.toLocaleString("en-NG")} → ` +
              `₦${c.to.toLocaleString("en-NG")}`,
          )
          .join(", "),
    },
  });
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
  // Approve or reject a project a Production Manager proposed. FOUNDER only —
  // this is the gate that decides whether proposed work becomes real work.
  // ------------------------------------------------------------------
  if (body.action === "approve_project" || body.action === "reject_project") {
    if (user.role !== "FOUNDER") {
      return NextResponse.json({ error: "forbidden — only the founder can approve a project" }, { status: 403 });
    }
    if (existing.approvalStatus !== "PENDING") {
      return NextResponse.json(
        { error: `This project is already ${existing.approvalStatus.toLowerCase()}.` },
        { status: 409 },
      );
    }
    const approving = body.action === "approve_project";
    const note = body.note ? String(body.note).trim() : null;
    if (!approving && !note) {
      return NextResponse.json({ error: "Say why you're rejecting it — the PM needs to know what to change." }, { status: 400 });
    }
    const updated = await db.project.update({
      where: { id: body.projectId },
      data: {
        approvalStatus: approving ? "APPROVED" : "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionNote: approving ? null : note,
      },
    });
    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: approving ? "APPROVED_PROJECT" : "REJECTED_PROJECT",
          entityType: "PROJECT",
          entityId: updated.id,
          detail: approving ? `Approved "${updated.name}"` : `Rejected "${updated.name}" — ${note}`,
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, project: { id: updated.id, approvalStatus: updated.approvalStatus } });
  }

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
  //
  // Validated HERE, but applied AFTER the project's own fields are written
  // (below) — a founder who raises revenue and sets received in the same
  // save must have the reconciliation see the NEW revenue, not the old one.
  // ------------------------------------------------------------------
  let receivedTotal: number | null = null;
  if (body.receivedTotal !== undefined && body.receivedTotal !== null) {
    if (!canEditFinancials) {
      return NextResponse.json(
        { error: "Only the founder can record payments received." },
        { status: 403 },
      );
    }
    const parsed = Number(body.receivedTotal);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "Received must be a positive amount." },
        { status: 400 },
      );
    }
    receivedTotal = parsed;
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

  if (receivedTotal === null) {
    const updated = await db.project.update({ where: { id: body.projectId }, data });
    return NextResponse.json({ ok: true, project: updated });
  }

  // Project fields first, then reconcile — both in ONE transaction, so a
  // rejected payment leaves the project untouched too ("nothing was changed"
  // stays true).
  const totalToApply = receivedTotal;
  try {
    const updated = await db.$transaction(
      async (tx) => {
        const project = await tx.project.update({ where: { id: body.projectId }, data });
        await reconcileReceived(tx, body.projectId, totalToApply, user.id);
        return project;
      },
      { timeout: 20000 },
    );
    return NextResponse.json({ ok: true, project: updated });
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

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // ------------------------------------------------------------------
  // FOUNDER-ONLY. Deleting a project permanently destroys crew day
  // rates, vendor cost records, budgets and event-day logs. A project's
  // `managerId` can be any role (STAFF, INTERN, FREELANCER), so gating
  // on "is this project's manager" would let a non-founder wipe the
  // company's cost history. Only the founder may delete.
  // ------------------------------------------------------------------
  if (user.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const existing = await db.project.findUnique({ where: { id: projectId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

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
  // Contracts are DETACHED, not deleted (see below) — they are signed
  // legal records with a fileUrl, signedBy and signedDate.
  //
  // All the tables below are leaves (nothing references them), so a
  // single ordered pass inside one transaction is enough.
  // ------------------------------------------------------------------
  const where = { projectId };
  try {
    await db.$transaction([
      db.budget.deleteMany({ where }),
      db.clientFeedback.deleteMany({ where }),
      // Contracts survive a project deletion. Preserve the client link
      // first (so a project-only contract stays reachable from the
      // account it was signed with), then clear the project link.
      db.contract.updateMany({
        where: { projectId, accountId: null },
        data: { accountId: existing.accountId },
      }),
      db.contract.updateMany({ where: { projectId }, data: { projectId: null } }),
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
