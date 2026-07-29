# CRM Contracted Revenue — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM writable and replace its twelve vanity KPIs with one number the founder can move alone — the percentage of revenue under a signed recurring agreement.

**Architecture:** Metric maths lives in a pure, unit-tested module (`src/lib/crm-metrics.ts`) with no database or React dependency. The existing `GET /api/doz/crm` aggregate feeds it. Write paths extend the existing `POST /api/doz/crm/create` action-dispatch switch rather than adding new endpoints. UI is split out of the 945-line `crm-sales.tsx` into focused components under `src/components/modules/crm/`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 → Postgres/Supabase, Tailwind v4 + shadcn/ui, sonner for toasts.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-29-founder-dependent-revenue-design.md`. Phase 1 only.
- **No new dependencies.** Tests use built-in `node:test` with native TypeScript type-stripping (verified working on Node v22.23.1). Test files must use *erasable* TypeScript only — type annotations and interfaces, **no enums, no parameter properties, no namespaces**.
- **`typescript.ignoreBuildErrors` is `false`** in `next.config.ts`. Any type error fails the Vercel build. Run `npx tsc --noEmit` before every commit.
- **Lint baseline is 6 pre-existing errors** across `crm-sales.tsx`/`projects-events.tsx` (`react-hooks/set-state-in-effect`). Do not add more. Never call `setState` synchronously in a `useEffect` body — set state only inside async callbacks.
- **Currency is NGN.** Use `formatNGN` from `src/lib/format.ts`. Never hardcode a currency symbol.
- **Revenue means `sum(Invoice.amountPaid)`**, consistent with how "Received" is computed in `src/app/api/doz/projects/route.ts`. Never use `Project.revenue` for a revenue metric — that is a target, not money collected.
- **Auth:** every route uses `getSessionUser()` from `src/lib/auth.ts`. CRM is FOUNDER + STAFF only; contract writes are FOUNDER-only.
- **The database is production.** `DATABASE_URL` points at the live Supabase shared with https://doz-os.vercel.app. Any script that writes must run inside a transaction that rolls back, unless the founder has explicitly approved a real write.
- **Before the first commit**, remove the temporary `[AUTH-DEBUG]` logging block from `src/lib/auth.ts`. It logs every account email on an unknown-email sign-in attempt and must never reach production.
- **The founder pushes.** Do not `git push`. His deploy flow is `git add . && git commit && git push` run by him from VS Code.

---

### Task 1: Metric functions (pure, test-driven)

**Files:**
- Create: `src/lib/crm-metrics.ts`
- Create: `src/lib/crm-metrics.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface AccountMetricInput { id: string; revenue: number; contactCount: number; hasActiveRecurringContract: boolean }`
  - `contractedRevenuePct(accounts: AccountMetricInput[]): number`
  - `multiThreadedAccountsPct(accounts: AccountMetricInput[]): number`
  - `isSingleThreaded(account: { contactCount: number }): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/crm-metrics.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractedRevenuePct,
  multiThreadedAccountsPct,
  isSingleThreaded,
  type AccountMetricInput,
} from "./crm-metrics.ts";

function account(over: Partial<AccountMetricInput> = {}): AccountMetricInput {
  return {
    id: "a1",
    revenue: 0,
    contactCount: 0,
    hasActiveRecurringContract: false,
    ...over,
  };
}

test("contractedRevenuePct is 0 for no accounts", () => {
  assert.equal(contractedRevenuePct([]), 0);
});

test("contractedRevenuePct is 0 when no account has a recurring contract", () => {
  const accounts = [account({ revenue: 5_000_000 }), account({ id: "a2", revenue: 3_000_000 })];
  assert.equal(contractedRevenuePct(accounts), 0);
});

test("contractedRevenuePct is 100 when all revenue is contracted", () => {
  const accounts = [account({ revenue: 5_000_000, hasActiveRecurringContract: true })];
  assert.equal(contractedRevenuePct(accounts), 100);
});

test("contractedRevenuePct weights by revenue, not account count", () => {
  // 3M contracted out of 12M total = 25%
  const accounts = [
    account({ id: "a1", revenue: 3_000_000, hasActiveRecurringContract: true }),
    account({ id: "a2", revenue: 9_000_000 }),
  ];
  assert.equal(contractedRevenuePct(accounts), 25);
});

test("contractedRevenuePct is 0 when total revenue is 0 (no divide by zero)", () => {
  const accounts = [account({ revenue: 0, hasActiveRecurringContract: true })];
  assert.equal(contractedRevenuePct(accounts), 0);
});

test("multiThreadedAccountsPct counts accounts with 2+ contacts", () => {
  const accounts = [
    account({ id: "a1", contactCount: 3 }),
    account({ id: "a2", contactCount: 1 }),
    account({ id: "a3", contactCount: 0 }),
    account({ id: "a4", contactCount: 2 }),
  ];
  assert.equal(multiThreadedAccountsPct(accounts), 50);
});

test("multiThreadedAccountsPct is 0 for no accounts", () => {
  assert.equal(multiThreadedAccountsPct([]), 0);
});

test("isSingleThreaded is true for 0 or 1 contacts, false for 2+", () => {
  assert.equal(isSingleThreaded({ contactCount: 0 }), true);
  assert.equal(isSingleThreaded({ contactCount: 1 }), true);
  assert.equal(isSingleThreaded({ contactCount: 2 }), false);
});
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test src/lib/"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './crm-metrics.ts'`

- [ ] **Step 4: Write the implementation**

Create `src/lib/crm-metrics.ts`:

```typescript
// Growth metrics for the CRM module.
//
// Pure functions — no database, no React. The single organising metric is
// contracted revenue: the share of money actually collected that sits under a
// signed recurring agreement. See
// docs/superpowers/specs/2026-07-29-founder-dependent-revenue-design.md

export interface AccountMetricInput {
  id: string;
  /** Money collected from this account — sum(Invoice.amountPaid). */
  revenue: number;
  /** Number of known contacts at the client. */
  contactCount: number;
  /** Has a Contract with isRecurring = true and status = "ACTIVE". */
  hasActiveRecurringContract: boolean;
}

/**
 * Percentage of collected revenue that sits under an active recurring
 * agreement. Weighted by money, not by account count — one retained energy
 * major matters more than five small one-off jobs.
 */
export function contractedRevenuePct(accounts: AccountMetricInput[]): number {
  const total = accounts.reduce((sum, a) => sum + a.revenue, 0);
  if (total <= 0) return 0;
  const contracted = accounts
    .filter((a) => a.hasActiveRecurringContract)
    .reduce((sum, a) => sum + a.revenue, 0);
  return (contracted / total) * 100;
}

/** An account is single-threaded when we know fewer than two people there. */
export function isSingleThreaded(account: { contactCount: number }): boolean {
  return account.contactCount < 2;
}

/**
 * Percentage of accounts where we know two or more people — the client-side
 * key-person risk measure.
 */
export function multiThreadedAccountsPct(accounts: AccountMetricInput[]): number {
  if (accounts.length === 0) return 0;
  const multi = accounts.filter((a) => !isSingleThreaded(a)).length;
  return (multi / accounts.length) * 100;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — `# pass 8`, `# fail 0`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output (the two `examples/` errors are pre-existing and gitignored)

- [ ] **Step 7: Commit**

```bash
git add src/lib/crm-metrics.ts src/lib/crm-metrics.test.ts package.json
git commit -m "feat(crm): add contracted-revenue metric functions with tests"
```

---

### Task 2: Schema — account-level recurring contracts

**Files:**
- Modify: `prisma/schema.prisma` (models `Contract`, `FollowUp`, `Lead`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Contract.projectId` nullable, `Contract.isRecurring: Boolean`, `Contract.renewalDate: DateTime?`, `FollowUp.leadId: String?`, `Lead.direction: String`, `Lead.accountId: String?`.

**Why this is first among the data changes:** `Contract.projectId` is currently required, so a contract cannot exist without a project. An annual retainer with Shell has nowhere to live until this is relaxed. Nothing else in Phase 1 works without it.

- [ ] **Step 1: Relax `Contract.projectId` and add retainer fields**

In `prisma/schema.prisma`, model `Contract`, change:

```prisma
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
```

to:

```prisma
  // Optional: a retainer belongs to an Account, not a Project.
  projectId   String?
  project     Project? @relation(fields: [projectId], references: [id])
  isRecurring Boolean  @default(false) // true = retainer, false = one-off project contract
  renewalDate DateTime?
```

- [ ] **Step 2: Update the `Project.contracts` back-relation**

No change is needed to `model Project` — `contracts Contract[]` still compiles against an optional relation. Confirm it is still present and unchanged.

- [ ] **Step 3: Let a lead carry a reminder**

In `model FollowUp`, add alongside the existing `contactId`/`opportunityId` fields:

```prisma
  leadId        String?
  lead          Lead?    @relation(fields: [leadId], references: [id])
```

and add to the model's index block:

```prisma
  @@index([leadId])
```

- [ ] **Step 4: Add lead direction and account link**

In `model Lead`, add:

```prisma
  direction   String   @default("INBOUND") // INBOUND (they asked) | OUTBOUND (we are going after them)
  accountId   String?
  account     Account? @relation(fields: [accountId], references: [id])
  followUps   FollowUp[]
```

In `model Account`, add the back-relation:

```prisma
  leads         Lead[]
```

- [ ] **Step 5: Validate the schema and regenerate the client**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` followed by `Generated Prisma Client`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

If `Contract.projectId` becoming nullable breaks a consumer, fix the consumer — do not revert the schema. Check `src/app/api/doz/contracts/route.ts` first.

- [ ] **Step 7: STOP — the founder runs the migration**

This writes to the production Supabase database shared with the live site. **Do not run it yourself.** Present this command and wait for confirmation that it succeeded:

```bash
npx prisma db push
```

All five changes are additive (new nullable columns, one relaxed constraint, one index) and non-destructive. `prisma db push` will report `Your database is now in sync with your Prisma schema.`

- [ ] **Step 8: Verify the columns exist (read-only)**

After the founder confirms, run this read-only check:

```bash
node -e '
const fs=require("fs");
for(const l of fs.readFileSync(".env","utf8").split("\n")){const m=l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);if(m)process.env[m[1]]=m[2];}
const {PrismaClient}=require("@prisma/client");const db=new PrismaClient();
db.$queryRawUnsafe(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE (table_name=$1 AND column_name IN ($2,$3,$4)) OR (table_name=$5 AND column_name=$6) OR (table_name=$7 AND column_name IN ($8,$9)) ORDER BY table_name, column_name`,
"Contract","projectId","isRecurring","renewalDate","FollowUp","leadId","Lead","direction","accountId")
.then(r=>{console.table(r);return db.$disconnect();});
'
```

Expected: six rows — `Contract.isRecurring`, `Contract.projectId` (`is_nullable = YES`), `Contract.renewalDate`, `FollowUp.leadId`, `Lead.accountId`, `Lead.direction`.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): allow account-level recurring contracts, link leads to follow-ups"
```

---

### Task 3: CRM API — expose contracts, contact counts and the new metrics

**Files:**
- Modify: `src/app/api/doz/crm/route.ts`

**Interfaces:**
- Consumes: `contractedRevenuePct`, `multiThreadedAccountsPct`, `isSingleThreaded`, `type AccountMetricInput` from `@/lib/crm-metrics`.
- Produces: on each entry of the `accounts` array — `revenue: number`, `contactCount: number`, `isSingleThreaded: boolean`, `contract: { id, title, status, isRecurring, renewalDate, value } | null`. On `stats` — `contractedRevenuePct: number`, `multiThreadedAccountsPct: number`.

- [ ] **Step 1: Import the metric helpers**

At the top of `src/app/api/doz/crm/route.ts`, after the existing imports:

```typescript
import {
  contractedRevenuePct,
  multiThreadedAccountsPct,
  isSingleThreaded,
  type AccountMetricInput,
} from "@/lib/crm-metrics";
```

- [ ] **Step 2: Load contracts, invoices and contact counts**

Inside the existing `Promise.all([...])`, change the `db.account.findMany` call to include what the metrics need, and add two new queries at the end of the array:

```typescript
      db.account.findMany({
        include: {
          _count: { select: { opportunities: true, projects: true, contacts: true } },
          contracts: {
            where: { isRecurring: true },
            orderBy: { renewalDate: "asc" },
          },
        },
        orderBy: { lifetimeValue: "desc" },
      }),
```

and append to the same `Promise.all` array (after `db.referral.findMany(...)`):

```typescript
      // Money actually collected, grouped by account — the revenue basis for
      // every metric on this page. Matches how "Received" is computed for
      // projects in /api/doz/projects.
      db.invoice.groupBy({
        by: ["accountId"],
        _sum: { amountPaid: true },
      }),
```

Add `invoiceTotals` as the matching name at the end of the destructuring array:

```typescript
  const [opportunities, accounts, contacts, leads, proposals, followUps, teamMembers, referrals, invoiceTotals] =
    await Promise.all([
```

- [ ] **Step 3: Compute the metric inputs**

Immediately before the existing `return NextResponse.json({`, add:

```typescript
  // ---- growth metrics (see docs/superpowers/specs/2026-07-29-...) ----
  const revenueByAccount = new Map<string, number>();
  for (const row of invoiceTotals) {
    if (row.accountId) revenueByAccount.set(row.accountId, row._sum.amountPaid ?? 0);
  }

  const metricInput: AccountMetricInput[] = accounts.map((a) => ({
    id: a.id,
    revenue: revenueByAccount.get(a.id) ?? 0,
    contactCount: a._count.contacts,
    hasActiveRecurringContract: a.contracts.some(
      (c) => c.isRecurring && c.status === "ACTIVE",
    ),
  }));

  const contractedPct = contractedRevenuePct(metricInput);
  const multiThreadedPct = multiThreadedAccountsPct(metricInput);
```

- [ ] **Step 4: Enrich each shaped account**

Find `shapedAccounts` and add these fields to the object it maps to (keep every existing field):

```typescript
    revenue: revenueByAccount.get(a.id) ?? 0,
    contactCount: a._count.contacts,
    isSingleThreaded: isSingleThreaded({ contactCount: a._count.contacts }),
    contract: a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]
      ? {
          id: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).id,
          title: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).title,
          status: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).status,
          isRecurring: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).isRecurring,
          renewalDate: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).renewalDate,
          value: (a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0]).value,
        }
      : null,
```

If that repetition is unpleasant, hoist it first:

```typescript
    const activeContract = a.contracts.find((c) => c.status === "ACTIVE") ?? a.contracts[0] ?? null;
```

and use `activeContract` in the object.

- [ ] **Step 5: Add the metrics to `stats`**

In the returned `stats` object, add two fields (leave the existing ones for now — Task 7 removes them from the UI):

```typescript
      contractedRevenuePct: contractedPct,
      multiThreadedAccountsPct: multiThreadedPct,
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

- [ ] **Step 7: Verify the route still compiles and guards auth**

With the dev server running (`npm run dev`):

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/doz/crm`
Expected: `401` — proves the module compiles. A `500` means a runtime error; read the server output.

- [ ] **Step 8: Verify the computed numbers against the database (read-only)**

```bash
node -e '
const fs=require("fs");
for(const l of fs.readFileSync(".env","utf8").split("\n")){const m=l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);if(m)process.env[m[1]]=m[2];}
const {PrismaClient}=require("@prisma/client");const db=new PrismaClient();
(async()=>{
  const accounts=await db.account.findMany({include:{_count:{select:{contacts:true}},contracts:{where:{isRecurring:true}}}});
  const totals=await db.invoice.groupBy({by:["accountId"],_sum:{amountPaid:true}});
  const rev=new Map(totals.filter(t=>t.accountId).map(t=>[t.accountId,t._sum.amountPaid??0]));
  let total=0,contracted=0,multi=0;
  for(const a of accounts){
    const r=rev.get(a.id)??0; total+=r;
    if(a.contracts.some(c=>c.status==="ACTIVE"))contracted+=r;
    if(a._count.contacts>=2)multi++;
  }
  console.log("accounts:",accounts.length);
  console.log("contracted revenue %:",total>0?(contracted/total*100).toFixed(1):"0.0");
  console.log("multi-threaded %:",accounts.length?(multi/accounts.length*100).toFixed(1):"0.0");
  await db.$disconnect();
})();
'
```

Expected on current seed data: `contracted revenue %: 0.0` (no recurring contracts exist yet) and a non-zero account count. Record these numbers — Task 7 must display exactly the same values.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/doz/crm/route.ts
git commit -m "feat(crm): expose contracted revenue and contact-count metrics"
```

---

### Task 4: CRM write API — leads, contacts and contracts

**Files:**
- Modify: `src/app/api/doz/crm/create/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: four new `action` values on `POST /api/doz/crm/create` — `create_lead`, `create_contact`, `create_contract`, `update_contract`. Each returns `{ ok: true, <entity> }` with HTTP 201 for creates, 200 for updates.

**Why:** the dispatch switch currently supports only `create_account`, `create_opportunity`, `create_proposal`, `create_followup`, `create_referral` and the deletes. There is no way to create a lead, a contact, or a contract — which is most of Phase 1.

- [ ] **Step 1: Register the new actions in the switch**

In the `switch (action)` block, add before `default:`:

```typescript
      case "create_lead":
        return await createLead(body);
      case "create_contact":
        return await createContact(body);
      case "create_contract":
        return await createContract(body, sessionUser);
      case "update_contract":
        return await updateContract(body, sessionUser);
```

- [ ] **Step 2: Implement `createLead`**

Add alongside the other handlers:

```typescript
// A lead is the one-line capture: an inbound enquiry or an outbound target.
// Only `contactName` is required — capture must take seconds, not minutes.
async function createLead(body: any) {
  const { contactName, company, source, sourceDetail, serviceInterest, value, direction, accountId } = body;

  if (!contactName || typeof contactName !== "string" || !contactName.trim()) {
    return NextResponse.json({ error: "contactName is required" }, { status: 400 });
  }

  const dir = direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

  const lead = await db.lead.create({
    data: {
      contactName: contactName.trim(),
      company: company?.trim() || null,
      source: typeof source === "string" && source.trim() ? source.trim() : "REFERRAL",
      sourceDetail: sourceDetail?.trim() || null,
      serviceInterest: serviceInterest?.trim() || null,
      value: Number(value) || 0,
      direction: dir,
      accountId: accountId || null,
      status: "NEW",
    },
  });

  return NextResponse.json({ ok: true, lead }, { status: 201 });
}
```

- [ ] **Step 3: Implement `createContact`**

```typescript
// Adding a second contact to an account is how single-threading gets fixed,
// so this stays deliberately minimal: a name and an account.
async function createContact(body: any) {
  const { name, accountId, title, email, phone, isDecisionMaker } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (accountId) {
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "account not found" }, { status: 404 });
    }
  }

  const contact = await db.contact.create({
    data: {
      name: name.trim(),
      accountId: accountId || null,
      title: title?.trim() || null,
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
      isDecisionMaker: Boolean(isDecisionMaker),
    },
  });

  return NextResponse.json({ ok: true, contact }, { status: 201 });
}
```

- [ ] **Step 4: Implement `createContract` and `updateContract`**

```typescript
const CONTRACT_STATUSES = new Set(["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"]);

// Contracts move money and define the company's recurring revenue, so they are
// FOUNDER-only. A retainer has an accountId and no projectId.
async function createContract(body: any, sessionUser: { role: string }) {
  if (sessionUser.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
  }
  const { accountId, title, value, status, isRecurring, startDate, endDate, renewalDate, notes } = body;

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }
  const nextStatus = CONTRACT_STATUSES.has(status) ? status : "DRAFT";

  const contract = await db.contract.create({
    data: {
      accountId,
      projectId: null,
      title: String(title).trim(),
      value: Number(value) || 0,
      status: nextStatus,
      isRecurring: isRecurring !== false,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, contract }, { status: 201 });
}

async function updateContract(body: any, sessionUser: { role: string }) {
  if (sessionUser.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
  }
  const { contractId, title, value, status, isRecurring, startDate, endDate, renewalDate, notes } = body;

  if (!contractId) {
    return NextResponse.json({ error: "contractId is required" }, { status: 400 });
  }
  const existing = await db.contract.findUnique({ where: { id: contractId } });
  if (!existing) {
    return NextResponse.json({ error: "contract not found" }, { status: 404 });
  }

  const data: any = {};
  if (title !== undefined) data.title = String(title).trim();
  if (value !== undefined) data.value = Number(value) || 0;
  if (status !== undefined && CONTRACT_STATUSES.has(status)) data.status = status;
  if (isRecurring !== undefined) data.isRecurring = Boolean(isRecurring);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (renewalDate !== undefined) data.renewalDate = renewalDate ? new Date(renewalDate) : null;
  if (notes !== undefined) data.notes = notes?.trim() || null;

  const contract = await db.contract.update({ where: { id: contractId }, data });
  return NextResponse.json({ ok: true, contract });
}
```

- [ ] **Step 5: Confirm the session user is in scope**

`createContract`/`updateContract` take `sessionUser`. The `POST` handler already resolves `sessionUser` via `getSessionUser()` near the top. Confirm the variable name matches; if the existing code names it differently, use that name rather than renaming it.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

- [ ] **Step 7: Verify each action against the database, rolling back**

```bash
node -e '
const fs=require("fs");
for(const l of fs.readFileSync(".env","utf8").split("\n")){const m=l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);if(m)process.env[m[1]]=m[2];}
const {PrismaClient}=require("@prisma/client");const db=new PrismaClient();
const RB="__ROLLBACK__";
(async()=>{
 try{
  await db.$transaction(async(tx)=>{
    const acct=await tx.account.findFirst();
    const lead=await tx.lead.create({data:{contactName:"Test Person",company:"Test Co",source:"NETWORKING",direction:"OUTBOUND",accountId:acct.id,status:"NEW"}});
    console.log("create_lead OK:",lead.contactName,lead.direction);
    const contact=await tx.contact.create({data:{name:"Second Contact",accountId:acct.id}});
    console.log("create_contact OK:",contact.name);
    const contract=await tx.contract.create({data:{accountId:acct.id,projectId:null,title:"Annual Retainer",value:24000000,status:"ACTIVE",isRecurring:true}});
    console.log("create_contract OK (no projectId):",contract.title,contract.status,contract.isRecurring);
    const fu=await tx.followUp.create({data:{leadId:lead.id,subject:"Send the material",dueDate:new Date(),type:"EMAIL"}});
    console.log("followUp linked to lead OK:",fu.subject);
    throw new Error(RB);
  },{timeout:60000,maxWait:20000});
 }catch(e){ if(e.message!==RB){console.error("FAILED:",e.message);process.exitCode=1;} }
 console.log("rolled back — contracts now:",await db.contract.count());
 await db.$disconnect();
})();
'
```

Expected: four `OK` lines, then the contract count unchanged from before the run. A failure on `projectId: null` means Task 2 Step 7 (`prisma db push`) has not been run.

If `followUp.create` rejects `type`, check `model FollowUp` for whether `type` is required and adjust the test payload — do not change the schema.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/doz/crm/create/route.ts
git commit -m "feat(crm): add create_lead, create_contact and contract write actions"
```

---

### Task 5: Quick capture — log an enquiry in one line

**Files:**
- Create: `src/components/modules/crm/quick-capture.tsx`
- Modify: `src/components/modules/crm-sales.tsx`

**Interfaces:**
- Consumes: `POST /api/doz/crm/create` with `action: "create_lead"` (Task 4).
- Produces: `<QuickCapture onCreated={() => void} />` — a single always-visible input.

**Why it matters more than it looks:** every metric in this plan is false if the founder does not log things. If capture takes longer than about ten seconds it will not happen at 9pm on a phone.

- [ ] **Step 1: Create the component**

Create `src/components/modules/crm/quick-capture.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// One-line capture. Type a name, press Enter, done. Everything else is
// optional and can be filled in later from the list.
export function QuickCapture({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = text.trim();
    if (!value) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_lead",
          contactName: value,
          direction,
          source: direction === "OUTBOUND" ? "COLD" : "REFERRAL",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setText("");
      toast.success(direction === "OUTBOUND" ? "Target added" : "Enquiry logged");
      onCreated();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3 sm:flex-row sm:items-center">
      <div className="flex shrink-0 gap-1">
        {(["INBOUND", "OUTBOUND"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              direction === d
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {d === "INBOUND" ? "They asked" : "I'm chasing"}
          </button>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        placeholder={
          direction === "INBOUND"
            ? "Log an enquiry — who got in touch?"
            : "Who do you want to reach?"
        }
        className="flex-1"
      />
      <Button onClick={save} disabled={saving || !text.trim()} size="sm" className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Log
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the CRM page**

In `src/components/modules/crm-sales.tsx`, import it:

```tsx
import { QuickCapture } from "@/components/modules/crm/quick-capture";
```

and render it as the first child of the outermost `<div className="space-y-5">`, above the KPI row:

```tsx
      <QuickCapture onCreated={load} />
```

`load` is the existing data-fetching function in this component. If it is named differently, use the existing name — do not rename it.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

Run: `npx eslint src/components/modules/crm-sales.tsx src/components/modules/crm/quick-capture.tsx 2>&1 | tail -3`
Expected: no more than the pre-existing error count for `crm-sales.tsx`. `quick-capture.tsx` must contribute zero.

- [ ] **Step 4: Verify in the browser**

Sign in as the founder at http://localhost:3000, open CRM & Sales, type a name into the capture box and press Enter.

Expected: a "Enquiry logged" toast, the input clears, and the new lead appears after the list refreshes. Confirm it persisted:

```bash
node -e '
const fs=require("fs");
for(const l of fs.readFileSync(".env","utf8").split("\n")){const m=l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);if(m)process.env[m[1]]=m[2];}
const {PrismaClient}=require("@prisma/client");const db=new PrismaClient();
db.lead.findMany({orderBy:{createdAt:"desc"},take:3,select:{contactName:true,direction:true,source:true,createdAt:true}}).then(r=>{console.table(r);return db.$disconnect();});
'
```

This is a **real write** to the production database. Delete the test lead afterwards from the UI, or leave it if it is a genuine enquiry.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/crm/quick-capture.tsx src/components/modules/crm-sales.tsx
git commit -m "feat(crm): add one-line enquiry capture"
```

---

### Task 6: Accounts as an asset register

**Files:**
- Create: `src/components/modules/crm/contact-dialog.tsx`
- Create: `src/components/modules/crm/contract-dialog.tsx`
- Modify: `src/components/modules/crm-sales.tsx` (Accounts tab only)

**Interfaces:**
- Consumes: `create_contact`, `create_contract`, `update_contract` (Task 4); `isSingleThreaded`/`contract` fields on each account (Task 3).
- Produces: `<ContactDialog accountId accountName open onOpenChange onSaved />` and `<ContractDialog account open onOpenChange onSaved />`.

- [ ] **Step 1: Create the contact dialog**

Create `src/components/modules/crm/contact-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ContactDialog({
  accountId,
  accountName,
  open,
  onOpenChange,
  onSaved,
}: {
  accountId: string | null;
  accountName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_contact",
          accountId,
          name: name.trim(),
          title: title.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success(`${name.trim()} added to ${accountName}`);
      setName(""); setTitle(""); setEmail(""); setPhone("");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't add contact", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add a contact at {accountName}</DialogTitle>
          <DialogDescription>
            Knowing a second person here protects the account if your main contact moves on.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">Role</Label>
            <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Head of Communications" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the contract dialog**

Create `src/components/modules/crm/contract-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"] as const;

export interface ContractAccount {
  id: string;
  name: string;
  contract: {
    id: string;
    title: string;
    status: string;
    isRecurring: boolean;
    renewalDate: string | null;
    value: number;
  } | null;
}

export function ContractDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: ContractAccount | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const existing = account?.contract ?? null;

  const [title, setTitle] = useState("Annual Retainer");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [startDate, setStartDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form state when a different account opens. Canonical
  // "store info from previous renders" pattern — avoids setState in an effect,
  // which the lint baseline forbids.
  const [prevId, setPrevId] = useState<string | null>(account?.id ?? null);
  if ((account?.id ?? null) !== prevId) {
    setPrevId(account?.id ?? null);
    setTitle(existing?.title ?? "Annual Retainer");
    setValue(existing ? String(existing.value) : "");
    setStatus(existing?.status ?? "DRAFT");
    setStartDate("");
    setRenewalDate(existing?.renewalDate ? existing.renewalDate.slice(0, 10) : "");
    setSaving(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!account || !title.trim() || saving) return;
    setSaving(true);
    try {
      const body = existing
        ? {
            action: "update_contract",
            contractId: existing.id,
            title: title.trim(),
            value: Number(value) || 0,
            status,
            isRecurring: true,
            startDate: startDate || undefined,
            renewalDate: renewalDate || undefined,
          }
        : {
            action: "create_contract",
            accountId: account.id,
            title: title.trim(),
            value: Number(value) || 0,
            status,
            isRecurring: true,
            startDate: startDate || undefined,
            renewalDate: renewalDate || undefined,
          };

      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success("Retainer saved", {
        description:
          status === "ACTIVE"
            ? "Counts toward contracted revenue."
            : "Set it to Active once signed so it counts.",
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save retainer", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit retainer" : "Add a retainer"} — {account?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            Only contracts marked Active count toward contracted revenue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="k-title">Title *</Label>
            <Input id="k-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-value">Annual value (NGN)</Label>
              <Input id="k-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="k-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-start">Start date</Label>
              <Input id="k-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-renew">Renews on</Label>
              <Input id="k-renew" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save retainer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Rework the Accounts tab**

In `crm-sales.tsx`, in the Accounts table, add two columns and one action:

- **Contacts** — render `a.contactCount`, and when `a.isSingleThreaded` show an amber warning badge reading `Single contact` with an `AlertTriangle` icon.
- **Contract** — when `a.contract` exists render its status and, if `renewalDate` is set, `Renews {formatDate(a.contract.renewalDate)}`. Otherwise render a muted `No contract`.
- Row buttons: **Add contact** (opens `ContactDialog`) and **Retainer** (opens `ContractDialog`).

Hold the open dialog in the parent:

```tsx
const [contactFor, setContactFor] = useState<Account | null>(null);
const [contractFor, setContractFor] = useState<Account | null>(null);
```

and render both dialogs once, after the table, driven by those two pieces of state. Do not render a dialog per row.

- [ ] **Step 4: Extend the `Account` type**

In `crm-sales.tsx`, add to the existing `type Account`:

```typescript
  revenue: number;
  contactCount: number;
  isSingleThreaded: boolean;
  contract: {
    id: string;
    title: string;
    status: string;
    isRecurring: boolean;
    renewalDate: string | null;
    value: number;
  } | null;
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

Run: `npx eslint src/components/modules/crm-sales.tsx src/components/modules/crm/ 2>&1 | tail -3`
Expected: no increase over the pre-existing count.

- [ ] **Step 6: Verify in the browser**

Signed in as founder, on the Accounts tab: every account should show a contact count, and accounts with fewer than two contacts should show the amber `Single contact` badge. Add a contact to one account and confirm the badge clears after the refresh. Add an `ACTIVE` retainer to one account and confirm the Contract column updates.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/crm/contact-dialog.tsx src/components/modules/crm/contract-dialog.tsx src/components/modules/crm-sales.tsx
git commit -m "feat(crm): turn accounts into an asset register with contracts and contact depth"
```

---

### Task 7: Replace the KPI row with the two metrics

**Files:**
- Modify: `src/components/modules/crm-sales.tsx`

**Interfaces:**
- Consumes: `stats.contractedRevenuePct` and `stats.multiThreadedAccountsPct` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Extend the `Stats` type**

Add to `type Stats` in `crm-sales.tsx`:

```typescript
  contractedRevenuePct: number;
  multiThreadedAccountsPct: number;
```

- [ ] **Step 2: Replace the six `StatCard`s**

Delete the entire `<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">` block containing Pipeline Value, Weighted Pipeline, Open Opportunities, Conversion Rate, Open Follow-ups and Strategic Accounts. Replace with:

```tsx
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Contracted revenue"
          value={`${stats.contractedRevenuePct.toFixed(0)}%`}
          sub="Revenue under an active recurring agreement"
          icon={<FileText className="h-4 w-4" />}
          accent={stats.contractedRevenuePct > 0 ? "primary" : "warning"}
        />
        <StatCard
          label="Accounts with 2+ contacts"
          value={`${stats.multiThreadedAccountsPct.toFixed(0)}%`}
          sub="Accounts that survive a contact changing job"
          icon={<Users className="h-4 w-4" />}
        />
      </div>
```

`FileText` and `Users` are already imported in this file. Remove any icon import that becomes unused, or the lint count will rise.

- [ ] **Step 3: Remove now-dead stat fields from the type**

Delete `totalPipeline`, `weightedPipeline`, `conversionRate`, `proposalsSent`, `proposalsAccepted` and `strategicAccounts` from `type Stats` **only if** no other code in the file reads them. Search first:

Run: `grep -n "weightedPipeline\|totalPipeline\|conversionRate\|strategicAccounts" src/components/modules/crm-sales.tsx`

Leave the API returning them — other modules may consume `/api/doz/crm`. Verify before deleting anything server-side:

Run: `grep -rn "weightedPipeline" src/ | grep -v crm-sales`

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -v "^examples/"`
Expected: no output.

Run: `npx eslint src/components/modules/crm-sales.tsx 2>&1 | tail -3`
Expected: no increase over the pre-existing count.

- [ ] **Step 5: Verify the displayed numbers match the database**

Re-run the verification command from Task 3 Step 8 and compare its two percentages with what the page shows. They must match exactly.

- [ ] **Step 6: Run the full check**

```bash
npm test && npx tsc --noEmit 2>&1 | grep -v "^examples/"
```
Expected: `# pass 8`, `# fail 0`, then no typecheck output.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/crm-sales.tsx
git commit -m "feat(crm): replace pipeline KPIs with contracted revenue"
```

---

## Done when

- The founder can log an enquiry in one line and it persists.
- Accounts show contact depth, flag single-threading, and carry an account-level retainer with a renewal date.
- The page leads with contracted revenue % and accounts-with-2+-contacts %, and both match the database.
- `npm test` passes; `npx tsc --noEmit` is clean; lint has not regressed.
- The `[AUTH-DEBUG]` block is gone from `src/lib/auth.ts`.

## Deliberately not in this plan

Case studies and the published/unpublished gap (Phase 2), event capture and DIDI drafting (Phase 3), removing the `ReferralSource` nurture UI, and the Deals/Proposals write paths. `create_opportunity` and `create_proposal` already exist in the API and can be wired at any time; they are not required for the metric to be true.
