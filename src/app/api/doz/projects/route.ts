import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
] as const;
type ServiceType = (typeof VALID_SERVICE_TYPES)[number];

function isValidServiceType(s: string): s is ServiceType {
  return (VALID_SERVICE_TYPES as readonly string[]).includes(s);
}

// Map a service type to a short code prefix used when auto-generating
// project codes like EVT-2025-001, VID-2025-014, etc.
const SERVICE_PREFIX: Record<ServiceType, string> = {
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
};

const VALID_STATUSES = ["PLANNING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"];

// ------------------------------------------------------------
// GET — aggregate all projects (P&L + received/balance computed)
// ------------------------------------------------------------
export async function GET() {
  // Single efficient query: one trip to the DB for everything we need.
  const [projects, expenses, invoices] = await Promise.all([
    db.project.findMany({
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
      budget: p.budget,
      revenue: p.revenue,
      progress: p.progress,
      startDate: p.startDate,
      endDate: p.endDate,
      account: p.account
        ? { name: p.account.name, isStrategic: p.account.isStrategic }
        : null,
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
      // computed financial fields
      expensesTotal,
      received,
      balance,
      profit,
      margin,
    };
  });

  const totalProfit = totalRevenue - totalExpenses;
  const avgMargin = marginSamples > 0 ? marginSum / marginSamples : 0;

  return NextResponse.json({
    stats: {
      total: projects.length,
      active: activeCount,
      completed: completedCount,
      totalRevenue,
      totalExpenses,
      totalProfit,
      totalReceived,
      totalBalance,
      avgMargin,
    },
    projects: decorated,
  });
}

// ------------------------------------------------------------
// POST — create a new project
// Body: { name, code?, serviceType, status?, accountId?, managerId?,
//         eventDate?, venue?, budget, revenue }
// ------------------------------------------------------------
export async function POST(req: Request) {
  try {
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
