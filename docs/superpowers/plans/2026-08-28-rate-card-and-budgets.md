# Rate Card and Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the founder one page where they see and edit every service's Budget Rate (BP) and Client Rate (CP), make a new budget line pre-fill from those rates, price a quotation from the rate card rather than a formula, and put the budget itself in Documents where the founder went looking for it.

**Architecture:** `ServiceItem` — the existing service catalogue — becomes the company rate card by gaining a cost and a client rate. Nothing else stores a rate, so there is one place to change a price. The budget is not a new table: it is the project's existing `ProjectService` rows, surfaced as a document. All markup arithmetic stays in the pure, tested `src/lib/pricing.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma 6 → Postgres (Supabase), `node:test` with native TS type-stripping.

**Spec:** `docs/superpowers/specs/2026-08-28-document-chain-design.md`

**Scope:** Spec build-order steps 1–3 (Budgets tab, multiplier correction, rate card). Steps 4–7 — quotation revisions, acceptance write-back, deriving the manual cost/contract fields, and dashboard approvals — are a separate plan.

## Global Constraints

- **BP and CP are the founder's terms and the app must use them.** BP = Budget Rate / Basic Rate, what the job costs D1Z. CP = Official Rate / Client Rate / Corporate Rate, what the client is charged. Earlier specs said "OP"; **CP wins**. In the schema, `ProjectService.unitPrice` is BP and `ProjectService.clientPrice` is CP.
- **CP is FOUNDER-only. BP is founder, staff and production manager.** Neither ever reaches an intern. This is the rule the whole confidentiality model rests on.
- **The catalogue GET with no `projectId` is currently open to every signed-in user** (`src/app/api/doz/services/route.ts`, the `if (projectId)` branch is the only gate). Adding rates to that payload without gating them hands an intern the entire rate card. Gate the rate fields by role, never the whole catalogue — the pickers need the names.
- **Every schema change is additive** — a new column that is nullable or has a default. This runs against a **LIVE PRODUCTION** database.
- **`npx prisma db push` without `--accept-data-loss`.** If it refuses, stop and report rather than forcing it.
- **Never run `prisma migrate reset` or `db:reset`.** A `P1001` error is transient network flakiness — retry.
- **Test files must be erasable-TypeScript only** — no `enum`, no parameter properties, no `namespace`. Inside `src/lib`, cross-module imports use relative paths with an explicit `.ts` extension (`from "./pricing.ts"`), not the `@/lib` alias — `node --test` has no path-alias loader. Route files under `src/app` use `@/lib` normally.
- **Money is Naira, stored as JS floats.** A `clientPrice` or a rate of `0` is a real price — a deliberate complimentary line, which D1Z's invoices footnote explicitly. Only `null` means unpriced. Never use a falsy check.
- **`unit` on a service is a LABEL only** ("per sqm", "per person"). It must never enter a calculation. A line's amount is always `quantity × days × unitPrice`, with no second multiplier anywhere.
- **Do not modify** `src/lib/received-allocation.ts`, `crm-metrics.ts`, `document-math.ts`, `document-request.ts`, `document-code.ts` or `invoice-provenance.ts`. `pricing.ts` is modified in Task 1 only.
- **Do not modify anything under `src/components/documents/`** — the rendered client documents are finished. WHT appears on none of them, and `expectedCash` stays `net − wht` for government clients.
- **Do not change `description-combobox.tsx` or `section-combobox.tsx`** — repaired after a subtle Radix bug: the list must never open on `onFocus`, and `onFocusOutside`/`onInteractOutside` must keep ignoring events from the field's own input.
- **Do not weaken** the `OFFICIAL` stage lock, the `SHEET_MUTATIONS` guard, `requireProjectAccess`, or `shapeService`'s founder-only `clientPrice` stripping.
- **Do not introduce a new `react-hooks/set-state-in-effect` lint error** — `setState` goes inside `.then()` continuations, never synchronously in an effect body.
- Lint baseline is exactly **40**. Measure with `npx eslint . --ignore-pattern ".claude/**" 2>&1 | tail -3`; plain `npm run lint` may differ.
- Verification before any completion claim: `npx tsc --noEmit`, that lint command, `npm test` (136 currently pass), and `npm run build` with `examples/` moved aside.

---

### Task 1: Correct the markup multipliers

The live defaults overprice badly. This is first because every later task assumes sane fallbacks.

**Files:**
- Modify: `src/lib/pricing.ts`
- Modify: `src/lib/pricing.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `markupFor(section)` returning the corrected rates; `DEFAULT_MARKUP = 1.35`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pricing.test.ts`:

```ts
test("markups follow the founder's own category table, not the old guesses", () => {
  // Equipment 25-40% -> midpoint 1.35
  assert.equal(markupFor("Audiovisual & Technical Production"), 1.35);
  assert.equal(markupFor("EQUIPMENT RENTAL"), 1.35);
  // Crew / personnel / production management 30-50% -> 1.40
  assert.equal(markupFor("Personnel"), 1.4);
  assert.equal(markupFor("Production Management"), 1.4);
  // Branding materials and printing 20-30% -> 1.25
  assert.equal(markupFor("Event Branding & Signage"), 1.25);
  assert.equal(markupFor("Branding & Print"), 1.25);
  // Fabrication and exhibition stands 25-40% -> 1.35
  assert.equal(markupFor("Stage & Scenic Fabrication"), 1.35);
  assert.equal(markupFor("Trade Show Exhibition & Booth Construction"), 1.35);
  // Logistics 20-30% -> 1.25
  assert.equal(markupFor("Logistics & Welfare"), 1.25);
  // Post, motion graphics, colour grading, creative 40-60%+ -> 1.50
  assert.equal(markupFor("Post-Production"), 1.5);
  assert.equal(markupFor("Motion Graphics"), 1.5);
  assert.equal(markupFor("Colour Grading"), 1.5);
});

test("the old 3.5x fabrication default is gone — it overpriced a stage threefold", () => {
  // The founder's rate card puts a 390,000 stage at 500,000, not 1,365,000.
  const suggested = suggestOfficialPrice(390_000, "Stage & Scenic Fabrication");
  assert.ok(suggested < 600_000, `expected near the rate card's 500,000, got ${suggested}`);
});

test("no section marks up more than 1.5x by default", () => {
  const sections = [
    "Displays", "Cameras & Capture", "Sound", "Lighting", "Streaming & Broadcast",
    "Stage & Scenic Fabrication", "Branding & Print", "Furniture", "Personnel",
    "Logistics & Welfare", "Post-Production", "Motion Graphics", "Colour Grading",
    "Trade Show Exhibition & Booth Construction", "Something we have never sold",
  ];
  for (const s of sections) {
    assert.ok(markupFor(s) <= 1.5, `${s} marks up at ${markupFor(s)}`);
    assert.ok(markupFor(s) >= 1.25, `${s} marks up at ${markupFor(s)}`);
  }
});
```

Delete any existing assertion that expects `2.0` or `3.5` — those encode the defect.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the current rules return 2.0 and 3.5.

- [ ] **Step 3: Replace the rules table**

In `src/lib/pricing.ts`, replace `DEFAULT_MARKUP` and `RULES`:

```ts
/**
 * Applied to any section we do not recognise. The midpoint of the founder's
 * own equipment-rental band (25-40%).
 */
export const DEFAULT_MARKUP = 1.35;

/**
 * The founder's category table, at the midpoint of each stated range.
 *
 * These replace an earlier guess of 2.0x equipment and 3.5x fabrication, taken
 * from a single invoice where fabrication happened to mark up several times.
 * As a default that was badly wrong: it quoted a 390,000 stage at 1,365,000
 * where the founder's own rate card says 500,000 — a lost job with no
 * explanation. Real cost-to-rate pairs in that card cluster at 1.2x-1.5x.
 *
 * Every rule is scored and the HIGHEST match wins, so a section naming both a
 * trade and its crew ("Stage Fabrication & Crew") cannot be dragged down to the
 * personnel rate by whichever keyword happens to be checked first.
 */
const RULES: { markup: number; keywords: string[] }[] = [
  { markup: 1.5, keywords: ["post-production", "post production", "grading", "grade", "motion graphic", "animation", "creative", "consultancy", "editing"] },
  { markup: 1.4, keywords: ["personnel", "crew", "staff", "videographer", "photographer", "production management", "producer", "director", "technician", "operator", "labour", "labor"] },
  { markup: 1.25, keywords: ["branding", "signage", "print", "logistics", "transport", "catering", "welfare"] },
  { markup: 1.35, keywords: ["fabricat", "scenic", "stage", "build", "carpentry", "decor", "construction", "booth", "exhibit", "stand"] },
];
```

Keep the existing highest-match-wins scoring in `markupFor` — do not revert it to first-match.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all of them.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint . --ignore-pattern ".claude/**" 2>&1 | tail -3
git add src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "fix(pricing): use the founder's own markup table, not a threefold guess"
```

---

### Task 2: Rate card columns on the catalogue

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing
- Produces: `ServiceItem.standardCost`, `ServiceItem.standardClientRate`, `ServiceItem.unit`, `ServiceItem.costUpdatedAt`, `ServiceItem.rateUpdatedAt`, `EventTemplateItem.serviceItemId`

- [ ] **Step 1: Add the columns**

In `model ServiceItem`, before the closing brace:

```prisma
  // The company rate card. BP is what the job costs D1Z; CP is what the client
  // is charged. Both are nullable: an unpriced line is honest, an invented one
  // is not, and many services genuinely vary per job.
  standardCost       Float?    // BP — Budget Rate / Basic Rate
  standardClientRate Float?    // CP — Official / Client / Corporate Rate
  // A LABEL for the founder ("per sqm", "per person"). NEVER a multiplier —
  // a line's amount is always quantity x days x unitPrice.
  unit               String    @default("UNIT")
  costUpdatedAt      DateTime?
  rateUpdatedAt      DateTime?
```

In `model EventTemplateItem`, before the closing brace:

```prisma
  // Where a template line is a catalogue service, its rates come from the
  // catalogue rather than a copy that goes stale.
  serviceItemId String?
```

- [ ] **Step 2: Push and regenerate**

```bash
npx prisma db push
npx prisma generate
npx tsc --noEmit
```

Expected: in sync, **no data-loss warning** — every change is additive. If it warns or demands `--accept-data-loss`, STOP and report.

- [ ] **Step 3: Verify against the live database, rolled back**

Create `verify-rates.mjs` at the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const total = await db.serviceItem.count();
  const priced = await db.serviceItem.count({ where: { standardCost: { not: null } } });
  console.log(`service items: ${total}, with a cost: ${priced} (expect 0 before seeding)`);
  await db.$transaction(async (tx) => {
    const it = await tx.serviceItem.findFirst({ select: { id: true, name: true } });
    if (!it) { console.log("no catalogue items"); throw new Error("__ROLLBACK__"); }
    const u = await tx.serviceItem.update({
      where: { id: it.id },
      data: { standardCost: 30000, standardClientRate: 45000, unit: "DAY", costUpdatedAt: new Date() },
      select: { name: true, standardCost: true, standardClientRate: true, unit: true },
    });
    console.log(`${u.name}: BP ${u.standardCost}, CP ${u.standardClientRate}, unit ${u.unit}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-rates.mjs && rm -f ./verify-rates.mjs`
Expected: both fields round-trip, then "rolled back". Do not commit the script.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(rate-card): add BP and CP columns to the service catalogue"
```

---

### Task 3: Serve and edit rates, gated by role

The security task. Rates must reach the right roles and no others.

**Files:**
- Modify: `src/app/api/doz/services/route.ts`

**Interfaces:**
- Consumes: `canSeeFinancials` from `@/lib/auth`
- Produces: catalogue GET returns `standardCost` / `standardClientRate` / `unit` per role; POST action `catalogue_set_rates` with body `{ itemId, standardCost?, standardClientRate?, unit? }`

- [ ] **Step 1: Gate the rate fields in the catalogue payload**

The catalogue GET currently returns `categories` to **any signed-in user** — the `if (projectId)` branch is the only gate in the route, and the pickers rely on the names being open. Do not close the catalogue; gate the money on it.

Compute once, near the top of GET:

```ts
  // BP is visible to the people who build budgets. CP is founder-only, the same
  // rule as ProjectService.clientPrice. The catalogue itself stays readable by
  // everyone signed in, because the Section and Description pickers need the
  // names — but an intern must never read the rate card off the back of them.
  const canSeeBP =
    user.role === "FOUNDER" || user.role === "STAFF" || user.role === "PRODUCTION_MANAGER";
  const canSeeCP = canSeeFinancials(user.role); // FOUNDER only
```

Then in the `categories` map, add to each item:

```ts
        standardCost: canSeeBP ? i.standardCost : undefined,
        standardClientRate: canSeeCP ? i.standardClientRate : undefined,
        unit: i.unit,
```

`undefined` is dropped by `JSON.stringify`, so the key is **absent** rather than null — the defence is the field not being there.

- [ ] **Step 2: Add the edit action**

Alongside the existing `catalogue_*` actions (all FOUNDER-only), add:

```ts
  if (body.action === "catalogue_set_rates") {
    if (user.role !== "FOUNDER") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
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
```

- [ ] **Step 3: Typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Prove the gate against the live database, read-only**

Write a script at the project root that prints what the catalogue payload's rate fields would contain for a FOUNDER, a STAFF user, a PRODUCTION_MANAGER, a FREELANCER and an INTERN, asserting:
- `standardClientRate` is **absent** for everyone but the founder
- `standardCost` is absent for FREELANCER and INTERN
- item names are present for all five, because the pickers need them

Read-only queries only. Report the output, then delete the script.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/doz/services/route.ts
git commit -m "feat(rate-card): serve BP and CP by role, and let the founder edit them"
```

---

### Task 4: The founder's rate card page

**This is the founder's explicit request:** one page where they see and modify BP and CP.

**Files:**
- Create: `src/components/modules/documents/rate-card.tsx`
- Modify: `src/components/modules/documents.tsx`

**Interfaces:**
- Consumes: `GET /api/doz/services` (no `projectId`), `POST catalogue_set_rates` (Task 3); `markupFor` from `@/lib/pricing`
- Produces: `<RateCard />` rendered as a founder-only tab

- [ ] **Step 1: Build the page**

Founder-only — render only when `user?.role === "FOUNDER"`, mirroring how the Catalogue tab is already gated in `documents.tsx`.

Read `src/components/modules/documents/catalogue-editor.tsx` first and follow its structure, toasts and confirm patterns; this page is its sibling and they should look like one product.

Layout: departments as sections, each listing its services in a table with columns **Service · Unit · BP (cost) · CP (client rate) · Margin**.

- BP and CP are inline editable number inputs, saved on blur via `catalogue_set_rates`. An empty input clears the rate to `null`; a typed `0` is a real, saved zero.
- **Margin** is computed live per row from the two figures: `CP - BP` in naira and as a percent of CP. Use `marginFor(bp, cp)` from `@/lib/pricing` rather than doing the arithmetic inline. Show `—` when either figure is missing.
- Where CP is unset, show the **suggested** CP from `markupFor(department)` in muted text with a one-click "use this" — so a service without a published rate still has a sane starting point, and the founder can see what the fallback would do before accepting it.
- A row where BP is set and CP is below it is flagged: that line loses money.

Header line, so the page explains itself: `BP is what a job costs us. CP is what the client is charged. Both are starting points — you can override either on any project.`

Surface server errors verbatim with `toast.error(msg, { duration: 8000 })`.

- [ ] **Step 2: Add the tab**

In `documents.tsx`, add a **Rate Card** tab beside Catalogue, gated on `isFounder` exactly as Catalogue is.

- [ ] **Step 3: Verify by rendering**

A dev server may already be running on port 3000 — reuse it. The Documents module is behind a founder login you cannot perform, so build a temporary fixture route under `src/app/` (Next.js ignores folders starting with `_`, so do not use that prefix) mounting `<RateCard />` against a mocked fetch.

**This environment's synthetic clicks are misread by Radix as outside-interactions and close dialogs** — if you mount anything in a `Dialog`, add `onPointerDownOutside={(e) => e.preventDefault()}` and `onInteractOutside={(e) => e.preventDefault()}` to its `DialogContent`, and drive controls with dispatched DOM events rather than coordinate clicks.

Confirm and screenshot: rates render per department, editing BP updates the margin live, a CP below its BP is flagged, a typed `0` saves as zero rather than clearing, and clearing a field sets it to unpriced. **Then delete the fixture** — `git status --short` must show only intended files.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/documents/rate-card.tsx src/components/modules/documents.tsx
git commit -m "feat(rate-card): founder page to see and edit BP and CP"
```

---

### Task 5: A new budget line pre-fills from the rate card

**Files:**
- Modify: `src/components/modules/projects-events.tsx` (`ServiceFormDialog`, around line 3596)

**Interfaces:**
- Consumes: the catalogue GET's `standardCost` per item (Task 3)
- Produces: nothing later tasks depend on

- [ ] **Step 1: Pre-fill the cost**

`ServiceFormDialog` already loads the catalogue for its service picker. When a service is chosen and the payload carries a `standardCost`, pre-fill the unit-cost input with it. The production manager can type over it — the override lives on that project's line and changes nothing company-wide.

Show a muted hint beside the field when the value is still the standard: `Standard rate — change it if this vendor quoted differently.`

If `standardCost` is absent — either unpriced or the viewer is not allowed it — leave the field empty and show nothing. Never render a `0` as though it were a rate.

- [ ] **Step 2: Offer to save an override back**

When the founder has changed the cost away from the service's `standardCost`, show a checkbox: `Save as the new standard rate`. On submit, if ticked, additionally `POST catalogue_set_rates` with the new `standardCost`.

**Founder only** — the server refuses anyone else, and the checkbox must not appear for a PM. The rate card is company-wide reference data; one job's unusual price should not silently rewrite it.

- [ ] **Step 3: Verify by rendering**

Using the same fixture technique as Task 4, mount `ServiceFormDialog` with a mocked catalogue containing a service with `standardCost: 30000` and one with none. Confirm: picking the first pre-fills 30,000; typing over it reveals the save-back checkbox for a founder and not for a PM; picking the second leaves the field empty. Screenshot, then delete the fixture.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/projects-events.tsx
git commit -m "feat(rate-card): pre-fill a budget line's cost, and offer to save an override back"
```

---

### Task 6: The markup panel prices from the rate card first

**Files:**
- Modify: `src/app/api/doz/projects/pricing/route.ts`
- Modify: `src/components/modules/projects/markup-panel.tsx`

**Interfaces:**
- Consumes: `ServiceItem.standardClientRate`; `suggestOfficialPrice` from `@/lib/pricing`
- Produces: each pricing line gains `suggestedSource: "RATE_CARD" | "MARKUP"`

- [ ] **Step 1: Prefer a published rate**

In the pricing route's GET, for each cost line, look up the matching `ServiceItem` by name and category. Where it has a `standardClientRate`, use that as `suggested` and set `suggestedSource: "RATE_CARD"`. Otherwise fall back to `suggestOfficialPrice(unitPrice, category)` and set `suggestedSource: "MARKUP"`.

Resolve every service in **one** query — collect the distinct name/category pairs and fetch them together. Do not query per line.

Add a comment recording why: a published rate beats a formula, because a stage does not mark up like a camera and some services are priced by package rather than as a multiple of cost.

- [ ] **Step 2: Show the founder which is which**

In the markup panel, label each suggested figure: **Rate card** or **×1.35 markup**. The founder should never wonder where a number came from — one is a decision already made, the other is a guess the app is offering.

- [ ] **Step 3: Verify against the live database, rolled back**

Write a script at the project root that, inside a transaction always throwing `__ROLLBACK__`, creates a project with two cost lines — one whose service has a `standardClientRate` and one whose service does not — and prints each line's `suggested` and `suggestedSource`. Assert the first equals the published rate exactly and the second equals cost × the section multiplier. Report the figures, then delete the script.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/doz/projects/pricing/route.ts src/components/modules/projects/markup-panel.tsx
git commit -m "feat(pricing): price from the rate card, fall back to the multiplier"
```

---

### Task 7: Rebuild and seed the catalogue

**Files:**
- Create: `prisma/seed-rate-card.mjs`

**Interfaces:**
- Consumes: `ServiceCategory`, `ServiceItem`
- Produces: the departments and rates in the live database

- [ ] **Step 1: Write an idempotent seed script**

Committed, unlike the throwaway verification scripts, because it documents where the rates came from.

**Idempotent:** skip any department or service whose name already exists rather than duplicating it. Report per row whether it was created or already present. Re-running must create nothing.

**Not destructive:** no `deleteMany`, no `delete`, no `updateMany`, no reset. The existing six departments and 31 services stay; new departments and services are added alongside, and the founder prunes what they do not want in the Catalogue tab.

Departments and services, with BP from D1Z's equipment-rental cost sheet and CP from the founder's 2026 rate card. **Where only one of the two is known, seed that one and leave the other null** — an unpriced field is honest.

| Department | Service | BP | CP | Unit |
|---|---|---|---|---|
| Displays | LED screen (6sqm) | 150000 | 225000 | DAY |
| Displays | TV + stand | 40000 | 60000 | DAY |
| Displays | TV display | 35000 | 50000 | DAY |
| Displays | Standing monitor | — | — | DAY |
| Displays | Floor monitor | — | — | DAY |
| Displays | Control room monitor | — | — | DAY |
| Displays | Stage timer | — | — | DAY |
| Displays | LED processor | — | 50000 | DAY |
| Displays | LED technician | — | 50000 | DAY |
| Cameras & Capture | Professional camera package | 30000 | 45000 | DAY |
| Cameras & Capture | B-roll camera package | 100000 | 150000 | DAY |
| Cameras & Capture | 6-channel HD mixer + monitor | 25000 | 30000 | DAY |
| Cameras & Capture | Blackmagic recorder | 20000 | 30000 | DAY |
| Cameras & Capture | Wireless receiver | 15000 | 25000 | DAY |
| Cameras & Capture | Cables & connectors package | 50000 | 75000 | UNIT |
| Cameras & Capture | Camera tripod | — | 15000 | DAY |
| Sound | Standard event sound | 250000 | 300000 | DAY |
| Sound | Small meeting sound system | — | 150000 | DAY |
| Sound | Medium event sound | — | 400000 | DAY |
| Sound | Wireless microphone | — | 25000 | DAY |
| Sound | Wired microphone | — | 10000 | DAY |
| Sound | Sound engineer | — | 50000 | DAY |
| Lighting | Stage & ambient lighting | 180000 | 225000 | DAY |
| Lighting | Stage lighting package | — | 300000 | DAY |
| Lighting | Stage light strip / install | 135800 | — | UNIT |
| Lighting | Moving head lighting | — | 50000 | DAY |
| Lighting | LED par / wash light | — | 15000 | DAY |
| Lighting | Lighting technician | — | 40000 | DAY |
| Streaming & Broadcast | Livestreaming | 70000 | 150000 | DAY |
| Streaming & Broadcast | Streaming technician | — | 50000 | DAY |
| Streaming & Broadcast | Stream director | — | 75000 | DAY |
| Streaming & Broadcast | Graphics / lower thirds | — | 50000 | UNIT |
| Streaming & Broadcast | Internet / data | 16000 | 25000 | DAY |
| Stage & Scenic Fabrication | Stage | 390000 | 500000 | UNIT |
| Stage & Scenic Fabrication | Standard corporate stage | — | 650000 | UNIT |
| Stage & Scenic Fabrication | Stage fascia | — | 100000 | UNIT |
| Stage & Scenic Fabrication | Stage installation | — | 75000 | UNIT |
| Branding & Print | Branding materials | 461000 | — | UNIT |
| Branding & Print | Workmanship / fabrication | 150000 | — | UNIT |
| Branding & Print | Printing | 298000 | — | UNIT |
| Branding & Print | Directional signage | — | 25000 | UNIT |
| Branding & Print | Pull-up banner | — | 35000 | UNIT |
| Branding & Print | Backdrop branding | — | 100000 | UNIT |
| Furniture | Bucket chair | 15000 | 20000 | UNIT |
| Furniture | Panel chair | 15000 | 20000 | UNIT |
| Furniture | Side table | 10000 | 15000 | UNIT |
| Furniture | Counter table | — | 10000 | UNIT |
| Furniture | High stool | — | 15000 | UNIT |
| Personnel | Videographer | 30000 | 45000 | PERSON |
| Personnel | Senior videographer | — | 60000 | PERSON |
| Personnel | Photographer | 100000 | 120000 | PERSON |
| Personnel | Production manager | 250000 | 325000 | PERSON |
| Personnel | Camera assistant | — | 30000 | PERSON |
| Personnel | Technical director | — | 100000 | PERSON |
| Logistics & Welfare | Local production transport | 40000 | 50000 | UNIT |
| Logistics & Welfare | Equipment transport | — | 75000 | UNIT |
| Logistics & Welfare | Crew catering | 32000 | 50000 | DAY |
| Post-Production | Basic event edit | — | 150000 | UNIT |
| Post-Production | Standard event highlight | — | 200000 | UNIT |
| Post-Production | Conference recap | — | 250000 | UNIT |
| Colour Grading | Basic colour correction | — | 100000 | UNIT |
| Colour Grading | Corporate video grade | — | 150000 | UNIT |
| Motion Graphics | Lower third package | — | 100000 | UNIT |
| Motion Graphics | Animated logo | — | 150000 | UNIT |
| Motion Graphics | Event screen graphics | — | 150000 | UNIT |
| Exhibition Stands | Basic shell scheme | — | 350000 | UNIT |
| Exhibition Stands | Branded shell scheme | — | 500000 | UNIT |
| Exhibition Stands | Standard custom booth | — | 750000 | UNIT |
| Exhibition Stands | Premium custom booth | — | 1500000 | UNIT |
| Drone | Event drone coverage | — | 200000 | DAY |
| Drone | Cinematic drone shoot | — | 250000 | DAY |

Two figures are midpoints where the founder's cost sheet disagreed with itself, and must be **printed by the script as needing confirmation**: the 6-channel mixer at 25,000 (sheet showed 30,000 and 20,000) and local transport at 40,000 (50,000 and 30,000). Lighting seeds at 180,000 on the founder's direct instruction.

- [ ] **Step 2: Run it, then run it again**

```bash
node --env-file=.env prisma/seed-rate-card.mjs
node --env-file=.env prisma/seed-rate-card.mjs
```

The first run creates; **the second must create nothing** and report every row as already present. Report both outputs.

- [ ] **Step 3: Verify read-only**

Query and report: department count, service count, how many carry a BP, how many carry a CP, and any service whose CP is below its BP (there should be none).

- [ ] **Step 4: Link the existing templates to the catalogue**

The three seeded templates — One-day production, Multi-day conference, Lecture
series — carry free-text line names and no costs. `EventTemplateItem.serviceItemId`
exists (Task 2) so a template line can take its rates from the catalogue rather than
a copy that goes stale.

In the same script, for every `EventTemplateItem` whose `name` matches a
`ServiceItem` name case-insensitively after trimming, set its `serviceItemId`.
Report how many of the 45 template lines matched and list the ones that did not, so
the founder can see which template lines have no catalogue service behind them yet.

Do not rename or invent a match to raise the count. An unmatched line is a real
signal that the catalogue is missing something.

Then, in `src/app/api/doz/projects/route.ts` where a template seeds cost lines, take
`unitPrice` from the linked service's `standardCost` when `serviceItemId` is set,
falling back to `defaultUnitCost` and then to 0. This is what makes "start a budget
from a template" produce real figures rather than an empty column — the founder's
stated reason for wanting a rate card at all.

Prove it with a rollback-transaction script: create a project from the Multi-day
conference template and show that its LED and camera lines arrive carrying the
catalogue's costs, with `totalPrice` still `quantity × days × unitPrice`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-rate-card.mjs src/app/api/doz/projects/route.ts
git commit -m "feat(rate-card): seed rates, and let templates draw costs from the catalogue"
```

---

### Task 8: The Budgets tab

The gap the founder actually hit: they created a project, opened Documents, and their budget was not there.

**Files:**
- Create: `src/components/modules/documents/budgets.tsx`
- Modify: `src/components/modules/documents.tsx`

**Interfaces:**
- Consumes: `GET /api/doz/projects` (returns `pricingStage`), `GET /api/doz/services?projectId=`
- Produces: `<Budgets />` as a tab

- [ ] **Step 1: Build the list**

**No new table.** A budget *is* the project's `ProjectService` rows. Creating a second store for what a job costs would repeat a mistake already in this codebase (`Referral` and `ReferralSource`).

List every project the viewer may see that has at least one cost line. Each row shows project name, line count, base total, and state derived from the lines and the project's `pricingStage`:

| State | Derived from |
|---|---|
| Draft | lines still `LISTED` |
| Submitted | any line `BUDGET_SUBMITTED` |
| Approved | all lines `APPROVED` or beyond, project still `BASE` |
| Priced | project `pricingStage === "OFFICIAL"` |

Access follows the cost sheet exactly, and the server already enforces it: founder and staff see any project, a production manager or freelancer only projects they manage, an intern gets a 403. **Do not render a row the viewer cannot open** — call `/api/doz/projects` first, which already scopes a PM to their own, and list from that.

- [ ] **Step 2: Open a budget**

Clicking a row opens its cost sheet — reuse `ServicesSection` from `projects-events.tsx` by exporting it, rather than building a second cost-sheet editor. Two editors would drift.

Actions, each already gated server-side: **Submit for approval**, **Approve**, **Price it** (opens the markup panel), and **Create quotation** — which is the one that closes the founder's gap, taking them straight to the document builder with the project preselected and its priced lines loaded.

`Create quotation` appears only when the project is `OFFICIAL`. Before that, show the plain sentence: `Price this budget first — the client price comes from the markup.`

- [ ] **Step 3: Add the tab**

In `documents.tsx`, add **Budgets** as the first tab, before Quotations — it is first in the chain.

- [ ] **Step 4: Verify by rendering**

Using the fixture technique from Task 4, mount `<Budgets />` with a mocked project list covering all four states. Confirm each state renders its correct label and actions, and that a `BASE` project shows the sentence rather than a Create quotation button. Screenshot, then delete the fixture.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/documents/budgets.tsx src/components/modules/documents.tsx src/components/modules/projects-events.tsx
git commit -m "feat(documents): put the budget where the founder went looking for it"
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

Expected: typecheck clean but for the 2 pre-existing `examples/` errors, all tests pass, lint exactly **40**.

- [ ] **Step 2: Production build**

```bash
mv examples /tmp/hold9
npm run build > /tmp/b9.log 2>&1; echo "EXIT=$?"
mv /tmp/hold9 examples
grep -iE "error|failed" /tmp/b9.log | head
```

Expected: `EXIT=0`.

- [ ] **Step 3: Prove the confidentiality boundary end to end**

Write a read-only script that prints, for a FOUNDER, STAFF, PRODUCTION_MANAGER, FREELANCER and INTERN, what each receives from the catalogue GET and from a project's cost sheet. Assert:

- `standardClientRate` reaches **only** the founder
- `standardCost` reaches founder, staff and production manager only
- `clientPrice` reaches only the founder
- service **names** reach everyone signed in, because the pickers need them

Report the output, then delete the script.

- [ ] **Step 4: Prove the markup correction**

Confirm `suggestOfficialPrice(390_000, "Stage & Scenic Fabrication")` is near the rate card's ₦500,000 and nowhere near the old ₦1,365,000. Confirm no section exceeds 1.5×.

- [ ] **Step 5: Confirm nothing pre-existing regressed**

`received-allocation.test.ts`, `crm-metrics.test.ts`, `document-math.test.ts`, `document-request.test.ts`, `document-code.test.ts` and `invoice-provenance.test.ts` must all still pass unchanged. Confirm with `git log --oneline` that none of those modules was modified. Confirm WHT still appears nowhere under `src/components/documents/` and that `expectedCash` is still `net − wht` for government clients.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "chore(rate-card): verification pass"
git push
```

---

## Deferred to the second plan

- **Quotation revisions** — `revision`, `rootId`, `supersededById`, the revise action, and `@@unique([code, revision])`.
- **Acceptance write-back** — `QuotationLine.sourceServiceId`, writing the agreed CP onto the project's lines and `Project.revenue`.
- **Deriving the manual fields** — removing "Project Cost" and "Total Contract Value" from New Project. Must come after the write-back, or every downstream figure drops to zero.
- **Dashboard approvals** — submitted budgets, proposed projects, expired quotations, invoices still in draft.
- **Commercial rules** — packages, overtime, multi-day discount bands, minimum charge, payment terms. These are pricing policy, not catalogue lines, and a package's cost must be derived from its components or it silently breaks the margin.
