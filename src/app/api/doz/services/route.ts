import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, isProjectManagerRole, canBuildBudget, canSeeFinancials } from "@/lib/auth";
import { lineTotal } from "@/lib/pricing";

// Floors to a whole number >= `min`; falls back to `fallback` when the input
// is missing or not a finite number (undefined, NaN, a non-numeric string).
// Used for `quantity` and `days` — both must be whole so the stored `days`
// and the stored `totalPrice` (computed via lineTotal, which itself floors
// days at 1) can never describe different jobs: e.g. `days: -3` stored
// unclamped alongside a total computed as 1 day silently underpays a vendor.
function clampInt(n: unknown, min: number, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(min, Math.floor(v)) : fallback;
}

// Same fallback rule as clampInt but for money — `unitPrice` may be
// fractional (kobo), so it is floored at `min` without rounding to an int.
function clampMoney(n: unknown, min: number, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(min, v) : fallback;
}

// Shapes a ProjectService row for an API response, for every route that
// returns one (GET's list, add_service, update_service). clientPrice is OP —
// founder-only, dropped (not just falsy) from the JSON payload otherwise.
// Centralising this is what stops a future POST handler from returning a raw
// Prisma row and leaking it, the way add_service/update_service used to.
//
// `canSeeVendorBank` has NO default. A defaulted `= true` here is exactly
// how the POST handlers previously leaked vendor bank details: both call
// sites passed only two arguments and silently got the (wrong) permissive
// default. Making the parameter required forces every call site — present
// and future — to compute and pass it explicitly; TypeScript refuses to
// compile a call that forgets it.
function shapeService(s: {
  id: string; projectId: string; serviceName: string; category: string;
  quantity: number; days: number; unitPrice: number; clientPrice: number | null;
  vendorId: string | null; vendorName: string | null; vendorContact: string | null;
  vendorPhone: string | null; vendorEmail: string | null; vendorBankDetails: string | null;
  status: string; notes: string | null; createdBy: string; createdAt: Date;
}, role: string, canSeeVendorBank: boolean) {
  return {
    id: s.id, projectId: s.projectId, serviceName: s.serviceName, category: s.category,
    quantity: s.quantity,
    days: s.days,
    unitPrice: s.unitPrice,
    totalPrice: lineTotal({ quantity: s.quantity, days: s.days, price: s.unitPrice }),
    clientPrice: role === "FOUNDER" ? s.clientPrice : undefined,
    vendorId: s.vendorId, vendorName: s.vendorName, vendorContact: s.vendorContact,
    vendorPhone: s.vendorPhone, vendorEmail: s.vendorEmail,
    // Bank account details are dropped (not just falsy) for anyone without a
    // legitimate need to move money to this vendor — see the access rule in
    // GET, below.
    vendorBankDetails: canSeeVendorBank ? s.vendorBankDetails : undefined,
    status: s.status, notes: s.notes, createdBy: s.createdBy, createdAt: s.createdAt,
  };
}

// ============================================================
// ACCESS RULE for a project's cost sheet — shared by GET (read) below and
// every project-scoped POST mutation further down, so there is exactly one
// definition of who may touch which project (mirrors /api/doz/projects'
// managerId scoping — see isProjectManagerRole there):
//   - FOUNDER, STAFF: any project. They run budget approval and release
//     vendor payments.
//   - PRODUCTION_MANAGER, FREELANCER (isProjectManagerRole): only a
//     project they manage (Project.managerId === user.id) — the same
//     project canBuildBudget already lets a PM edit.
//   - Everyone else (INTERN, a PM/FREELANCER who does not manage this
//     project): refused. No project id at all — the shared service
//     catalogue only — is a separate concern the caller checks first; it
//     stays open to any signed-in user, since it is reference data, not a
//     project's money.
//
// Vendor bank details are a SEPARATE, stricter rule and this function has
// no say over them: see canSeeFinancials in auth.ts — company money is
// FOUNDER-only everywhere, "not staff, not interns, not freelancers", with
// no carve-out for a PM/STAFF user who otherwise has full access to the
// project. Every caller below computes canSeeVendorBank on its own via
// canSeeFinancials(user.role), independent of what this function returns.
// ============================================================
async function requireProjectAccess(
  user: { id: string; role: string },
  projectId: string,
): Promise<NextResponse | null> {
  if (user.role === "FOUNDER" || user.role === "STAFF") return null;
  if (isProjectManagerRole(user.role)) {
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
    if (!proj || proj.managerId !== user.id) {
      return NextResponse.json({ error: "forbidden — you do not manage this project" }, { status: 403 });
    }
    return null;
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

// GET — service library + project services
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  // BP is visible to the people who build budgets. CP is founder-only, the same
  // rule as ProjectService.clientPrice. The catalogue itself stays readable by
  // everyone signed in, because the Section and Description pickers need the
  // names — but an intern must never read the rate card off the back of them.
  const canSeeBP =
    user.role === "FOUNDER" || user.role === "STAFF" || user.role === "PRODUCTION_MANAGER";
  const canSeeCP = canSeeFinancials(user.role); // FOUNDER only

  let canSeeVendorBank = false;
  if (projectId) {
    const denied = await requireProjectAccess(user, projectId);
    if (denied) return denied;
    // FOUNDER-only, full stop — see requireProjectAccess's doc comment.
    canSeeVendorBank = canSeeFinancials(user.role);
  }

  const [categories, projectServices] = await Promise.all([
    db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { name: "asc" } } } }),
    projectId ? db.projectService.findMany({ where: { projectId }, include: { vendor: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);

  const totals = projectServices.length > 0 ? {
    items: projectServices.length,
    totalValue: projectServices.reduce((s, e) => s + lineTotal({ quantity: e.quantity, days: e.days, price: e.unitPrice }), 0),
    priced: projectServices.filter(e => e.unitPrice > 0).length,
    approved: projectServices.filter(e => e.status === "APPROVED").length,
  } : { items: 0, totalValue: 0, priced: 0, approved: 0 };

  return NextResponse.json({
    categories: categories.map(c => ({
      id: c.id, name: c.name, icon: c.icon,
      items: c.items.map(i => ({
        id: i.id, name: i.name, isCustom: i.isCustom,
        standardCost: canSeeBP ? i.standardCost : undefined,
        standardClientRate: canSeeCP ? i.standardClientRate : undefined,
        unit: i.unit,
      })),
    })),
    projectServices: projectServices.map(s => shapeService(s, user.role, canSeeVendorBank)),
    totals,
    canManage: true,
    canApprove: user.role === "FOUNDER" || user.role === "STAFF",
  });
}

// POST — add/update/delete service + submit/approve budget
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // Building the cost sheet is FOUNDER, STAFF or PRODUCTION_MANAGER. An INTERN
  // coordinates vendors but does not own a project budget. Approval stays
  // separate and remains FOUNDER/STAFF (see approve_budget below).
  const BUDGET_ACTIONS = ["add_service", "update_service", "delete_service", "submit_budget", "add_custom_item"];
  if (BUDGET_ACTIONS.includes(body.action) && !canBuildBudget(user.role)) {
    return NextResponse.json({ error: "forbidden — you cannot edit this project budget" }, { status: 403 });
  }

  // Once the founder has converted a project to OFFICIAL they have taken it
  // over: the cost sheet is closed to everyone else. The founder can still
  // edit, and can reopen the project to BASE to let the PM add a late item.
  //
  // `update_service` and `delete_service` act purely on `serviceId` — the
  // handlers below never read `body.projectId` for those two actions, so it
  // is inert to them. It MUST be inert here too: trusting a client-supplied
  // `projectId` would let a caller point the guard at an unrelated BASE
  // project while `serviceId` still targets a line on a real OFFICIAL one,
  // sailing straight through. So for these two actions the project is only
  // ever resolved by following `serviceId` to its actual row — never from
  // the body — and if that resolution fails to find anything, the guard
  // does not run and the action falls through to the handler's own
  // "not found" check, which fails closed on the same missing row.
  //
  // `add_custom_item` writes the global service catalogue (ServiceItem), not
  // a project cost line, and carries no `projectId` at all — the `else`
  // branch below leaves `guardProjectId` undefined for it, so neither this
  // stage lock nor the managed-project scoping just below ever runs for it.
  // A PRODUCTION_MANAGER may add a custom catalogue item regardless of which
  // project (if any) they manage.
  const SHEET_MUTATIONS = ["add_service", "update_service", "delete_service", "submit_budget", "add_custom_item"];
  if (SHEET_MUTATIONS.includes(body.action) && user.role !== "FOUNDER") {
    let guardProjectId: string | undefined;
    if (body.action === "update_service" || body.action === "delete_service") {
      if (body.serviceId) {
        const svc = await db.projectService.findUnique({ where: { id: body.serviceId }, select: { projectId: true } });
        guardProjectId = svc?.projectId;
      }
    } else if (body.action !== "add_custom_item") {
      guardProjectId = body.projectId || undefined;
    }
    if (guardProjectId) {
      // Managed-project scoping: the exact rule GET enforces, reused (not
      // re-implemented) via requireProjectAccess. By this point BUDGET_ACTIONS
      // has already confined `user.role` to FOUNDER/STAFF/PRODUCTION_MANAGER
      // (canBuildBudget excludes FREELANCER/INTERN entirely), and FOUNDER is
      // excluded from this whole block, so only STAFF (unrestricted) and
      // PRODUCTION_MANAGER (must own the project) can still be here.
      if (isProjectManagerRole(user.role)) {
        const denied = await requireProjectAccess(user, guardProjectId);
        if (denied) return denied;
      }
      const proj = await db.project.findUnique({
        where: { id: guardProjectId },
        select: { pricingStage: true, name: true },
      });
      if (proj?.pricingStage === "OFFICIAL") {
        return NextResponse.json(
          { error: `"${proj.name}" has been priced and closed. Ask the founder to reopen it if something needs adding.` },
          { status: 409 },
        );
      }
    }
  }

  if (body.action === "add_service") {
    if (!body.projectId || !body.serviceName) return NextResponse.json({ error: "projectId and serviceName required" }, { status: 400 });
    let vendorName = body.vendorName || null, vendorContact = body.vendorContact || null, vendorPhone = body.vendorPhone || null, vendorEmail = body.vendorEmail || null, vendorBankDetails = body.vendorBankDetails || null;
    if (body.vendorId) { const v = await db.vendor.findUnique({ where: { id: body.vendorId } }); if (v) { vendorName = v.name; vendorContact = v.contactName; vendorPhone = v.phone; vendorEmail = v.email; vendorBankDetails = v.bankAccount; } }
    // Missing/invalid falls back to the prior defaults (1, 1, 0); an
    // explicit value is clamped, not merely defaulted — `x || 1` lets a
    // negative or fractional number straight through, which is the bug
    // this replaces. quantity/days must be whole; unitPrice >= 0 (0 is a
    // legitimate complimentary line, negative is not).
    const quantity = clampInt(body.quantity, 0, 1);
    const days = clampInt(body.days, 1, 1);
    const unitPrice = clampMoney(body.unitPrice, 0, 0);
    const created = await db.projectService.create({
      data: { projectId: body.projectId, serviceName: body.serviceName, category: body.category || "Other",
        quantity, days, unitPrice,
        totalPrice: lineTotal({ quantity, days, price: unitPrice }),
        vendorId: body.vendorId || null, vendorName, vendorContact, vendorPhone, vendorEmail, vendorBankDetails,
        status: "LISTED", notes: body.notes || null, createdBy: user.id },
    });
    return NextResponse.json({ ok: true, service: shapeService(created, user.role, canSeeFinancials(user.role)) }, { status: 201 });
  }

  if (body.action === "update_service") {
    if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });
    const existing = await db.projectService.findUnique({ where: { id: body.serviceId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (isProjectManagerRole(user.role) && existing.status !== "LISTED") return NextResponse.json({ error: "cannot_edit_submitted" }, { status: 403 });
    const data: any = {};
    // Same clamp as add_service: whole quantity/days, unitPrice >= 0. When
    // the supplied value is invalid (not a finite number) the existing
    // stored value is kept rather than silently zeroing/defaulting it.
    if (body.quantity !== undefined) data.quantity = clampInt(body.quantity, 0, existing.quantity);
    if (body.days !== undefined) data.days = clampInt(body.days, 1, existing.days);
    if (body.unitPrice !== undefined) data.unitPrice = clampMoney(body.unitPrice, 0, existing.unitPrice);
    if (data.quantity !== undefined || data.days !== undefined || data.unitPrice !== undefined) {
      // Recompute from the full resulting line, not just whichever field
      // changed — a quantity-only edit must still carry the row's existing
      // `days` into the total, or a multi-day line silently collapses back
      // to a single day (and approve_budget then underpays the vendor).
      data.totalPrice = lineTotal({
        quantity: data.quantity ?? existing.quantity,
        days: data.days ?? existing.days,
        price: data.unitPrice ?? existing.unitPrice,
      });
    }
    if (body.vendorId !== undefined) { data.vendorId = body.vendorId || null; if (body.vendorId) { const v = await db.vendor.findUnique({ where: { id: body.vendorId } }); if (v) { data.vendorName = v.name; data.vendorContact = v.contactName; data.vendorPhone = v.phone; data.vendorEmail = v.email; data.vendorBankDetails = v.bankAccount; } } }
    if (body.vendorName !== undefined) data.vendorName = body.vendorName;
    if (body.vendorContact !== undefined) data.vendorContact = body.vendorContact;
    if (body.vendorPhone !== undefined) data.vendorPhone = body.vendorPhone;
    if (body.vendorEmail !== undefined) data.vendorEmail = body.vendorEmail;
    if (body.vendorBankDetails !== undefined) data.vendorBankDetails = body.vendorBankDetails;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;
    const updated = await db.projectService.update({ where: { id: body.serviceId }, data });
    return NextResponse.json({ ok: true, service: shapeService(updated, user.role, canSeeFinancials(user.role)) });
  }

  if (body.action === "delete_service") {
    if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });
    const existing = await db.projectService.findUnique({ where: { id: body.serviceId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (isProjectManagerRole(user.role) && existing.status !== "LISTED") return NextResponse.json({ error: "cannot_delete_submitted" }, { status: 403 });
    await db.projectService.delete({ where: { id: body.serviceId } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "submit_budget") {
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const result = await db.projectService.updateMany({ where: { projectId: body.projectId, status: "LISTED" }, data: { status: "BUDGET_SUBMITTED" } });
    return NextResponse.json({ ok: true, submitted: result.count });
  }

  if (body.action === "approve_budget") {
    if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!body.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const items = await db.projectService.findMany({ where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" } });
    await db.projectService.updateMany({ where: { projectId: body.projectId, status: "BUDGET_SUBMITTED" }, data: { status: "APPROVED" } });
    let paymentsCreated = 0;
    for (const item of items) {
      if (item.vendorName && item.totalPrice > 0) {
        // Scoped to THIS project. Templates guarantee byte-identical service
        // names, quantities and day counts across projects, so an unscoped
        // description+amount match treats two different conferences' "Complete
        // Audio System" line as the same payment and silently skips the
        // second project's vendor payment request.
        const existing = await db.paymentRequest.findFirst({ where: { projectId: body.projectId, description: { contains: item.serviceName }, amount: item.totalPrice } });
        if (!existing) {
          await db.paymentRequest.create({ data: { code: `PR-SV-${Date.now().toString().slice(-6)}`, projectId: body.projectId, amount: item.totalPrice, description: `${item.serviceName} — ${item.vendorName}${item.vendorBankDetails ? ` (Bank: ${item.vendorBankDetails})` : ""}`, status: "PENDING", requesterId: user.id } });
          paymentsCreated++;
        }
      }
    }
    return NextResponse.json({ ok: true, approved: items.length, paymentsCreated });
  }

  if (body.action === "add_custom_item") {
    if (!body.categoryId || !body.name) return NextResponse.json({ error: "categoryId and name required" }, { status: 400 });
    const created = await db.serviceItem.create({ data: { categoryId: body.categoryId, name: body.name, isCustom: true } });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  }

  // ============================================================
  // CATALOGUE MANAGEMENT — departments (ServiceCategory) and their
  // services (ServiceItem). FOUNDER only: this is company-wide reference
  // data, not a per-project decision, so it does not go through
  // canBuildBudget (which lets STAFF/PRODUCTION_MANAGER build a cost
  // sheet) or the narrower add_custom_item above (a production manager's
  // one-off item for their own project, unaffected by everything below).
  //
  // Safety property: nothing in the database references ServiceItem by id.
  // InvoiceLine.description, QuotationLine.description and
  // ProjectService.serviceName all store the service name as plain text,
  // captured at the moment the line was created — the only relation to
  // ServiceItem anywhere in prisma/schema.prisma is ServiceCategory.items.
  // So renaming or deleting a catalogue entry here can never alter or
  // break a document already issued: an invoice keeps the words it was
  // issued with, forever, regardless of what the catalogue looks like
  // afterwards. That is what makes it safe to hand this editor to the
  // founder with no developer in the loop.
  // ============================================================
  const CATALOGUE_ACTIONS = [
    "catalogue_add_department", "catalogue_rename_department", "catalogue_delete_department",
    "catalogue_add_item", "catalogue_rename_item", "catalogue_delete_item",
    "catalogue_set_rates",
  ];
  if (CATALOGUE_ACTIONS.includes(body.action) && user.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden — only the founder can edit the catalogue" }, { status: 403 });
  }

  if (body.action === "catalogue_add_department") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    const all = await db.serviceCategory.findMany({ select: { id: true, name: true, sortOrder: true } });
    if (all.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `A department named "${name}" already exists` }, { status: 400 });
    }
    const nextSort = all.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    try {
      const created = await db.serviceCategory.create({ data: { name, sortOrder: nextSort } });
      return NextResponse.json({ ok: true, category: { id: created.id, name: created.name, icon: created.icon, items: [] } }, { status: 201 });
    } catch (e: any) {
      if (e?.code === "P2002") return NextResponse.json({ error: `A department named "${name}" already exists` }, { status: 400 });
      throw e;
    }
  }

  if (body.action === "catalogue_rename_department") {
    if (!body.categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    const existing = await db.serviceCategory.findUnique({ where: { id: body.categoryId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const all = await db.serviceCategory.findMany({ select: { id: true, name: true } });
    if (all.some((c) => c.id !== body.categoryId && c.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `A department named "${name}" already exists` }, { status: 400 });
    }
    try {
      const updated = await db.serviceCategory.update({ where: { id: body.categoryId }, data: { name } });
      return NextResponse.json({ ok: true, category: updated });
    } catch (e: any) {
      if (e?.code === "P2002") return NextResponse.json({ error: `A department named "${name}" already exists` }, { status: 400 });
      throw e;
    }
  }

  if (body.action === "catalogue_delete_department") {
    if (!body.categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    const existing = await db.serviceCategory.findUnique({ where: { id: body.categoryId }, include: { items: true } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.items.length > 0) {
      return NextResponse.json({
        error: `"${existing.name}" still has ${existing.items.length} service${existing.items.length === 1 ? "" : "s"} — move or delete ${existing.items.length === 1 ? "it" : "them"} first, then delete the department`,
      }, { status: 400 });
    }
    await db.serviceCategory.delete({ where: { id: body.categoryId } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "catalogue_add_item") {
    if (!body.categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Service name is required" }, { status: 400 });
    const category = await db.serviceCategory.findUnique({ where: { id: body.categoryId }, include: { items: true } });
    if (!category) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (category.items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `"${name}" already exists under ${category.name}` }, { status: 400 });
    }
    const created = await db.serviceItem.create({ data: { categoryId: body.categoryId, name, isCustom: false } });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  }

  if (body.action === "catalogue_rename_item") {
    if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Service name is required" }, { status: 400 });
    const existing = await db.serviceItem.findUnique({ where: { id: body.itemId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const siblings = await db.serviceItem.findMany({ where: { categoryId: existing.categoryId }, select: { id: true, name: true } });
    if (siblings.some((i) => i.id !== body.itemId && i.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `"${name}" already exists in this department` }, { status: 400 });
    }
    const updated = await db.serviceItem.update({ where: { id: body.itemId }, data: { name } });
    return NextResponse.json({ ok: true, item: updated });
  }

  if (body.action === "catalogue_delete_item") {
    if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
    const existing = await db.serviceItem.findUnique({ where: { id: body.itemId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await db.serviceItem.delete({ where: { id: body.itemId } });
    return NextResponse.json({ ok: true });
  }

  // The rate card. FOUNDER only (gated above via CATALOGUE_ACTIONS) — BP and
  // CP are set here, independently of one another, and a rate of 0 is a real
  // (complimentary) price: only an explicit null clears one. See parseRate.
  if (body.action === "catalogue_set_rates") {
    const itemId = String(body.itemId ?? "").trim();
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
    const item = await db.serviceItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    // A rate of 0 is a real price — a complimentary line. Only null clears one.
    const parseRate = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;            // not being changed
      if (v === null || v === "") return null;          // deliberately cleared
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return undefined; // ignore nonsense
      return n;
    };

    const data: Record<string, unknown> = {};
    const cost = parseRate(body.standardCost);
    const rate = parseRate(body.standardClientRate);
    if (cost !== undefined) { data.standardCost = cost; data.costUpdatedAt = new Date(); }
    if (rate !== undefined) { data.standardClientRate = rate; data.rateUpdatedAt = new Date(); }
    if (typeof body.unit === "string" && body.unit.trim()) data.unit = body.unit.trim();

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    const updated = await db.serviceItem.update({ where: { id: itemId }, data });
    return NextResponse.json({
      ok: true,
      item: {
        id: updated.id, name: updated.name, unit: updated.unit,
        standardCost: updated.standardCost, standardClientRate: updated.standardClientRate,
      },
    });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
