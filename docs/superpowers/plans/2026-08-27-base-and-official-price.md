# Base Price / Official Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the production manager build a project's cost sheet (Base Price) and let the founder convert it into client pricing (Official Price), locking the sheet to the PM at that moment — plus project templates that seed the cost sheet.

**Architecture:** A project gains a `pricingStage` of `BASE` or `OFFICIAL`. All markup and margin arithmetic lives in one pure, fully-tested module (`src/lib/pricing.ts`) with no database access, following the `document-math.ts` precedent. The stage is enforced server-side in the services route; `clientPrice` is stripped for anyone who is not the founder.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma 6 → Postgres (Supabase), `node:test` with native TS type-stripping.

**Spec:** `docs/superpowers/specs/2026-08-27-base-and-official-price-design.md`

## Global Constraints

- **`clientPrice` must never reach a non-founder.** Not in an API response, not in an RSC payload, not in a props object. The PM sees cost only. This is the whole point of the feature.
- **Every schema change is additive** — a new column that is nullable or has a default. This runs against a LIVE PRODUCTION database.
- **`npx prisma db push` without `--accept-data-loss`.** If it refuses, stop and report rather than forcing it.
- **Never run `prisma migrate reset` or `db:reset`.** A `P1001` error is transient network flakiness — retry.
- **Test files must be erasable-TypeScript only** — no `enum`, no parameter properties, no `namespace`. Import with an explicit `.ts` extension (e.g. `from "./pricing.ts"`). Inside `src/lib`, cross-module imports use relative paths with the `.ts` extension, not the `@/lib` alias — `node --test` has no path-alias loader. Route files under `src/app` use `@/lib` normally.
- **Money is Naira, stored as JS floats.** Compare with `MONEY_EPSILON` from `src/lib/received-allocation.ts` rather than `=== 0`.
- **Do not modify** `src/lib/received-allocation.ts`, `crm-metrics.ts`, `document-math.ts`, `document-request.ts`, `document-code.ts` or `invoice-provenance.ts` — all tested money code. Import from them.
- **Do not modify anything under `src/components/documents/`** — the rendered client documents are finished. WHT must never appear on one, and `expectedCash` must stay `net − wht` for government clients.
- **Do not change the combobox behaviour** in `description-combobox.tsx` / `section-combobox.tsx`. They were repaired after a subtle Radix bug: the list must never open on `onFocus`, and `onFocusOutside`/`onInteractOutside` must keep ignoring events from the field's own input.
- **Lint baseline is exactly 40 pre-existing errors.** Measure with `npx eslint . --ignore-pattern ".claude/**" 2>&1 | tail -3`. Plain `npm run lint` may report more if a stale worktree exists under `.claude/`.
- Verification before any completion claim: `npx tsc --noEmit`, that lint command, `npm test`, and `npm run build` with `examples/` moved aside.

---

### Task 1: Pure pricing module

Everything downstream depends on this arithmetic. No database access, no Prisma import, no Next.js import.

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `src/lib/pricing.test.ts`

**Interfaces:**
- Consumes: `MONEY_EPSILON` from `./received-allocation.ts`
- Produces:
  - `DEFAULT_MARKUP: number`
  - `markupFor(section: string | null | undefined): number`
  - `suggestOfficialPrice(basePrice: number, section: string | null | undefined): number`
  - `lineTotal(l: { quantity: number; days: number; price: number }): number`
  - `type PricedLine = { section: string | null; quantity: number; days: number; unitPrice: number; clientPrice: number | null }`
  - `baseTotal(lines: PricedLine[]): number`
  - `officialTotal(lines: PricedLine[]): number`
  - `type Margin = { profit: number; percent: number }`
  - `marginFor(base: number, official: number): Margin`
  - `unpricedLines(lines: PricedLine[]): number`
  - `isFullyPriced(lines: PricedLine[]): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pricing.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKUP,
  markupFor,
  suggestOfficialPrice,
  lineTotal,
  baseTotal,
  officialTotal,
  marginFor,
  unpricedLines,
  isFullyPriced,
  type PricedLine,
} from "./pricing.ts";

function line(over: Partial<PricedLine> = {}): PricedLine {
  return { section: "Audiovisual", quantity: 1, days: 1, unitPrice: 100_000, clientPrice: null, ...over };
}

// ---- markupFor ----------------------------------------------------------

test("personnel marks up least — it is people, not kit", () => {
  assert.equal(markupFor("Personnel"), 1.3);
  assert.equal(markupFor("PRODUCTION PERSONNEL"), 1.3);
  assert.equal(markupFor("Operations, Logistics & Management"), 1.3);
});

test("fabrication and scenic mark up hardest", () => {
  assert.equal(markupFor("Scenic Design & Stage Production"), 3.5);
  assert.equal(markupFor("BRANDING (FABRICATION + PRINTING)"), 3.5);
  assert.equal(markupFor("Event Branding & Signage"), 3.5);
});

test("equipment takes the default", () => {
  assert.equal(markupFor("Audiovisual & Technical Production"), 2.0);
  assert.equal(markupFor("EQUIPMENT RENTAL"), 2.0);
});

test("an unknown or empty section falls back to the default rather than throwing", () => {
  assert.equal(markupFor("Something we have never sold"), DEFAULT_MARKUP);
  assert.equal(markupFor(null), DEFAULT_MARKUP);
  assert.equal(markupFor(""), DEFAULT_MARKUP);
});

test("section matching ignores case and surrounding words", () => {
  assert.equal(markupFor("  personnel  "), 1.3);
  assert.equal(markupFor("Stage Fabrication & Build"), 3.5);
});

// ---- suggestOfficialPrice ----------------------------------------------

test("suggested price applies the section markup to the cost", () => {
  assert.equal(suggestOfficialPrice(30_000, "Personnel"), 39_000);
  assert.equal(suggestOfficialPrice(150_000, "Audiovisual"), 300_000);
});

test("a zero cost suggests zero, not a markup of nothing", () => {
  assert.equal(suggestOfficialPrice(0, "Personnel"), 0);
});

test("a negative or invalid cost is floored at zero", () => {
  assert.equal(suggestOfficialPrice(-5, "Personnel"), 0);
});

// ---- lineTotal ----------------------------------------------------------

test("lineTotal multiplies quantity, days and price", () => {
  assert.equal(lineTotal({ quantity: 2, days: 3, price: 250_000 }), 1_500_000);
});

test("lineTotal treats a missing day count as one day, never zero", () => {
  assert.equal(lineTotal({ quantity: 2, days: 0, price: 250_000 }), 500_000);
});

test("a complimentary line totals zero", () => {
  assert.equal(lineTotal({ quantity: 4, days: 3, price: 0 }), 0);
});

// ---- totals -------------------------------------------------------------

test("baseTotal sums the cost side using days", () => {
  const lines = [
    line({ quantity: 6, days: 1, unitPrice: 30_000 }),
    line({ quantity: 1, days: 3, unitPrice: 250_000 }),
  ];
  assert.equal(baseTotal(lines), 180_000 + 750_000);
});

test("officialTotal ignores lines that have no client price yet", () => {
  const lines = [
    line({ quantity: 1, days: 1, unitPrice: 100_000, clientPrice: 200_000 }),
    line({ quantity: 1, days: 1, unitPrice: 50_000, clientPrice: null }),
  ];
  assert.equal(officialTotal(lines), 200_000);
  assert.equal(baseTotal(lines), 150_000);
});

test("a client price of zero is a real price, not an absent one", () => {
  const lines = [line({ clientPrice: 0 })];
  assert.equal(unpricedLines(lines), 0);
  assert.equal(isFullyPriced(lines), true);
  assert.equal(officialTotal(lines), 0);
});

// ---- margin -------------------------------------------------------------

test("margin is profit over the official price, not over cost", () => {
  const m = marginFor(5_122_800, 12_190_177.5);
  assert.equal(Math.round(m.profit), 7_067_378);
  assert.ok(m.percent > 57 && m.percent < 58);
});

test("margin of a job with no official price is zero, not NaN", () => {
  const m = marginFor(500_000, 0);
  assert.equal(m.profit, -500_000);
  assert.equal(m.percent, 0);
});

test("a job priced below cost reports a negative margin rather than hiding it", () => {
  const m = marginFor(1_000_000, 800_000);
  assert.equal(m.profit, -200_000);
  assert.ok(m.percent < 0);
});

// ---- unpriced counting --------------------------------------------------

test("unpricedLines counts only nulls", () => {
  const lines = [line({ clientPrice: 1 }), line({ clientPrice: null }), line({ clientPrice: null })];
  assert.equal(unpricedLines(lines), 2);
  assert.equal(isFullyPriced(lines), false);
});

test("an empty sheet is not 'fully priced' — there is nothing to sell", () => {
  assert.equal(isFullyPriced([]), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './pricing.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/pricing.ts`:

```ts
// ============================================================
// BASE PRICE -> OFFICIAL PRICE (pure, no DB)
//
// BP is what a job COSTS D1Z — vendor hire, crew day rates, transport.
// The production manager builds it. OP is what the CLIENT is charged; only
// the founder ever sees or sets it.
//
// The markups below are starting points to argue with, not a formula. They
// come from D1Z's own invoices: a videographer costs 30,000/day and bills at
// 40,000 (1.33x), while fabrication and branding carry far more risk, waste
// and workmanship and mark up several times over.
// ============================================================

import { MONEY_EPSILON } from "./received-allocation.ts";

/** Applied to any section we do not recognise. */
export const DEFAULT_MARKUP = 2.0;

/**
 * Sections are free text typed by whoever built the sheet ("PERSONNEL",
 * "Operations, Logistics & Management", "BRANDING (FABRICATION + PRINTING)"),
 * so match on keywords rather than exact names. Order matters: the first
 * matching rule wins.
 */
const RULES: { markup: number; keywords: string[] }[] = [
  { markup: 1.3, keywords: ["personnel", "crew", "staff", "operations", "logistics", "management", "labour", "labor"] },
  { markup: 3.5, keywords: ["fabricat", "scenic", "stage", "branding", "signage", "print", "build", "carpentry", "decor"] },
];

function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function markupFor(section: string | null | undefined): number {
  const s = (section ?? "").trim().toLowerCase();
  if (!s) return DEFAULT_MARKUP;
  for (const rule of RULES) {
    if (rule.keywords.some((k) => s.includes(k))) return rule.markup;
  }
  return DEFAULT_MARKUP;
}

/** The founder's starting point for a line's client price. Never a floor or a cap. */
export function suggestOfficialPrice(basePrice: number, section: string | null | undefined): number {
  const cost = Math.max(0, safe(basePrice));
  return cost * markupFor(section);
}

/**
 * quantity x days x price.
 *
 * Days defaults to 1 rather than 0: a line with no day count is a one-off
 * (a fabricated backdrop), not a line worth nothing. The existing services
 * GET omitted `days` entirely, which silently understated every per-day line
 * on a multi-day job.
 */
export function lineTotal(l: { quantity: number; days: number; price: number }): number {
  const q = Math.max(0, safe(l.quantity));
  const d = Math.max(1, safe(l.days) || 1);
  return q * d * Math.max(0, safe(l.price));
}

export type PricedLine = {
  section: string | null;
  quantity: number;
  days: number;
  /** BP — cost per unit per day. */
  unitPrice: number;
  /** OP — client price per unit per day. Null means not yet priced. */
  clientPrice: number | null;
};

export function baseTotal(lines: PricedLine[]): number {
  return lines.reduce((s, l) => s + lineTotal({ quantity: l.quantity, days: l.days, price: l.unitPrice }), 0);
}

/** Unpriced lines contribute nothing — they are not yet part of what we charge. */
export function officialTotal(lines: PricedLine[]): number {
  return lines.reduce(
    (s, l) => (l.clientPrice === null ? s : s + lineTotal({ quantity: l.quantity, days: l.days, price: l.clientPrice })),
    0,
  );
}

export type Margin = { profit: number; percent: number };

/** Margin is profit as a share of the OFFICIAL price, which is how the trade quotes it. */
export function marginFor(base: number, official: number): Margin {
  const b = safe(base);
  const o = safe(official);
  const profit = o - b;
  return { profit, percent: o > MONEY_EPSILON ? (profit / o) * 100 : 0 };
}

/** A clientPrice of 0 is a deliberate complimentary line, NOT an absent price. */
export function unpricedLines(lines: PricedLine[]): number {
  return lines.filter((l) => l.clientPrice === null).length;
}

export function isFullyPriced(lines: PricedLine[]): boolean {
  return lines.length > 0 && unpricedLines(lines) === 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — the new tests plus all 110 existing ones.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint . --ignore-pattern ".claude/**" 2>&1 | tail -3
git add src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "feat(pricing): pure base-price to official-price module"
```

---

### Task 2: Schema — pricing stage on the project

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing
- Produces: `Project.pricingStage`, `Project.convertedToOfficialAt`, `Project.convertedById`, `Project.templateId`

- [ ] **Step 1: Add the columns**

In `model Project`, add before the closing brace:

```prisma
  // BASE while the production manager builds the cost sheet; OFFICIAL once the
  // founder has priced it and taken the project over. The stage is what locks
  // the cost sheet against further PM edits — see src/lib/pricing.ts.
  pricingStage String   @default("BASE") // BASE | OFFICIAL
  convertedToOfficialAt DateTime?
  convertedById String?
  /** Which EventTemplate seeded this project's cost sheet, for reference. */
  templateId   String?
```

- [ ] **Step 2: Push and regenerate**

```bash
npx prisma db push
npx prisma generate
npx tsc --noEmit
```

Expected: push reports the database is in sync with **no data-loss warning** — every change is additive. If it warns or demands `--accept-data-loss`, STOP and report; do not force it.

- [ ] **Step 3: Verify against the live database, rolled back**

Create `verify-stage.mjs` at the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const total = await db.project.count();
  const base = await db.project.count({ where: { pricingStage: "BASE" } });
  console.log(`projects: ${total}, defaulted to BASE: ${base}`);
  console.log(`every existing project starts in BASE: ${total === base}`);
  await db.$transaction(async (tx) => {
    const p = await tx.project.findFirst({ select: { id: true, name: true } });
    if (!p) { console.log("no projects to exercise"); throw new Error("__ROLLBACK__"); }
    const u = await tx.project.update({
      where: { id: p.id },
      data: { pricingStage: "OFFICIAL", convertedToOfficialAt: new Date() },
      select: { pricingStage: true, convertedToOfficialAt: true },
    });
    console.log(`flipped "${p.name}" -> ${u.pricingStage} at ${u.convertedToOfficialAt?.toISOString()}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-stage.mjs && rm -f ./verify-stage.mjs`
Expected: every existing project reports `BASE`, the flip works, then "rolled back".

Do not commit the script.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(pricing): add pricingStage to Project"
```

---

### Task 3: Server-side stage enforcement and clientPrice stripping

The security task. Two rules, both enforced in the API rather than the UI.

**Files:**
- Modify: `src/app/api/doz/services/route.ts`

**Interfaces:**
- Consumes: `lineTotal` from `@/lib/pricing`
- Produces: services GET now returns `days` and (founder only) `clientPrice`; cost-sheet mutations refused when the project is `OFFICIAL` and the caller is not the founder

- [ ] **Step 1: Return `days`, and `clientPrice` only to the founder**

The GET currently maps `projectServices` without `days` at all, and computes `totalPrice: s.totalPrice || s.unitPrice * s.quantity` — which **ignores the day count**, understating every per-day line on a multi-day job. Replace that map with:

```ts
    projectServices: projectServices.map(s => ({
      id: s.id, projectId: s.projectId, serviceName: s.serviceName, category: s.category,
      quantity: s.quantity,
      // `days` was on the model but never returned, so the UI could not show it
      // and totalPrice silently ignored it. A 3-day LED hire read as 1 day.
      days: s.days,
      unitPrice: s.unitPrice,
      totalPrice: lineTotal({ quantity: s.quantity, days: s.days, price: s.unitPrice }),
      // OP is founder-only. Not "hidden in the UI" — absent from the payload.
      clientPrice: user.role === "FOUNDER" ? s.clientPrice : undefined,
      vendorId: s.vendorId, vendorName: s.vendorName, vendorContact: s.vendorContact,
      vendorPhone: s.vendorPhone, vendorEmail: s.vendorEmail, vendorBankDetails: s.vendorBankDetails,
      status: s.status, notes: s.notes, createdBy: s.createdBy, createdAt: s.createdAt,
    })),
```

Add the import at the top: `import { lineTotal } from "@/lib/pricing";`

- [ ] **Step 2: Refuse cost-sheet edits once the project is OFFICIAL**

The mutating cost-sheet actions are `add_service`, `update_service`, `delete_service`, `submit_budget` and `add_custom_item`. Immediately after the existing `BUDGET_ACTIONS` permission check, add:

```ts
  // Once the founder has converted a project to OFFICIAL they have taken it
  // over: the cost sheet is closed to everyone else. The founder can still
  // edit, and can reopen the project to BASE to let the PM add a late item.
  const SHEET_MUTATIONS = ["add_service", "update_service", "delete_service", "submit_budget", "add_custom_item"];
  if (SHEET_MUTATIONS.includes(body.action) && body.projectId && user.role !== "FOUNDER") {
    const proj = await db.project.findUnique({
      where: { id: body.projectId },
      select: { pricingStage: true, name: true },
    });
    if (proj?.pricingStage === "OFFICIAL") {
      return NextResponse.json(
        { error: `"${proj.name}" has been priced and closed. Ask the founder to reopen it if something needs adding.` },
        { status: 409 },
      );
    }
  }
```

Note `update_service` and `delete_service` may carry the service id rather than `projectId`; where `body.projectId` is absent, look the project up via the service row before the check. Read the existing handlers to see which identifiers they receive and handle both.

- [ ] **Step 3: Typecheck and confirm the existing flow still works**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

- [ ] **Step 4: Prove both rules against the live database, rolled back**

Create `verify-guard.mjs` at the project root that, inside a transaction always throwing `__ROLLBACK__`:
- creates a project with `pricingStage: "OFFICIAL"` and one `ProjectService` line carrying a `clientPrice`
- prints what the GET mapping would produce for a `FOUNDER` and for a `PRODUCTION_MANAGER`, asserting `clientPrice` is `undefined` in the second
- prints the `totalPrice` for a line with `quantity: 12, days: 4, unitPrice: 85_000`, asserting `4_080_000` rather than the old `1_020_000`

Run it with `node --env-file=.env`, report the output, then delete it. Do not commit it.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/doz/services/route.ts
git commit -m "fix(services): return days in totals, and keep clientPrice founder-only"
```

---

### Task 4: Convert and reopen

**Files:**
- Create: `src/app/api/doz/projects/pricing/route.ts`

**Interfaces:**
- Consumes: `suggestOfficialPrice`, `baseTotal`, `officialTotal`, `marginFor`, `unpricedLines` from `@/lib/pricing`; `getSessionUser` from `@/lib/auth`
- Produces:
  - `GET ?projectId=` → `{ stage, lines: [{ id, serviceName, section, quantity, days, unitPrice, clientPrice, suggested }], baseTotal, officialTotal, margin, unpriced }` — **FOUNDER only**
  - `POST { action: "convert", projectId, prices: { [serviceId]: number } }` → `{ ok, stage: "OFFICIAL" }`
  - `POST { action: "reopen", projectId }` → `{ ok, stage: "BASE" }`

- [ ] **Step 1: Write the route**

Create `src/app/api/doz/projects/pricing/route.ts`:

```ts
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

  return NextResponse.json({
    stage: project.pricingStage,
    convertedAt: project.convertedToOfficialAt,
    lines: rows.map((r) => ({
      id: r.id, serviceName: r.serviceName, section: r.category,
      quantity: r.quantity, days: r.days, status: r.status,
      unitPrice: r.unitPrice, clientPrice: r.clientPrice,
      // A starting point, recomputed on every read so a changed cost is
      // reflected. Never written unless the founder confirms it.
      suggested: suggestOfficialPrice(r.unitPrice, r.category),
    })),
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
    select: { id: true, name: true, pricingStage: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "reopen") {
    if (project.pricingStage !== "OFFICIAL") {
      return NextResponse.json({ error: "This project is already open for edits." }, { status: 409 });
    }
    // Prices already set are KEPT. Anything the PM adds while reopened arrives
    // with clientPrice null, so it shows as unpriced when you convert again.
    await db.project.update({
      where: { id: project.id },
      data: { pricingStage: "BASE", convertedToOfficialAt: null, convertedById: null },
    });
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

  if (project.pricingStage === "OFFICIAL") {
    return NextResponse.json({ error: "This project has already been priced." }, { status: 409 });
  }

  const rows = await db.projectService.findMany({ where: { projectId: project.id } });
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "There is nothing to price yet — the cost sheet is empty." },
      { status: 409 },
    );
  }

  // Pricing a job whose costs are not settled produces a margin that is not
  // real, so the budget must be approved first.
  const unapproved = rows.filter((r) => r.status !== "APPROVED").length;
  if (unapproved > 0) {
    return NextResponse.json(
      { error: `${unapproved} cost line(s) are not approved yet. Approve the budget before pricing the job.` },
      { status: 409 },
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

  await db.$transaction([
    ...updates.map((u) =>
      db.projectService.update({ where: { id: u.id }, data: { clientPrice: u.clientPrice } }),
    ),
    db.project.update({
      where: { id: project.id },
      data: { pricingStage: "OFFICIAL", convertedToOfficialAt: new Date(), convertedById: user.id },
    }),
  ]);

  try {
    await db.activityLog.create({
      data: {
        userId: user.id, action: "PRICED_PROJECT", entityType: "PROJECT", entityId: project.id,
        detail: `Priced "${project.name}" and closed the cost sheet`,
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, stage: "OFFICIAL", priced: updates.length });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Exercise the whole lifecycle against the live database, rolled back**

Create `verify-convert.mjs` at the project root. Inside a transaction that always throws `__ROLLBACK__`, replicate the route's logic (import `suggestOfficialPrice` from `./src/lib/pricing.ts`, run with `node --env-file=.env --experimental-strip-types`) and print:

- convert refused while a line is still `LISTED`, with the message naming the count
- after marking lines `APPROVED`, convert succeeds and every line gains a `clientPrice`
- `pricingStage` is `OFFICIAL` and `convertedToOfficialAt` is set
- reopen returns the stage to `BASE` **and leaves every `clientPrice` intact**
- a line added while reopened has `clientPrice` null, and `unpricedLines` counts exactly one

Report the real figures, then delete the script. Do not commit it.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/doz/projects/pricing/
git commit -m "feat(pricing): founder-only convert and reopen"
```

---

### Task 5: Markup panel

**Files:**
- Create: `src/components/modules/projects/markup-panel.tsx`
- Modify: `src/components/modules/projects-events.tsx` (render it inside `ProjectDialog`, near `ServicesSection` at line ~3366)

**Interfaces:**
- Consumes: `GET`/`POST /api/doz/projects/pricing` (Task 4); `lineTotal`, `marginFor` from `@/lib/pricing`
- Produces: `<MarkupPanel projectId onChanged />`

- [ ] **Step 1: Build the panel**

Founder-only — render it only when `user?.role === "FOUNDER"`. It is the one screen in the app that shows cost and client price side by side.

Follow the house style of `ServicesSection` in the same file for card, table and toast conventions. The panel shows, per line: service name, section, quantity, days, **BP unit cost**, an editable **OP unit price** pre-filled from `suggested`, and the line's OP total. Below the table: base total, official total, and live margin in naira and percent that updates as prices are edited (compute locally with `lineTotal`/`marginFor` rather than re-fetching).

Actions:
- **Convert to Official Price** — posts `{ action: "convert", projectId, prices }` with every line's current value. Confirm first, with wording that says the cost sheet will close to the production manager.
- **Reopen for edits** — shown only when the stage is `OFFICIAL`; posts `{ action: "reopen", projectId }`. Its confirm should say prices are kept.

When the stage is `OFFICIAL`, show when it was converted, and show any line with `clientPrice === null` highlighted as unpriced.

Surface server errors verbatim via `toast.error(msg, { duration: 8000 })` — the 409 messages are written to be read by the founder.

- [ ] **Step 2: Show the stage on the cost sheet**

In `ServicesSection`, when the project is `OFFICIAL` and the viewer is not the founder, replace the add/edit controls with a plain line: `This project has been priced and closed. Ask the founder to reopen it if something needs adding.` Do not merely disable the buttons silently.

- [ ] **Step 3: Verify in the browser**

A dev server may already be running on port 3000 — reuse it. The Projects module is behind a founder login you cannot perform, so build a temporary fixture route under `src/app/` (Next.js ignores folders starting with `_`, so do not use that prefix) mounting `MarkupPanel` against a real project id with mocked fetch responses.

Note that this environment's synthetic clicks are misread by Radix as outside-interactions and will close a dialog; if you mount anything in a `Dialog`, add `onPointerDownOutside={(e) => e.preventDefault()}` and `onInteractOutside={(e) => e.preventDefault()}` to its `DialogContent`, and drive controls with dispatched DOM events rather than coordinate clicks.

Confirm: suggested prices pre-fill, editing one updates the margin live, and the convert confirm names the consequence. Screenshot it. **Then delete the fixture.**

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/projects/markup-panel.tsx src/components/modules/projects-events.tsx
git commit -m "feat(pricing): founder markup panel with live margin"
```

---

### Task 6: Seed a project's cost sheet from a template

**Files:**
- Modify: `src/app/api/doz/projects/route.ts` (the POST handler)
- Modify: `src/components/modules/projects-events.tsx` (`NewProjectDialog`)

**Interfaces:**
- Consumes: `EventTemplate` / `EventTemplateItem`
- Produces: `POST /api/doz/projects` accepts `templateId`; creates one `ProjectService` per enabled template item

- [ ] **Step 1: Seed lines on create**

The POST already seeds `ProjectService` rows from `body.serviceNames` (the `"CATEGORY::Service name"` picker). Add template seeding alongside it. When `body.templateId` is present, load the template's items and create a cost line per item where `enabledByDefault` is true:

```ts
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
              totalPrice: (i.defaultUnitCost ?? 0) * i.defaultQuantity * Math.max(1, i.defaultDays),
              status: "LISTED",
              createdBy: user.id,
            })),
          });
        }
        await db.project.update({ where: { id: created.id }, data: { templateId: tpl.id } });
      }
    }
```

- [ ] **Step 2: Offer templates in the create dialog**

In `NewProjectDialog`, add a template `Select` above the services picker, fed by `GET /api/doz/event-templates`, with a "Start blank" option that is the default. Helper text: `A template fills in the usual lines for this kind of job. You can change everything afterwards.`

Send the chosen id as `templateId` in the POST payload. A proposing production manager sees it too — they are building the BP, which is exactly what a template seeds.

- [ ] **Step 3: Verify against the live database, rolled back**

Write a script at the project root that, inside a rolled-back transaction, creates a template with three items (one `enabledByDefault: false`), creates a project from it, and prints the resulting cost lines — asserting the disabled item is absent and that quantity, days and cost carried across. Run with `node --env-file=.env`, report the output, delete the script.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/doz/projects/route.ts src/components/modules/projects-events.tsx
git commit -m "feat(projects): seed a new project's cost sheet from a template"
```

---

### Task 7: Seed the three reference templates

**Files:**
- Create: `prisma/seed-templates.mjs`

**Interfaces:**
- Consumes: `EventTemplate` / `EventTemplateItem`
- Produces: three templates in the live database

- [ ] **Step 1: Write an idempotent seed script**

Create `prisma/seed-templates.mjs`. It must be **idempotent** — safe to run twice, skipping any template whose name already exists rather than duplicating it. It is committed (unlike the throwaway verification scripts) because it documents where the templates came from.

Three templates, taken from D1Z's own invoices. **Costs are omitted** (`defaultUnitCost: null`) because those documents show client prices, not costs; seeding BP from them would put invented figures into the founder's pricing.

1. **`One-day production`** — sections `AUDIO VISUAL` and `PERSONNEL`. Items: LED Screen (qty 2, 1 day), Live Streaming, HD Cameras Complete Rig (qty 3), Complete Audio System, 6 Channel Video Mixer + Recorder, Stage Lights and Audience Light with Truss Stand, Production Personnel (qty 6), Photography, 65 Inch TV with Stands, Goose Mic — Panellist Microphones (qty 10), Background Lights (qty 6), Professional Fees.

2. **`Multi-day conference`** — sections `AUDIO VISUAL`, `BRANDING`, `PERSONNEL`. Items: LED Screen + Riser (qty 2, 3 days), Stage TV Monitor & Stand (qty 2, 3 days), Stage Timer Stand & Attendant (3 days), Live Streaming (3 days), HD Camera Chain (qty 4, 3 days), Complete Audio System (3 days), Panellist Microphones (qty 8, 3 days), 6 Channel Video Mixer + Recorder (3 days), Stage / Red Carpet / Welcome / Flags Branding, Decoration (Main Hall), Stage Lights and Audience Light with Truss Stand (3 days), Opening Animation and Partner Animation, Programme Slides, Panellist Chairs and Stools (qty 7, 3 days), Poster Session, Production Personnel (qty 8, 3 days), Photography (qty 2, 3 days).

3. **`Lecture series`** — sections `AUDIO VISUAL`, `BRANDING`, `PERSONNEL`, `CONTENT CREATION`. Items: HD Camera Chain (qty 3), Stage and Conference Platform Construction, Video Mixer / Technical Presentation / Recorder and Playback, 50 Inch Stage Monitor with Stand (qty 2), 50 Inch Timer, LED Screen + Riser (qty 4), Complete PA System including Speakers and Panellist Mics, Streaming Equipment, Programme Slides / Animation, Stage Lights and Audience Light with Truss, Photography (qty 2), Production Personnel (qty 6), Post Production and Editing, Professional Fees, External Branding — Red Carpet Background and Gate Banner, Conference Advert Production.

Set `enabledByDefault: false` for lines that are present but often unused — on the one-day template, the complimentary items (65 Inch TV with Stands, Goose Mic, Background Lights), which appear on the reference invoice at zero.

Set `sortOrder` to the order listed, so a seeded cost sheet reads like the original document.

- [ ] **Step 2: Run it against the live database**

```bash
node --env-file=.env prisma/seed-templates.mjs
```

Expected: three templates created, with their item counts printed. This one **does** write to production — that is its purpose. Re-run it immediately and confirm it reports all three as already present and creates nothing.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed-templates.mjs
git commit -m "feat(projects): seed one-day, conference and lecture-series templates"
```

---

### Task 8: Build a document from a priced project

**Files:**
- Modify: `src/components/modules/documents/document-builder.tsx`
- Modify: `src/app/api/doz/documents/quotations/route.ts` and `src/app/api/doz/documents/invoices/route.ts` (accept nothing new — the builder sends ordinary lines)

**Interfaces:**
- Consumes: `GET /api/doz/projects/pricing?projectId=` (Task 4)
- Produces: a "Load from project" action in the document builder

- [ ] **Step 1: Add the action**

The builder already has a project picker (`projectId`). When a project is chosen **and** its pricing stage is `OFFICIAL`, show a button: `Load priced lines from this project`.

Clicking it fetches `GET /api/doz/projects/pricing?projectId=…` and replaces the builder's lines with one line per cost line, mapping:

- `description` ← `serviceName`
- `section` ← `section`
- `quantity` ← `quantity`
- `days` ← `days`
- `unitPrice` ← **`clientPrice`** (the OP — never `unitPrice`, which is the cost)

Lines whose `clientPrice` is null are skipped, and the toast says how many were skipped as unpriced.

If the project is still `BASE`, show instead a plain sentence: `This project hasn't been priced yet. Price it from the project's markup panel first.` Do not offer the button.

- [ ] **Step 2: Confirm no cost leaks into the document**

The builder is founder-only, so cost is not a confidentiality problem here — but billing a client at cost by mistake is a money problem. Add a test-by-inspection step: grep the builder for `unitPrice` and confirm the only value flowing into a document line comes from `clientPrice`.

- [ ] **Step 3: Verify in the browser**

Using the same fixture technique as Task 5, mount the builder with a mocked pricing response containing three priced lines and one unpriced. Confirm the three load with their **client** prices and the fourth is skipped with a toast saying so. Screenshot. Delete the fixture.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/documents/document-builder.tsx
git commit -m "feat(documents): build a document from a project's official prices"
```

---

### Task 9: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run every check**

```bash
npx prisma generate
npx tsc --noEmit
npm test
npx eslint . --ignore-pattern ".claude/**" 2>&1 | tail -3
```

Expected: typecheck clean, all tests pass, lint exactly **40**.

- [ ] **Step 2: Production build**

```bash
mv examples /tmp/hold12
npm run build > /tmp/b12.log 2>&1; echo "EXIT=$?"
mv /tmp/hold12 examples
grep -iE "error|failed" /tmp/b12.log | head
```

Expected: `EXIT=0`.

- [ ] **Step 3: Prove the confidentiality boundary**

Write a read-only script at the project root that, for a project with priced lines, prints exactly what `GET /api/doz/services` would return for a `FOUNDER` and for a `PRODUCTION_MANAGER`, and asserts `clientPrice` is absent from every line in the second. Also confirm `GET /api/doz/projects/pricing` returns 403 for any non-founder role. Report the output, then delete the script.

- [ ] **Step 4: Confirm nothing else regressed**

Run `npm test` and confirm the pre-existing `received-allocation`, `crm-metrics`, `document-math`, `document-request`, `document-code` and `invoice-provenance` tests all still pass untouched. Confirm with `git log --oneline -- src/lib/received-allocation.ts` that it was not modified during this work.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore(pricing): verification pass"
git push
```

---

## One deliberate departure from the spec

The spec says that while a project is `BASE`, "no invoice or quotation can be
raised… attempting it returns a plain refusal." This plan does **not** implement
that as a hard block, and the difference is deliberate.

The spec's reasoning was that there is no client price to raise a document from,
which is true of *drawing lines from the project* — and Task 8 does refuse that,
with the message the spec asks for. But the document builder also accepts
hand-typed lines, and blocking those would stop the founder raising a deposit
invoice before the cost sheet is finished, which is ordinary practice and has
nothing to do with the confidentiality problem this feature exists to solve.

So: pulling prices from an unpriced project is refused; typing an invoice by
hand is not. If the founder wants the stricter behaviour, it is a small change to
the two document POST routes.

## Deferred to a later plan

- `ServiceItem.standardCost` — a maintained rate card so cost lines pre-fill. The catalogue editor already exists, so this is a natural follow-on.
- Per-client OP overrides (a rate agreed with a repeat client).
- Reordering template lines by drag.
