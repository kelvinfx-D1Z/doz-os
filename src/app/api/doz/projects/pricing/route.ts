import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  suggestOfficialPrice, baseTotal, officialTotal, marginFor, unpricedLines,
  type PricedLine,
} from "@/lib/pricing";

/**
 * Base-price / official-price handover. FOUNDER ONLY, without exception:
 * every figure this route returns is either a client price or a margin.
 */
async function founderOnly() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "FOUNDER") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

// Thrown from inside a $transaction to abort it and report a 409 to the
// caller without committing any of the transaction's writes. Using an
// exception (rather than a sentinel return value) is what makes Prisma roll
// the whole transaction back — see convert/reopen below.
class ConflictError extends Error {}

// A cost line is "settled" once its vendor has been committed to — APPROVED
// and everything downstream of it (ORDERED, DELIVERED, PAID) is more settled
// than APPROVED, not less, and must not block pricing. Only a line still
// waiting on approval (LISTED, BUDGET_SUBMITTED) is actually outstanding.
const UNSETTLED_STATUSES = new Set(["LISTED", "BUDGET_SUBMITTED"]);

export async function GET(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, pricingStage: true, convertedToOfficialAt: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db.projectService.findMany({
    where: { projectId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  const lines: PricedLine[] = rows.map((r) => ({
    section: r.category, quantity: r.quantity, days: r.days,
    unitPrice: r.unitPrice, clientPrice: r.clientPrice,
  }));
  const base = baseTotal(lines);
  const official = officialTotal(lines);

  // ============================================================
  // A published rate beats the section-multiplier formula: a stage does
  // not mark up like a camera, and some services are sold as a fixed
  // package rather than as a multiple of what they cost. Where the
  // catalogue has a standardClientRate for this line's service, that wins;
  // otherwise fall back to suggestOfficialPrice's cost x section-markup.
  //
  // ProjectService.serviceName/category are plain text, entered by a human
  // (typed or picked from the catalogue, which then copies the words in —
  // see the "safety property" comment in services/route.ts). Matching
  // against ServiceItem.name/ServiceCategory.name is therefore
  // case-insensitive and ignores leading/trailing whitespace, but nothing
  // fuzzier than that: a near-miss falls back to MARKUP rather than
  // guessing, because a wrong match would price a line off some other
  // service's rate — worse than the formula.
  //
  // One query for every line: the distinct (name, category) pairs used on
  // this budget are collected first and fetched together, rather than
  // querying per line (this route renders every line of a budget, so a
  // per-line query would be a real N+1).
  // ============================================================
  const distinctNames = [...new Set(rows.map((r) => r.serviceName.trim()).filter(Boolean))];
  const distinctCategories = [...new Set(rows.map((r) => r.category.trim()).filter(Boolean))];

  const rateCardItems = distinctNames.length > 0 && distinctCategories.length > 0
    ? await db.serviceItem.findMany({
        where: {
          name: { in: distinctNames, mode: "insensitive" },
          category: { name: { in: distinctCategories, mode: "insensitive" } },
        },
        select: { name: true, standardClientRate: true, category: { select: { name: true } } },
      })
    : [];

  const rateKey = (name: string, category: string) => `${name.trim().toLowerCase()}|${category.trim().toLowerCase()}`;

  const rateCardMap = new Map<string, number | null>();
  for (const item of rateCardItems) {
    rateCardMap.set(rateKey(item.name, item.category.name), item.standardClientRate);
  }

  return NextResponse.json({
    stage: project.pricingStage,
    convertedAt: project.convertedToOfficialAt,
    lines: rows.map((r) => {
      const publishedRate = rateCardMap.get(rateKey(r.serviceName, r.category));
      // A published rate of 0 is a deliberate complimentary price (see
      // src/lib/rate-card.ts), not an absent one — checking !== null &&
      // !== undefined (never truthiness) is what keeps a real free line
      // from being quietly marked up to a formula price.
      const hasPublishedRate = publishedRate !== null && publishedRate !== undefined;
      const suggested = hasPublishedRate ? publishedRate : suggestOfficialPrice(r.unitPrice, r.category);
      const suggestedSource: "RATE_CARD" | "MARKUP" = hasPublishedRate ? "RATE_CARD" : "MARKUP";
      return {
        id: r.id, serviceName: r.serviceName, section: r.category,
        quantity: r.quantity, days: r.days, status: r.status,
        unitPrice: r.unitPrice, clientPrice: r.clientPrice,
        // A starting point, recomputed on every read so a changed cost (or
        // a newly published rate) is reflected. Never written unless the
        // founder confirms it.
        suggested,
        suggestedSource,
      };
    }),
    baseTotal: base,
    officialTotal: official,
    margin: marginFor(base, official),
    unpriced: unpricedLines(lines),
  });
}

export async function POST(req: Request) {
  const gate = await founderOnly();
  if (gate.error) return gate.error;
  const user = gate.user!;

  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: { id: true, name: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "reopen") {
    try {
      await db.$transaction(async (tx) => {
        // The guard ("is this project OFFICIAL?") and the write that flips it
        // back to BASE happen as one conditional statement against the DB,
        // not a separate read followed by a write. Two racing reopen POSTs
        // can both start believing the project is OFFICIAL, but only the
        // first `updateMany` can match `pricingStage: "OFFICIAL"` before it
        // commits — the second finds nothing left to match and is refused
        // rather than silently re-doing (or corrupting) the transition.
        const flipped = await tx.project.updateMany({
          where: { id: project.id, pricingStage: "OFFICIAL" },
          data: { pricingStage: "BASE", convertedToOfficialAt: null, convertedById: null },
        });
        if (flipped.count === 0) {
          throw new ConflictError("This project is already open for edits.");
        }
      });
    } catch (e) {
      if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }

    // Prices already set are KEPT — this transaction never touches
    // ProjectService rows. Anything the PM adds while reopened arrives with
    // clientPrice null, so it shows as unpriced when you convert again.
    try {
      await db.activityLog.create({
        data: {
          userId: user.id, action: "REOPENED_PRICING", entityType: "PROJECT", entityId: project.id,
          detail: `Reopened "${project.name}" so the cost sheet can be added to`,
        },
      });
    } catch {}
    return NextResponse.json({ ok: true, stage: "BASE" });
  }

  if (body.action !== "convert") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  let pricedCount = 0;
  try {
    pricedCount = await db.$transaction(async (tx) => {
      const rows = await tx.projectService.findMany({ where: { projectId: project.id } });
      if (rows.length === 0) {
        throw new ConflictError("There is nothing to price yet — the cost sheet is empty.");
      }

      // Pricing a job whose costs are not settled produces a margin that is
      // not real. APPROVED and anything further along (ORDERED, DELIVERED,
      // PAID) counts as settled; only a line still awaiting approval blocks
      // conversion.
      const outstanding = rows.filter((r) => UNSETTLED_STATUSES.has(r.status)).length;
      if (outstanding > 0) {
        throw new ConflictError(
          `${outstanding} cost line(s) are still awaiting approval. Approve the budget before pricing the job.`,
        );
      }

      const prices: Record<string, unknown> = body.prices ?? {};
      const updates = rows.map((r) => {
        const raw = prices[r.id];
        const n = typeof raw === "string" ? Number(raw) : raw;
        const price = typeof n === "number" && Number.isFinite(n) && n >= 0
          ? n
          : suggestOfficialPrice(r.unitPrice, r.category);
        return { id: r.id, clientPrice: price };
      });

      // Same conditional-write guard as reopen, mirrored: the transition to
      // OFFICIAL only commits if this transaction is the one that finds the
      // project still non-OFFICIAL at write time. It runs BEFORE the line
      // price writes below, so a request that loses the race never touches
      // clientPrice — the winner's prices are the only ones that land.
      const flipped = await tx.project.updateMany({
        where: { id: project.id, pricingStage: { not: "OFFICIAL" } },
        data: { pricingStage: "OFFICIAL", convertedToOfficialAt: new Date(), convertedById: user.id },
      });
      if (flipped.count === 0) {
        throw new ConflictError("This project has already been priced.");
      }

      for (const u of updates) {
        await tx.projectService.update({ where: { id: u.id }, data: { clientPrice: u.clientPrice } });
      }

      return updates.length;
    });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  try {
    await db.activityLog.create({
      data: {
        userId: user.id, action: "PRICED_PROJECT", entityType: "PROJECT", entityId: project.id,
        detail: `Priced "${project.name}" and closed the cost sheet`,
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, stage: "OFFICIAL", priced: pricedCount });
}
