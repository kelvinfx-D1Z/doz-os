# Client Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the founder create professional quotations, invoices and receipts in DOZ OS and export them as PDF or print them, with Nigerian VAT and WHT handled correctly.

**Architecture:** All money and tax arithmetic lives in one pure, fully-tested module (`src/lib/document-math.ts`) with no database access, following the existing `received-allocation.ts` precedent. API routes and UI consume it. Documents render as real A4 HTML pages on their own Next.js routes outside the single-page shell; the browser's print-to-PDF produces the file, so no PDF library is added.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma 6 → Postgres (Supabase), `node:test` with native TS type-stripping.

**Spec:** `docs/superpowers/specs/2026-08-25-client-documents-design.md`

**Scope:** Spec Phases 1 and 3. Phase 2 (price-list pre-fill, markup panel) is deferred to a separate plan. The gross-up calculation moves from the markup panel into the document builder, because that is where client prices are actually set; the markup panel will reuse the same pure functions when it is built.

## Global Constraints

- **No new runtime dependencies.** No PDF library. Print output comes from the browser.
- **Every schema change is additive** — a new model, or a new column that is nullable or has a default. No existing column changes type or nullability. No existing route changes behaviour.
- **Test files must be erasable-TypeScript only** — no `enum`, no parameter properties, no `namespace`. Node's type-stripping cannot handle them. Import with an explicit `.ts` extension.
- **`npx prisma generate` after every schema change**, before typecheck. A stale Prisma client has broken this codebase twice.
- **Money is Naira.** Format with `formatNGN` from `src/lib/utils` where it already exists. Never use `toFixed` on a value that may be `undefined` — money fields are stripped for non-founders.
- **VAT rate 7.5, WHT rate 5.** Both stored per document and editable.
- **WHT never appears on a rendered document.** It exists in the data for reconciliation only.
- **Access:** documents are FOUNDER-only by default, grantable via the existing `User.permissions` module array. Check module permission, never a hard-coded role alone.
- Verification before any completion claim: `npx tsc --noEmit`, `npm run lint` (baseline is 40 pre-existing errors — do not add any), `npm test`, and `npm run build` with `examples/` moved aside.

---

### Task 1: Pure money and tax module

The heart of the feature. Everything else depends on these functions being right. No database access, no imports from Prisma.

**Files:**
- Create: `src/lib/document-math.ts`
- Test: `src/lib/document-math.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `VAT_RATE: number`, `WHT_RATE: number`
  - `type DocumentLineInput = { section: string | null; description: string; subDescription?: string | null; days: number; quantity: number; unitPrice: number }`
  - `lineAmount(l: Pick<DocumentLineInput, "days" | "quantity" | "unitPrice">): number`
  - `sumLines(lines: DocumentLineInput[]): number`
  - `type Section = { section: string; lines: DocumentLineInput[]; total: number }`
  - `groupBySection(lines: DocumentLineInput[]): Section[]`
  - `type TaxInput = { subtotal: number; discount?: number; vatRate?: number; whtRate?: number; vatWithheldAtSource?: boolean }`
  - `type TaxResult = { net: number; vat: number; total: number; wht: number; expectedCash: number }`
  - `computeTax(input: TaxInput): TaxResult`
  - `grossUpFactor(whtRate: number): number`
  - `grossUpSubtotal(targetNet: number, whtRate: number): number`
  - `roundToNearest(value: number, step: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/document-math.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineAmount,
  sumLines,
  groupBySection,
  computeTax,
  grossUpFactor,
  grossUpSubtotal,
  roundToNearest,
  VAT_RATE,
  WHT_RATE,
  type DocumentLineInput,
} from "./document-math.ts";

function line(over: Partial<DocumentLineInput> = {}): DocumentLineInput {
  return {
    section: "Audiovisual",
    description: "LED wall",
    days: 1,
    quantity: 1,
    unitPrice: 100_000,
    ...over,
  };
}

// ---- lineAmount ---------------------------------------------------------

test("lineAmount multiplies quantity, days and unit price", () => {
  assert.equal(lineAmount({ quantity: 12, days: 4, unitPrice: 85_000 }), 4_080_000);
});

test("lineAmount treats a one-day line as quantity times price", () => {
  assert.equal(lineAmount({ quantity: 3, days: 1, unitPrice: 250_000 }), 750_000);
});

test("lineAmount returns zero for a complimentary line", () => {
  assert.equal(lineAmount({ quantity: 2, days: 3, unitPrice: 0 }), 0);
});

test("lineAmount coerces missing or invalid factors to safe values", () => {
  assert.equal(lineAmount({ quantity: 0, days: 4, unitPrice: 85_000 }), 0);
  assert.equal(lineAmount({ quantity: 2, days: 0, unitPrice: 85_000 }), 0);
});

// ---- sumLines and groupBySection ---------------------------------------

test("sumLines totals every line", () => {
  const lines = [
    line({ unitPrice: 8_400_000 }),
    line({ unitPrice: 4_750_000 }),
    line({ unitPrice: 3_120_000 }),
    line({ unitPrice: 1_850_000 }),
  ];
  assert.equal(sumLines(lines), 18_120_000);
});

test("sumLines of nothing is zero", () => {
  assert.equal(sumLines([]), 0);
});

test("groupBySection keeps first-seen section order and totals each", () => {
  const lines = [
    line({ section: "Scenic", unitPrice: 8_400_000 }),
    line({ section: "Audiovisual", unitPrice: 4_750_000 }),
    line({ section: "Scenic", unitPrice: 1_600_000 }),
  ];
  const groups = groupBySection(lines);
  assert.deepEqual(groups.map((g) => g.section), ["Scenic", "Audiovisual"]);
  assert.equal(groups[0].total, 10_000_000);
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[1].total, 4_750_000);
});

test("groupBySection files unsectioned lines under Other", () => {
  const groups = groupBySection([line({ section: null, unitPrice: 500_000 })]);
  assert.equal(groups[0].section, "Other");
});

test("summary and itemised views always agree on the total", () => {
  const lines = [
    line({ section: "Scenic", quantity: 1, days: 1, unitPrice: 8_400_000 }),
    line({ section: "Audiovisual", quantity: 12, days: 4, unitPrice: 85_000 }),
    line({ section: "Audiovisual", quantity: 1, days: 4, unitPrice: 300_000 }),
  ];
  const itemised = sumLines(lines);
  const summary = groupBySection(lines).reduce((s, g) => s + g.total, 0);
  assert.equal(summary, itemised);
});

// ---- computeTax: commercial client -------------------------------------

test("commercial invoice: VAT is added and all of it is expected in cash", () => {
  const r = computeTax({ subtotal: 18_120_000 });
  assert.equal(r.net, 18_120_000);
  assert.equal(r.vat, 1_359_000);
  assert.equal(r.total, 19_479_000);
  assert.equal(r.wht, 0);
  assert.equal(r.expectedCash, 19_479_000);
});

test("discount is applied before VAT", () => {
  const r = computeTax({ subtotal: 10_000_000, discount: 1_000_000 });
  assert.equal(r.net, 9_000_000);
  assert.equal(r.vat, 675_000);
  assert.equal(r.total, 9_675_000);
});

// ---- computeTax: government client -------------------------------------

test("government invoice: VAT is withheld at source so cash is net minus WHT", () => {
  const r = computeTax({
    subtotal: 18_120_000,
    whtRate: WHT_RATE,
    vatWithheldAtSource: true,
  });
  assert.equal(r.vat, 1_359_000);
  assert.equal(r.total, 19_479_000);
  assert.equal(r.wht, 906_000);
  assert.equal(r.expectedCash, 17_214_000);
});

test("government expectedCash excludes VAT entirely, not just WHT", () => {
  const r = computeTax({
    subtotal: 18_120_000,
    whtRate: WHT_RATE,
    vatWithheldAtSource: true,
  });
  assert.notEqual(r.expectedCash, r.total - r.wht);
  assert.equal(r.total - r.expectedCash, r.vat + r.wht);
});

test("WHT without VAT withholding deducts only WHT from the total", () => {
  const r = computeTax({ subtotal: 1_000_000, whtRate: 5 });
  assert.equal(r.total, 1_075_000);
  assert.equal(r.wht, 50_000);
  assert.equal(r.expectedCash, 1_025_000);
});

test("WHT is computed on the pre-VAT net, never on the total", () => {
  const r = computeTax({ subtotal: 1_000_000, whtRate: 5, vatWithheldAtSource: true });
  assert.equal(r.wht, 50_000);
});

test("a zero-value document produces zeros, not NaN", () => {
  const r = computeTax({ subtotal: 0, whtRate: 5, vatWithheldAtSource: true });
  assert.equal(r.total, 0);
  assert.equal(r.expectedCash, 0);
});

// ---- gross-up -----------------------------------------------------------

test("grossUpFactor divides by one minus the rate", () => {
  assert.equal(grossUpFactor(5), 1 / 0.95);
});

test("grossUpFactor of zero is one", () => {
  assert.equal(grossUpFactor(0), 1);
});

test("grossUpSubtotal lands the target net exactly after WHT", () => {
  const target = 18_120_000;
  const subtotal = grossUpSubtotal(target, 5);
  const r = computeTax({ subtotal, whtRate: 5, vatWithheldAtSource: true });
  assert.ok(Math.abs(r.expectedCash - target) < 0.01);
});

test("grossing up is NOT the same as adding the rate", () => {
  const target = 18_120_000;
  const correct = grossUpSubtotal(target, 5);
  const naive = target * 1.05;
  assert.ok(correct > naive);
  const shortfall = computeTax({
    subtotal: naive,
    whtRate: 5,
    vatWithheldAtSource: true,
  }).expectedCash;
  assert.ok(target - shortfall > 40_000);
});

test("grossUpFactor rejects a rate that cannot be recovered", () => {
  assert.throws(() => grossUpFactor(100), /between 0 and 100/);
  assert.throws(() => grossUpFactor(-1), /between 0 and 100/);
});

// ---- rounding -----------------------------------------------------------

test("roundToNearest rounds to the given step", () => {
  assert.equal(roundToNearest(19_073_684.21, 100), 19_073_700);
  assert.equal(roundToNearest(1_234, 100), 1_200);
});

test("roundToNearest with step 0 or 1 returns the value unrounded", () => {
  assert.equal(roundToNearest(1_234.56, 0), 1_234.56);
});

test("VAT_RATE and WHT_RATE are the Nigerian statutory rates", () => {
  assert.equal(VAT_RATE, 7.5);
  assert.equal(WHT_RATE, 5);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './document-math.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/document-math.ts`:

```ts
// ============================================================
// CLIENT DOCUMENT MONEY & TAX (pure, no DB)
//
// Nigerian government clients (MDAs) withhold BOTH taxes at source: 7.5% VAT
// and 5% WHT. Neither reaches D1Z.
//
// Two rules drive everything here, and both were wrong before:
//
//  1. expectedCash for a government client is `net - wht`, NOT
//     `total - wht`. The VAT never arrives, so subtracting only the WHT
//     overstates the expected cash by the entire VAT amount and makes every
//     government invoice read as permanently underpaid.
//
//  2. Recovering a 5% deduction needs a 5.26% uplift, because you divide by
//     0.95 rather than multiplying by 1.05. A flat 5% leaves a 0.25%
//     shortfall on every government invoice, forever.
//
// WHT is computed and stored but NEVER rendered on a document: it is the
// payer's deduction, not D1Z's charge. The 5% is absorbed into the prices
// via grossUpSubtotal instead.
// ============================================================

/** Nigerian statutory VAT rate, percent. */
export const VAT_RATE = 7.5;

/** Withholding tax on services for this work, percent. */
export const WHT_RATE = 5;

export type DocumentLineInput = {
  section: string | null;
  description: string;
  subDescription?: string | null;
  days: number;
  quantity: number;
  unitPrice: number;
};

function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * quantity x days x unitPrice. There is exactly one multiplier for days in
 * this codebase and it is here — `ServiceItem.unit` is a label and must never
 * be read as a second one.
 */
export function lineAmount(
  l: Pick<DocumentLineInput, "days" | "quantity" | "unitPrice">,
): number {
  return safe(l.quantity) * safe(l.days) * safe(l.unitPrice);
}

export function sumLines(lines: DocumentLineInput[]): number {
  return lines.reduce((s, l) => s + lineAmount(l), 0);
}

export type Section = {
  section: string;
  lines: DocumentLineInput[];
  total: number;
};

/**
 * Groups lines by section, preserving first-seen order.
 *
 * The Summary and Itemised views of a document both derive from this same
 * line array, so their totals agree by construction. There is never a second
 * set of numbers to drift.
 */
export function groupBySection(lines: DocumentLineInput[]): Section[] {
  const order: string[] = [];
  const byName = new Map<string, DocumentLineInput[]>();
  for (const l of lines) {
    const name = l.section?.trim() || "Other";
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(l);
  }
  return order.map((section) => {
    const group = byName.get(section)!;
    return { section, lines: group, total: sumLines(group) };
  });
}

export type TaxInput = {
  subtotal: number;
  discount?: number;
  vatRate?: number;
  whtRate?: number;
  /** True for government clients, who withhold the VAT as well as the WHT. */
  vatWithheldAtSource?: boolean;
};

export type TaxResult = {
  /** Subtotal after discount — the base for both VAT and WHT. */
  net: number;
  vat: number;
  /** What the document shows as the total. */
  total: number;
  /** Never rendered. Stored for reconciliation only. */
  wht: number;
  /** What will actually land in the bank. */
  expectedCash: number;
};

export function computeTax(input: TaxInput): TaxResult {
  const net = Math.max(0, safe(input.subtotal) - safe(input.discount));
  const vat = net * (safe(input.vatRate ?? VAT_RATE) / 100);
  const wht = net * (safe(input.whtRate) / 100);
  const total = net + vat;
  const expectedCash = input.vatWithheldAtSource
    ? net - wht
    : total - wht;
  return { net, vat, total, wht, expectedCash };
}

/**
 * The multiplier that recovers a deduction of `whtRate` percent.
 *
 * This is 1 / (1 - rate), NOT 1 + rate. For 5% that is 1.0526, not 1.05.
 */
export function grossUpFactor(whtRate: number): number {
  const rate = safe(whtRate);
  if (rate < 0 || rate >= 100) {
    throw new Error(`Gross-up rate must be between 0 and 100, got ${whtRate}`);
  }
  return 1 / (1 - rate / 100);
}

/** The subtotal to invoice so that `targetNet` survives the deduction. */
export function grossUpSubtotal(targetNet: number, whtRate: number): number {
  return safe(targetNet) * grossUpFactor(whtRate);
}

/** Rounds to the nearest `step` naira. A step of 0 or 1 leaves the value alone. */
export function roundToNearest(value: number, step: number): number {
  const v = safe(value);
  const s = safe(step);
  if (s <= 1) return v;
  return Math.round(v / s) * s;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all new tests plus the 19 existing ones.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/document-math.ts src/lib/document-math.test.ts
git commit -m "feat(documents): pure money and tax module for client documents"
```

---

### Task 2: Schema additions

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing
- Produces: Prisma models `CompanySettings`, `Quotation`, `QuotationLine`, `Receipt`, `DocumentSequence`; new columns on `Invoice`, `InvoiceLine`, `Account`.

- [ ] **Step 1: Add the new models**

Append to `prisma/schema.prisma`:

```prisma
model CompanySettings {
  id            String  @id @default("singleton")
  legalName     String  @default("D1Z Technologies Ltd")
  tradingName   String? @default("D1Z tech")
  address       String  @default("114 Ebitu Ekiwe Street, Jabi, FCT Abuja")
  phone         String  @default("+234 906 236 7649")
  email         String  @default("info@d1zmedia.com")
  website       String? @default("www.d1zmedia.com")
  rcNumber      String?
  tin           String?
  vatRegistered Boolean @default(true)
  bankName      String?
  bankAccount   String?
  bankAccountName String?
  logoUrl       String?
  defaultPaymentTerms String? @default("Payment due within 30 days of invoice date.")
  updatedAt     DateTime @updatedAt @default(now())
}

model Quotation {
  id          String   @id @default(cuid())
  code        String   @unique
  projectId   String?
  project     Project? @relation(fields: [projectId], references: [id])
  accountId   String?
  account     Account? @relation(fields: [accountId], references: [id])
  title       String?
  eventStart  DateTime?
  eventEnd    DateTime?
  detailLevel String   @default("SUMMARY")
  subtotal    Float    @default(0)
  discount    Float    @default(0)
  vatRate     Float    @default(7.5)
  tax         Float    @default(0)
  total       Float    @default(0)
  whtRate     Float    @default(0)
  vatWithheldAtSource Boolean @default(false)
  grossUpRate Float    @default(0)
  targetNet   Float?
  paymentTerms String?
  notes       String?
  status      String   @default("DRAFT")
  validUntil  DateTime?
  convertedInvoiceId String?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  lines       QuotationLine[]

  @@index([projectId])
  @@index([accountId])
  @@index([status])
}

model QuotationLine {
  id          String   @id @default(cuid())
  quotationId String
  quotation   Quotation @relation(fields: [quotationId], references: [id])
  section     String?
  description String
  subDescription String?
  days        Int      @default(1)
  quantity    Int      @default(1)
  unitPrice   Float    @default(0)
  amount      Float    @default(0)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  @@index([quotationId])
}

model Receipt {
  id          String   @id @default(cuid())
  code        String   @unique
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id])
  amount      Float
  method      String?
  reference   String?
  receivedAt  DateTime @default(now())
  balanceAfter Float   @default(0)
  createdById String?
  createdAt   DateTime @default(now())

  @@index([invoiceId])
}

model DocumentSequence {
  id     String @id @default(cuid())
  type   String
  year   Int
  next   Int    @default(1)

  @@unique([type, year])
}
```

- [ ] **Step 2: Add the new columns to existing models**

In `model Invoice`, add these lines before the closing brace:

```prisma
  detailLevel String   @default("SUMMARY")
  title       String?
  eventStart  DateTime?
  eventEnd    DateTime?
  paymentTerms String?
  quotationId String?
  vatWithheldAtSource Boolean @default(false)
  grossUpRate Float    @default(0)
  targetNet   Float?
  receipts    Receipt[]
```

In `model InvoiceLine`, add:

```prisma
  subDescription String?
```

In `model Account`, add:

```prisma
  billingAddress String?
  quotations     Quotation[]
```

In `model Project`, add:

```prisma
  quotations   Quotation[]
```

- [ ] **Step 3: Correct the misleading expectedCash comment**

In `model Invoice`, the existing comment block above `whtRate` claims the cash arriving is `amount - whtAmount`. Replace that sentence:

Find: `// behalf and reclaimed as a credit. So the cash that actually arrives is`
and the following line `// \`amount - whtAmount\`, and that is what payment must be reconciled against.`

Replace both lines with:

```prisma
  // behalf and reclaimed as a credit. The cash that arrives depends on whether
  // the client also withholds VAT: government MDAs withhold both, so cash is
  // `net - wht`; a commercial client pays the VAT across, so cash is
  // `total - wht`. See vatWithheldAtSource and src/lib/document-math.ts.
```

- [ ] **Step 4: Push the schema and regenerate**

```bash
npx prisma db push
npx prisma generate
npx tsc --noEmit
```

Expected: push succeeds with no data loss warning (every change is additive), generate succeeds, typecheck clean.

- [ ] **Step 5: Verify the new tables exist against the live database**

Create `verify-schema.mjs` in the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const s = await tx.companySettings.upsert({
      where: { id: "singleton" }, update: {}, create: { id: "singleton" },
    });
    console.log(`CompanySettings defaults: ${s.legalName} / ${s.phone}`);
    const seq = await tx.documentSequence.create({ data: { type: "QUO", year: 2026 } });
    console.log(`DocumentSequence starts at ${seq.next}`);
    const q = await tx.quotation.create({
      data: { code: "__VERIFY__QUO", lines: { create: [{ description: "Test line", amount: 100 }] } },
      include: { lines: true },
    });
    console.log(`Quotation ${q.code} with ${q.lines.length} line, detailLevel=${q.detailLevel}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-schema.mjs && rm -f ./verify-schema.mjs`
Expected: all three lines print, then "rolled back — DB unchanged."

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(documents): add quotation, receipt and company settings models"
```

---

### Task 3: Document numbering

Invoice numbers must not duplicate or skip — that is an audit problem. `count() + 1` (used elsewhere in this codebase for project codes) races under concurrent creation. This uses a dedicated sequence row incremented in the same transaction as the document.

**Files:**
- Create: `src/lib/document-code.ts`
- Test: `src/lib/document-code.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type DocumentType = "QUO" | "INV" | "REC"`
  - `formatDocumentCode(type: DocumentType, year: number, seq: number): string`
  - `nextDocumentCode(tx: PrismaTx, type: DocumentType, now?: Date): Promise<string>` where `PrismaTx` is the transaction client type

- [ ] **Step 1: Write the failing test for the pure formatter**

Create `src/lib/document-code.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDocumentCode } from "./document-code.ts";

test("formats a code with a three-digit zero-padded sequence", () => {
  assert.equal(formatDocumentCode("INV", 2026, 14), "INV-2026-014");
});

test("pads single digits", () => {
  assert.equal(formatDocumentCode("QUO", 2026, 1), "QUO-2026-001");
});

test("does not truncate a sequence past three digits", () => {
  assert.equal(formatDocumentCode("REC", 2026, 1234), "REC-2026-1234");
});

test("each type has its own series", () => {
  assert.equal(formatDocumentCode("QUO", 2026, 7), "QUO-2026-007");
  assert.equal(formatDocumentCode("INV", 2026, 7), "INV-2026-007");
  assert.equal(formatDocumentCode("REC", 2026, 7), "REC-2026-007");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './document-code.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/document-code.ts`:

```ts
import type { Prisma } from "@prisma/client";

export type DocumentType = "QUO" | "INV" | "REC";

/** PREFIX-YYYY-NNN, e.g. INV-2026-014. */
export function formatDocumentCode(
  type: DocumentType,
  year: number,
  seq: number,
): string {
  return `${type}-${year}-${String(seq).padStart(3, "0")}`;
}

type Tx = Prisma.TransactionClient;

/**
 * Reserves the next number in the series for `type` and the current year.
 *
 * MUST be called inside the same transaction that creates the document, so a
 * rolled-back document does not burn a number and two documents created in
 * the same second cannot collide. `count() + 1` is not safe here: a duplicated
 * or skipped invoice number is an audit problem.
 */
export async function nextDocumentCode(
  tx: Tx,
  type: DocumentType,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const row = await tx.documentSequence.upsert({
    where: { type_year: { type, year } },
    update: { next: { increment: 1 } },
    create: { type, year, next: 2 },
    select: { next: true },
  });
  // upsert returns the value AFTER incrementing, so the number just reserved
  // is one behind. On create we set next=2 and reserve 1.
  return formatDocumentCode(type, year, row.next - 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Verify sequence behaviour against the live database**

Create `verify-seq.mjs` in the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const codes = [];
    for (let i = 0; i < 3; i++) {
      const row = await tx.documentSequence.upsert({
        where: { type_year: { type: "TEST", year } },
        update: { next: { increment: 1 } },
        create: { type: "TEST", year, next: 2 },
        select: { next: true },
      });
      codes.push(`TEST-${year}-${String(row.next - 1).padStart(3, "0")}`);
    }
    console.log(`sequential, no gaps: ${codes.join(", ")}`);
    console.log(`unique: ${new Set(codes).size === 3}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-seq.mjs && rm -f ./verify-seq.mjs`
Expected: `TEST-2026-001, TEST-2026-002, TEST-2026-003` and `unique: true`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/document-code.ts src/lib/document-code.test.ts
git commit -m "feat(documents): transaction-safe document numbering"
```

---

### Task 4: Access control helper and module registration

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/store.ts:4-21`
- Modify: `src/app/api/doz/team/manage/route.ts:17`
- Modify: `src/app/api/doz/staff-hub/route.ts:8`

**Interfaces:**
- Consumes: nothing
- Produces: `canIssueDocuments(user: { role: string; permissions?: string[] | null }): boolean`

Note: `SessionUser.permissions` is **already a parsed `string[] | null`**, not the
raw JSON string stored in the column. Do not call `parsePermissions` on it.

- [ ] **Step 1: Add `documents` to the ModuleId union**

In `src/lib/store.ts`, add `| "documents"` to the `ModuleId` union after `| "vendors"`.

- [ ] **Step 2: Add `documents` to both VALID_MODULES whitelists**

Add `"documents"` to the `VALID_MODULES` array in `src/app/api/doz/team/manage/route.ts` and in `src/app/api/doz/staff-hub/route.ts`.

Omitting this silently strips the permission when saving a user — this exact bug has bitten this codebase before with `profile` and `messages`.

- [ ] **Step 3: Add the access helper**

Append to `src/lib/auth.ts`:

```ts
/**
 * Who may create, view and download client documents.
 *
 * FOUNDER always. Anyone else only if the founder has explicitly granted them
 * the `documents` module through the per-user permissions override — granting
 * it exposes client pricing to that person, which is the founder's call.
 */
export function canIssueDocuments(user: {
  role: string;
  permissions?: string[] | null;
}): boolean {
  if (user.role === "FOUNDER") return true;
  return Array.isArray(user.permissions) && user.permissions.includes("documents");
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/store.ts src/app/api/doz/team/manage/route.ts src/app/api/doz/staff-hub/route.ts
git commit -m "feat(documents): documents module and grantable access helper"
```

---

### Task 5: Company settings API and UI

**Files:**
- Create: `src/app/api/doz/company/route.ts`
- Create: `src/components/doz/company-settings-dialog.tsx`
- Modify: `src/components/doz/app-shell.tsx`

**Interfaces:**
- Consumes: `canIssueDocuments` (Task 4), `getSessionUser` from `src/lib/auth.ts`
- Produces: `GET /api/doz/company` → `{ company: CompanySettings }`; `PUT /api/doz/company` → `{ ok: true, company }`. Component `<CompanySettingsDialog open onOpenChange />`.

- [ ] **Step 1: Write the API route**

Create `src/app/api/doz/company/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";

const SINGLETON = "singleton";

/** The one company record every document reads from. Created on first access. */
async function loadCompany() {
  return db.companySettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ company: await loadCompany() });
}

const EDITABLE = [
  "legalName", "tradingName", "address", "phone", "email", "website",
  "rcNumber", "tin", "bankName", "bankAccount", "bankAccountName",
  "logoUrl", "defaultPaymentTerms",
] as const;

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") {
    return NextResponse.json(
      { error: "Only the founder can change company details" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, string | boolean | null> = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) {
      const v = body[key];
      data[key] = typeof v === "string" ? v.trim() || null : null;
    }
  }
  if (typeof body.vatRegistered === "boolean") {
    data.vatRegistered = body.vatRegistered;
  }
  if (!data.legalName) delete data.legalName;

  await loadCompany();
  const company = await db.companySettings.update({
    where: { id: SINGLETON },
    data,
  });
  return NextResponse.json({ ok: true, company });
}
```

- [ ] **Step 2: Verify the route compiles and the singleton behaves**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build the settings dialog**

Create `src/components/doz/company-settings-dialog.tsx`. Follow the structure of the existing `src/components/doz/recovery-codes-dialog.tsx` for dialog shell, loading state and toast handling. The form has one `Input` per editable field grouped under three headings — Identity (legal name, trading name, address, phone, email, website), Statutory (RC number, TIN, VAT registered as a `Checkbox`), and Payment (bank name, account number, account name, default payment terms as a `Textarea`).

On open, `GET /api/doz/company` and populate. On save, `PUT` the whole form, `toast.success("Company details saved")`, and close. On error, `toast.error` with the server message and `duration: 8000`.

Include this hint under the statutory group, because these appear on every document:

```tsx
<p className="text-[11px] text-muted-foreground">
  These appear on every quotation, invoice and receipt. Leaving RC or TIN
  blank simply omits that line from the document.
</p>
```

- [ ] **Step 4: Add the entry point**

In `src/components/doz/app-shell.tsx`, add a "Company details" item to the same menu that already renders `RecoveryCodesDialog`, gated on `user?.role === "FOUNDER"`, opening the new dialog. Mirror how `recoveryOpen` is declared and passed.

- [ ] **Step 5: Verify in the browser**

Start the dev server via `preview_start`, open the founder menu, save a change, reload and confirm it persisted. Check `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/doz/company/ src/components/doz/company-settings-dialog.tsx src/components/doz/app-shell.tsx
git commit -m "feat(documents): editable company details for document headers"
```

---

### Task 6: Documents API — quotations

**Files:**
- Create: `src/app/api/doz/documents/quotations/route.ts`

**Interfaces:**
- Consumes: `computeTax`, `lineAmount`, `sumLines`, `grossUpSubtotal`, `roundToNearest` (Task 1); `nextDocumentCode` (Task 3); `canIssueDocuments` (Task 4)
- Produces: `GET` → `{ quotations: [...] }`; `POST` body `{ accountId?, projectId?, title?, eventStart?, eventEnd?, detailLevel?, discount?, vatRate?, whtRate?, vatWithheldAtSource?, targetNet?, paymentTerms?, notes?, validUntil?, lines: [{ section, description, subDescription, days, quantity, unitPrice }] }` → `{ quotation }`; `PATCH` body `{ quotationId, action?, ...fields }`; `DELETE` body `{ quotationId }`

- [ ] **Step 1: Write the route**

Create `src/app/api/doz/documents/quotations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import {
  computeTax,
  lineAmount,
  sumLines,
  grossUpSubtotal,
  roundToNearest,
  VAT_RATE,
  type DocumentLineInput,
} from "@/lib/document-math";

type IncomingLine = {
  section?: string | null;
  description?: string;
  subDescription?: string | null;
  days?: number;
  quantity?: number;
  unitPrice?: number;
};

function normaliseLines(raw: unknown): DocumentLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 300)
    .map((l: IncomingLine) => ({
      section: typeof l.section === "string" ? l.section.trim() || null : null,
      description: String(l.description ?? "").trim(),
      subDescription:
        typeof l.subDescription === "string" ? l.subDescription.trim() || null : null,
      days: Math.max(1, Math.trunc(Number(l.days) || 1)),
      quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)),
      unitPrice: Math.max(0, Number(l.unitPrice) || 0),
    }))
    .filter((l) => l.description.length > 0);
}

/**
 * Applies the gross-up when the founder has named a target net.
 *
 * Scales every unit price by the same factor so the proportions the founder
 * set are preserved, then rounds each to the nearest 100 naira. The caller
 * shows the resulting expected cash next to the target rather than hiding
 * the small rounding difference.
 */
function applyGrossUp(
  lines: DocumentLineInput[],
  targetNet: number,
  whtRate: number,
): { lines: DocumentLineInput[]; grossUpRate: number } {
  const base = sumLines(lines);
  if (base <= 0 || targetNet <= 0) return { lines, grossUpRate: 0 };
  const wanted = grossUpSubtotal(targetNet, whtRate);
  const factor = wanted / base;
  return {
    lines: lines.map((l) => ({
      ...l,
      unitPrice: roundToNearest(l.unitPrice * factor, 100),
    })),
    grossUpRate: whtRate,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const quotations = await db.quotation.findMany({
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      account: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ quotations });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let lines = normaliseLines(body.lines);
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Add at least one line with a description" },
      { status: 400 },
    );
  }

  const whtRate = Math.max(0, Number(body.whtRate) || 0);
  const targetNet = Number(body.targetNet) || 0;
  let grossUpRate = 0;
  if (targetNet > 0 && whtRate > 0) {
    const applied = applyGrossUp(lines, targetNet, whtRate);
    lines = applied.lines;
    grossUpRate = applied.grossUpRate;
  }

  const subtotal = sumLines(lines);
  const discount = Math.max(0, Number(body.discount) || 0);
  const vatRate = body.vatRate === undefined ? VAT_RATE : Number(body.vatRate) || 0;
  const vatWithheldAtSource = body.vatWithheldAtSource === true;
  const tax = computeTax({ subtotal, discount, vatRate, whtRate, vatWithheldAtSource });

  const created = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "QUO");
    return tx.quotation.create({
      data: {
        code,
        projectId: body.projectId || null,
        accountId: body.accountId || null,
        title: body.title ? String(body.title).trim() : null,
        eventStart: body.eventStart ? new Date(body.eventStart) : null,
        eventEnd: body.eventEnd ? new Date(body.eventEnd) : null,
        detailLevel: body.detailLevel === "ITEMISED" ? "ITEMISED" : "SUMMARY",
        subtotal,
        discount,
        vatRate,
        tax: tax.vat,
        total: tax.total,
        whtRate,
        vatWithheldAtSource,
        grossUpRate,
        targetNet: targetNet > 0 ? targetNet : null,
        paymentTerms: body.paymentTerms ? String(body.paymentTerms).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        createdById: user.id,
        lines: {
          create: lines.map((l, i) => ({
            section: l.section,
            description: l.description,
            subDescription: l.subDescription ?? null,
            days: l.days,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: lineAmount(l),
            sortOrder: i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return NextResponse.json({ quotation: created, expectedCash: tax.expectedCash }, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }
  const existing = await db.quotation.findUnique({ where: { id: body.quotationId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const VALID_STATUS = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];
  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. One of: ${VALID_STATUS.join(", ")}` },
        { status: 400 },
      );
    }
    data.status = body.status;
  }
  if (body.detailLevel === "SUMMARY" || body.detailLevel === "ITEMISED") {
    data.detailLevel = body.detailLevel;
  }
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.paymentTerms === "string") {
    data.paymentTerms = body.paymentTerms.trim() || null;
  }

  const updated = await db.quotation.update({ where: { id: body.quotationId }, data });
  return NextResponse.json({ ok: true, quotation: updated });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }
  const existing = await db.quotation.findUnique({ where: { id: body.quotationId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.convertedInvoiceId) {
    return NextResponse.json(
      { error: "This quotation was converted to an invoice and cannot be deleted." },
      { status: 409 },
    );
  }
  await db.$transaction([
    db.quotationLine.deleteMany({ where: { quotationId: body.quotationId } }),
    db.quotation.delete({ where: { id: body.quotationId } }),
  ]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify create-and-total against the live database**

Create `verify-quote.mjs` in the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: {
        code: "__VERIFY__Q", subtotal: 18120000, vatRate: 7.5, tax: 1359000,
        total: 19479000, whtRate: 5, vatWithheldAtSource: true,
        lines: { create: [
          { description: "Stage design", section: "Scenic", quantity: 1, days: 1, unitPrice: 8400000, amount: 8400000, sortOrder: 0 },
          { description: "LED wall", section: "Audiovisual", quantity: 12, days: 4, unitPrice: 85000, amount: 4080000, sortOrder: 1 },
        ] },
      },
      include: { lines: true },
    });
    const summed = q.lines.reduce((s, l) => s + l.quantity * l.days * l.unitPrice, 0);
    console.log(`lines sum to ${summed.toLocaleString()}`);
    console.log(`stored amounts match computed: ${q.lines.every((l) => l.amount === l.quantity * l.days * l.unitPrice)}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-quote.mjs && rm -f ./verify-quote.mjs`
Expected: `lines sum to 12,480,000` and `stored amounts match computed: true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/doz/documents/quotations/
git commit -m "feat(documents): quotation API with gross-up and tax"
```

---

### Task 7: Documents API — invoices

The founder has never been able to create an invoice. This adds that.

**Files:**
- Create: `src/app/api/doz/documents/invoices/route.ts`

**Interfaces:**
- Consumes: same as Task 6
- Produces: `GET` → `{ invoices: [...] }`; `POST` (same body shape as quotations, plus `dueDate`) → `{ invoice }`; `PATCH` `{ invoiceId, status?, detailLevel?, paymentTerms? }`

- [ ] **Step 1: Write the route**

Create `src/app/api/doz/documents/invoices/route.ts`. It is structurally identical to Task 6's quotations route with these differences — copy that file and change:

- `nextDocumentCode(tx, "INV")` instead of `"QUO"`
- Model `db.invoice` / `db.invoiceLine`, field `invoiceId`
- Set `amount: tax.total` (Invoice uses `amount` for the total, not `total`)
- Set `subtotal`, `tax: tax.vat`, `whtAmount: tax.wht`, `expectedCash: tax.expectedCash`
- Add `dueDate: body.dueDate ? new Date(body.dueDate) : null`
- `VALID_STATUS = ["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE"]`
- No `validUntil`, no `convertedInvoiceId`; instead accept `quotationId`
- DELETE refuses when `amountPaid > 0`:

```ts
if (existing.amountPaid > 0) {
  return NextResponse.json(
    { error: "This invoice has payments recorded against it and cannot be deleted." },
    { status: 409 },
  );
}
```

The `expectedCash` assignment is the critical line — write it exactly:

```ts
expectedCash: tax.expectedCash,
whtAmount: tax.wht,
```

`collectableAmount` in `src/lib/received-allocation.ts` already prefers `expectedCash` over `amount` when it is greater than zero, so reconciliation picks this up with no change to that module.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify the government cash figure end to end**

Create `verify-invoice.mjs` in the project root:

```js
import { PrismaClient } from "@prisma/client";
import { computeTax } from "./src/lib/document-math.ts";
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const t = computeTax({ subtotal: 18120000, whtRate: 5, vatWithheldAtSource: true });
    const inv = await tx.invoice.create({
      data: {
        code: "__VERIFY__I", subtotal: 18120000, amount: t.total, tax: t.vat,
        whtRate: 5, whtAmount: t.wht, expectedCash: t.expectedCash,
        vatWithheldAtSource: true,
      },
    });
    console.log(`invoice total  ${inv.amount.toLocaleString()}`);
    console.log(`expected cash  ${inv.expectedCash.toLocaleString()}`);
    console.log(`correct (17,214,000): ${inv.expectedCash === 17214000}`);
    console.log(`NOT the old wrong value (18,573,000): ${inv.expectedCash !== 18573000}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env --experimental-strip-types ./verify-invoice.mjs && rm -f ./verify-invoice.mjs`
Expected: expected cash `17,214,000`, both booleans `true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/doz/documents/invoices/
git commit -m "feat(documents): founder-facing invoice creation API"
```

---

### Task 8: Conversion and receipts

**Files:**
- Create: `src/app/api/doz/documents/convert/route.ts`
- Create: `src/app/api/doz/documents/receipts/route.ts`

**Interfaces:**
- Consumes: `nextDocumentCode`, `canIssueDocuments`, `computeTax`
- Produces: `POST /api/doz/documents/convert` body `{ quotationId }` → `{ invoice }`; `GET /api/doz/documents/receipts` → `{ receipts }`; `POST /api/doz/documents/receipts` body `{ invoiceId, amount, method?, reference?, receivedAt? }` → `{ receipt, invoice }`

- [ ] **Step 1: Write the conversion route**

Create `src/app/api/doz/documents/convert/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { computeTax } from "@/lib/document-math";

/** Quotation accepted -> invoice, carrying every line across unchanged. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.quotationId) {
    return NextResponse.json({ error: "quotationId required" }, { status: 400 });
  }

  const quote = await db.quotation.findUnique({
    where: { id: body.quotationId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (quote.convertedInvoiceId) {
    return NextResponse.json(
      { error: "This quotation has already been converted to an invoice." },
      { status: 409 },
    );
  }

  const tax = computeTax({
    subtotal: quote.subtotal,
    discount: quote.discount,
    vatRate: quote.vatRate,
    whtRate: quote.whtRate,
    vatWithheldAtSource: quote.vatWithheldAtSource,
  });

  const invoice = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "INV");
    const created = await tx.invoice.create({
      data: {
        code,
        projectId: quote.projectId,
        accountId: quote.accountId,
        title: quote.title,
        eventStart: quote.eventStart,
        eventEnd: quote.eventEnd,
        detailLevel: quote.detailLevel,
        subtotal: quote.subtotal,
        discount: quote.discount,
        vatRate: quote.vatRate,
        tax: tax.vat,
        amount: tax.total,
        whtRate: quote.whtRate,
        whtAmount: tax.wht,
        expectedCash: tax.expectedCash,
        vatWithheldAtSource: quote.vatWithheldAtSource,
        grossUpRate: quote.grossUpRate,
        targetNet: quote.targetNet,
        paymentTerms: quote.paymentTerms,
        quotationId: quote.id,
        status: "DRAFT",
        lines: {
          create: quote.lines.map((l) => ({
            section: l.section,
            description: l.description,
            subDescription: l.subDescription,
            days: l.days,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            sortOrder: l.sortOrder,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    await tx.quotation.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", convertedInvoiceId: created.id },
    });
    return created;
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
```

- [ ] **Step 2: Write the receipts route**

Create `src/app/api/doz/documents/receipts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, canIssueDocuments } from "@/lib/auth";
import { nextDocumentCode } from "@/lib/document-code";
import { collectableAmount, invoiceStatusFor } from "@/lib/received-allocation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const receipts = await db.receipt.findMany({
    include: {
      invoice: {
        select: { id: true, code: true, amount: true, account: { select: { name: true } } },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ receipts });
}

/**
 * Records one payment and issues its receipt.
 *
 * One receipt per payment, not per invoice — a client paying in three
 * instalments gets three receipts, each showing what it settled and what is
 * still outstanding. The balance is measured against collectableAmount, so a
 * government invoice settles at its expectedCash rather than its face value.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canIssueDocuments(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter the amount received as a positive number" },
      { status: 400 },
    );
  }

  const invoice = await db.invoice.findUnique({ where: { id: body.invoiceId } });
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });

  const collectable = collectableAmount(invoice);
  const paidAfter = invoice.amountPaid + amount;
  const balanceAfter = Math.max(0, collectable - paidAfter);

  const result = await db.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, "REC");
    const receipt = await tx.receipt.create({
      data: {
        code,
        invoiceId: invoice.id,
        amount,
        method: body.method ? String(body.method).trim() : null,
        reference: body.reference ? String(body.reference).trim() : null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        balanceAfter,
        createdById: user.id,
      },
    });
    // Signature is (amount, amountPaid, current, existingPaidDate, now?) and it
    // returns BOTH status and paidDate. Do not recompute paidDate by hand: this
    // helper deliberately preserves an existing paid date rather than
    // re-stamping it with today, which would move a January collection into
    // August and corrupt the monthly cash-flow buckets in /api/doz/finance.
    const { status, paidDate } = invoiceStatusFor(
      collectable,
      paidAfter,
      invoice.status,
      invoice.paidDate,
    );
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid: paidAfter, status, paidDate },
    });
    return { receipt, invoice: updated };
  });

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 3: Confirm the helper signatures match**

Run: `npx tsc --noEmit`
Expected: clean. `invoiceStatusFor` and `collectableAmount` are existing, tested
functions — match their signatures, never edit `src/lib/received-allocation.ts`
to suit this feature. Its 19 tests must keep passing untouched.

- [ ] **Step 4: Verify the full chain against the live database**

Create `verify-chain.mjs` in the project root:

```js
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: { code: "__V__Q", subtotal: 1000000, total: 1075000, tax: 75000,
        lines: { create: [{ description: "Line", quantity: 1, days: 1, unitPrice: 1000000, amount: 1000000 }] } },
      include: { lines: true },
    });
    const inv = await tx.invoice.create({
      data: { code: "__V__I", subtotal: 1000000, amount: 1075000, tax: 75000,
        expectedCash: 1075000, quotationId: q.id,
        lines: { create: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, days: l.days, unitPrice: l.unitPrice, amount: l.amount })) } },
      include: { lines: true },
    });
    await tx.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED", convertedInvoiceId: inv.id } });
    console.log(`quote -> invoice carried ${inv.lines.length} line(s)`);

    const r1 = await tx.receipt.create({ data: { code: "__V__R1", invoiceId: inv.id, amount: 500000, balanceAfter: 575000 } });
    const r2 = await tx.receipt.create({ data: { code: "__V__R2", invoiceId: inv.id, amount: 575000, balanceAfter: 0 } });
    console.log(`two partial payments -> two receipts: ${r1.code}, ${r2.code}`);
    console.log(`balances step down correctly: ${r1.balanceAfter === 575000 && r2.balanceAfter === 0}`);
    throw new Error("__ROLLBACK__");
  });
} catch (e) {
  if (e.message === "__ROLLBACK__") console.log("rolled back — DB unchanged.");
  else { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally { await db.$disconnect(); }
```

Run: `node --env-file=.env ./verify-chain.mjs && rm -f ./verify-chain.mjs`
Expected: line carried, two receipts, balances step down `true`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/doz/documents/convert/ src/app/api/doz/documents/receipts/
git commit -m "feat(documents): quote-to-invoice conversion and per-payment receipts"
```

---

### Task 9: Print shell and shared document styling

The app is a single-page Zustand shell. Documents need real routes outside it so printing produces a clean page with no sidebar.

**Files:**
- Create: `src/app/documents/[type]/[id]/print/page.tsx`
- Create: `src/components/documents/document-shell.tsx`
- Create: `src/components/documents/document.css`

**Interfaces:**
- Consumes: `canIssueDocuments`, `getSessionUser`, `groupBySection`, `computeTax`
- Produces:
  - `type DocumentKind = "quotation" | "invoice" | "receipt"`
  - `<DocumentShell kind company docCode children />` rendering masthead, orange bars, footer
  - CSS classes `.doc-page`, `.doc-masthead`, `.doc-bars-top`, `.doc-bars-bottom`, `.doc-footer`, `.doc-totals`

- [ ] **Step 1: Write the print stylesheet**

Create `src/components/documents/document.css`:

```css
.doc-page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  color: #2b2b2b;
  font-family: "Helvetica Neue", Arial, sans-serif;
  display: flex;
  flex-direction: column;
}

.doc-body { flex: 1; padding: 14mm 16mm; }

.doc-masthead {
  background: #232323;
  color: #fff;
  padding: 10mm 16mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.doc-bars { display: flex; height: 5mm; }
.doc-bars-top .b1 { width: 22%; background: #d2570e; }
.doc-bars-top .b2 { width: 9%; background: #e8681c; }
.doc-bars-top .b3 { width: 7%; background: #f29222; }
.doc-bars-bottom { flex-direction: row-reverse; }

.doc-footer {
  display: flex;
  justify-content: center;
  gap: 10mm;
  padding: 4mm 0;
  font-size: 9pt;
  color: #6e6e6e;
  border-top: 1px solid #eee;
}

.doc-totals { background: #232323; color: #fff; padding: 5mm 6mm; }
.doc-hero { font-size: 20pt; font-weight: 700; letter-spacing: -0.5px; }

@page { size: A4; margin: 0; }

@media print {
  .no-print { display: none !important; }
  .doc-page { width: auto; min-height: auto; margin: 0; }
  body { background: #fff; }
}

@media screen {
  .doc-page { box-shadow: 0 0 0 1px #e5e5e5; margin-top: 24px; margin-bottom: 24px; }
}
```

- [ ] **Step 2: Write the shell component**

Create `src/components/documents/document-shell.tsx`:

```tsx
import "./document.css";

export type DocumentKind = "quotation" | "invoice" | "receipt";

export type CompanyInfo = {
  legalName: string;
  tradingName: string | null;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  rcNumber: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
};

const LABEL: Record<DocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  receipt: "Receipt",
};

/**
 * The shared D1Z page furniture: orange bars, charcoal masthead, footer.
 *
 * Each document type supplies its own body, because a quotation, an invoice
 * and a receipt do different jobs and should not be forced into one layout.
 */
export function DocumentShell({
  kind,
  company,
  docCode,
  children,
}: {
  kind: DocumentKind;
  company: CompanyInfo;
  docCode: string;
  children: React.ReactNode;
}) {
  return (
    <div className="doc-page">
      <div className="doc-bars doc-bars-top">
        <div className="b1" /><div className="b2" /><div className="b3" />
      </div>

      <div className="doc-masthead">
        <div>
          <div style={{ fontSize: "20pt", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1 }}>
            D1Z<span style={{ color: "#e8681c", fontWeight: 400 }}>tech</span>
          </div>
          <div style={{ fontSize: "8pt", color: "#9a9a9a", marginTop: "2mm" }}>
            {company.legalName}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "8pt", letterSpacing: "2px", textTransform: "uppercase", color: "#e8681c" }}>
            {LABEL[kind]}
          </div>
          <div style={{ fontSize: "14pt", marginTop: "1mm" }}>{docCode}</div>
        </div>
      </div>

      <div className="doc-body">{children}</div>

      <div className="doc-footer">
        <span>{company.phone}</span>
        {company.website && <span>{company.website}</span>}
        <span>{company.address}</span>
      </div>

      <div className="doc-bars doc-bars-bottom">
        <div className="b1" /><div className="b2" /><div className="b3" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the print route**

Create `src/app/documents/[type]/[id]/print/page.tsx` as a server component. It must:

1. `const user = await getSessionUser()` — if absent or `!canIssueDocuments(user)`, render a plain "Not authorised" page and nothing else. **A document must never render for an unauthorised viewer**; it carries client pricing.
2. Load `CompanySettings` via the same `upsert` singleton pattern as Task 5.
3. Load the document by `params.type` (`quotation` | `invoice` | `receipt`) and `params.id`, including its lines.
4. Return `notFound()` for an unknown type or missing document.
5. Render the matching layout from Task 10 inside `DocumentShell`.
6. Render a `no-print` toolbar above the page with a single button that calls `window.print()` (extract that button into a tiny `"use client"` component, since the page itself is a server component).

- [ ] **Step 4: Verify it renders and prints clean**

Start the dev server with `preview_start`. Navigate to a document's print URL using an id from the database. Confirm with `read_page` that the totals appear, and take a screenshot. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/documents/ src/components/documents/
git commit -m "feat(documents): A4 print shell with D1Z masthead and bars"
```

---

### Task 10: The three document layouts

**Files:**
- Create: `src/components/documents/quotation-doc.tsx`
- Create: `src/components/documents/invoice-doc.tsx`
- Create: `src/components/documents/receipt-doc.tsx`

**Interfaces:**
- Consumes: `DocumentShell`, `CompanyInfo` (Task 9); `groupBySection`, `lineAmount`, `computeTax` (Task 1)
- Produces: `<QuotationDoc quotation company />`, `<InvoiceDoc invoice company />`, `<ReceiptDoc receipt invoice company />`

- [ ] **Step 1: Build the shared line table**

Add to `src/components/documents/document-shell.tsx`:

```tsx
import { groupBySection, lineAmount, type DocumentLineInput } from "@/lib/document-math";

const naira = (n: number) =>
  `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * Summary renders one row per section; Itemised renders every line with its
 * full arithmetic. Both sum the same array, so their totals cannot disagree.
 */
export function DocumentLines({
  lines,
  detailLevel,
}: {
  lines: DocumentLineInput[];
  detailLevel: string;
}) {
  const groups = groupBySection(lines);
  const itemised = detailLevel === "ITEMISED";

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #ececec" }}>
          <th style={{ textAlign: "left", padding: "2mm 0", fontSize: "8pt", letterSpacing: "1px", textTransform: "uppercase", color: "#a0a0a0", fontWeight: 400 }}>
            {itemised ? "Item" : "Description"}
          </th>
          {itemised && (
            <>
              <th style={{ textAlign: "center", width: "18mm", fontSize: "8pt", color: "#a0a0a0", fontWeight: 400 }}>Qty</th>
              <th style={{ textAlign: "center", width: "18mm", fontSize: "8pt", color: "#a0a0a0", fontWeight: 400 }}>Days</th>
              <th style={{ textAlign: "right", width: "28mm", fontSize: "8pt", color: "#a0a0a0", fontWeight: 400 }}>Rate</th>
            </>
          )}
          <th style={{ textAlign: "right", width: "32mm", fontSize: "8pt", letterSpacing: "1px", textTransform: "uppercase", color: "#a0a0a0", fontWeight: 400 }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) =>
          itemised ? (
            <React.Fragment key={g.section}>
              <tr>
                <td colSpan={5} style={{ paddingTop: "4mm", paddingBottom: "1mm", fontSize: "8pt", letterSpacing: "1px", textTransform: "uppercase", color: "#e8681c" }}>
                  {g.section}
                </td>
              </tr>
              {g.lines.map((l, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f4f4f4" }}>
                  <td style={{ padding: "2.5mm 0" }}>
                    <div>{l.description}</div>
                    {l.subDescription && (
                      <div style={{ color: "#9a9a9a", fontSize: "8.5pt", marginTop: "0.5mm" }}>
                        {l.subDescription}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "center", color: "#6e6e6e" }}>{l.quantity}</td>
                  <td style={{ textAlign: "center", color: "#6e6e6e" }}>
                    {l.days > 1 ? l.days : "—"}
                  </td>
                  <td style={{ textAlign: "right", color: "#6e6e6e" }}>{naira(l.unitPrice)}</td>
                  <td style={{ textAlign: "right" }}>{naira(lineAmount(l))}</td>
                </tr>
              ))}
            </React.Fragment>
          ) : (
            <tr key={g.section} style={{ borderTop: "1px solid #f4f4f4" }}>
              <td style={{ padding: "3mm 0" }}>{g.section}</td>
              <td style={{ textAlign: "right" }}>{naira(g.total)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
```

Add `import React from "react";` at the top of the file for `React.Fragment`.

- [ ] **Step 2: Build the invoice layout**

Create `src/components/documents/invoice-doc.tsx`. Inside `DocumentShell`, render:

- Two bordered columns: "Billed to" (account name, `billingAddress`) and "Project" (title, event date range formatted as `24–27 Aug 2026` when both dates exist).
- Issue date and due date.
- `<DocumentLines lines={invoice.lines} detailLevel={invoice.detailLevel} />`
- A totals area, left side payment details from `company` (bank name, account, account name, then RC and TIN in muted text — omitting any line whose value is null), right side:
  - Subtotal
  - Discount, only when greater than zero
  - `VAT {vatRate}%`
  - A `.doc-totals` block with the label "Total due" and `.doc-hero` showing `amount`.

**Render no WHT line and no deductions block.** The client sees subtotal, VAT and total only. This is a hard requirement from the spec.

- Payment terms in muted text below, when present.

- [ ] **Step 3: Build the quotation layout**

Create `src/components/documents/quotation-doc.tsx`. Same shell, different body:

- "Prepared for" block, and a scope block showing the title and event dates.
- `<DocumentLines />`
- Totals: subtotal, discount when non-zero, VAT, then a `.doc-totals` block labelled **"Quoted total"** — not "amount payable", because nothing is owed yet.
- Validity line when `validUntil` is set: `This quotation is valid until 23 September 2026.`
- Payment terms and notes when present.
- An acceptance block at the foot, two signature rules side by side:

```tsx
<div style={{ display: "flex", gap: "12mm", marginTop: "12mm" }}>
  {["Accepted for and on behalf of the client", "For D1Z Technologies"].map((label) => (
    <div key={label} style={{ flex: 1 }}>
      <div style={{ borderBottom: "1px solid #2b2b2b", height: "14mm" }} />
      <div style={{ fontSize: "8pt", color: "#6e6e6e", marginTop: "1.5mm" }}>{label}</div>
    </div>
  ))}
</div>
```

- [ ] **Step 4: Build the receipt layout**

Create `src/components/documents/receipt-doc.tsx`. Short and confirmatory — no line table:

- "Received from" — account name.
- A `.doc-totals` block with label "Amount received" and `.doc-hero` showing `receipt.amount`.
- A small definition list: payment method, reference, date received, and "Settles invoice {invoice.code}".
- Balance line: when `balanceAfter > 0`, `Balance outstanding: {naira(balanceAfter)}` in `#c25510`; when zero, `Paid in full. Thank you.` in `#2f7d32`.
- A signature rule labelled "For D1Z Technologies".

- [ ] **Step 5: Verify all three render**

Run: `npx tsc --noEmit`, then open each of the three print URLs in the preview and screenshot them. Confirm with `read_page` that an invoice page contains no occurrence of "WHT" or "withholding".

- [ ] **Step 6: Commit**

```bash
git add src/components/documents/
git commit -m "feat(documents): quotation, invoice and receipt layouts"
```

---

### Task 11: Documents module UI

**Files:**
- Create: `src/components/modules/documents.tsx`
- Create: `src/components/modules/documents/document-builder.tsx`
- Modify: `src/components/doz/app-shell.tsx`

**Interfaces:**
- Consumes: every API route from Tasks 5–8
- Produces: `<DocumentsModule />` registered under `ModuleId` `"documents"`

- [ ] **Step 1: Build the list view**

Create `src/components/modules/documents.tsx` following the structure of `src/components/modules/vendors.tsx` — `SectionHeader`, `Tabs`, `Card` rows. Three tabs: Quotations, Invoices, Receipts. Each row shows code, client, date, total and status badge, with actions: Open (new tab to the print route), Convert to invoice (quotations only, hidden once `convertedInvoiceId` is set), Record payment (invoices only, when not fully paid), Delete.

Header action is a "New document" button opening the builder.

- [ ] **Step 2: Build the builder dialog**

Create `src/components/modules/documents/document-builder.tsx`. A dialog with:

- Document type selector (Quotation | Invoice).
- Client picker — reuse `ClientSelect` from `src/components/modules/projects-events.tsx` by exporting it from there.
- Optional project picker, title, event start and end dates, due date (invoices) or valid-until (quotations).
- An editable line table: description, optional sub-description, section, quantity, days, unit price, with add and remove row. Show each row's computed amount live using `lineAmount`.
- A detail level toggle: Summary | Itemised, with the helper text `Summary groups lines by section. Itemised shows every line — use it for clients who ask for the full breakdown.`
- A government toggle labelled `Client withholds tax at source (government/MDA)`. When on, set `whtRate` to 5 and `vatWithheldAtSource` true, and reveal the gross-up input.
- Gross-up input labelled `Amount this job must bring in`. When filled, show a live preview computed with `grossUpSubtotal` and `computeTax`:

```tsx
<p className="text-xs text-muted-foreground">
  Invoice total {naira(preview.total)} · cash landing {naira(preview.expectedCash)}
</p>
```

- Discount and VAT rate inputs.
- A live totals summary using `computeTax` on the current lines.

On submit, POST to the relevant route, toast success with the returned code, close, refresh the list.

- [ ] **Step 3: Register the module**

In `src/components/doz/app-shell.tsx`, add a `documents` nav entry with a `FileText` icon, gated on `canIssueDocuments`-equivalent client logic (`user?.role === "FOUNDER" || permissions.includes("documents")`), and render `<DocumentsModule />` for that module id. Follow exactly how `vendors` is registered.

- [ ] **Step 4: Verify the whole flow in the browser**

With the dev server running: create a quotation with three lines and the government toggle on, confirm the gross-up preview shows cash landing equal to the target, open its print view, convert it to an invoice, record a partial payment, and open the receipt. Screenshot each document. Check `read_console_messages` for errors after each step.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/documents.tsx src/components/modules/documents/ src/components/doz/app-shell.tsx src/components/modules/projects-events.tsx
git commit -m "feat(documents): documents module with builder and gross-up preview"
```

---

### Task 12: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run every check**

```bash
npx prisma generate
npx tsc --noEmit
npm test
npm run lint 2>&1 | tail -3
```

Expected: typecheck clean, all tests pass, lint reports exactly **40 problems** — the pre-existing baseline. Any number above 40 means this work added lint errors; fix them.

- [ ] **Step 2: Production build**

```bash
mv examples /tmp/dozo-examples-hold
npm run build > /tmp/dozo-build.log 2>&1; echo "EXIT=$?"
mv /tmp/dozo-examples-hold examples
grep -iE "error|failed" /tmp/dozo-build.log | head
```

Expected: `EXIT=0` and no error lines. `examples/` is gitignored and must be moved aside or the build fails on it.

- [ ] **Step 3: Confirm no regression in existing money handling**

Run: `npm test`
Expected: the 19 pre-existing `received-allocation` and `crm-metrics` tests still pass unchanged. This module was not modified; `collectableAmount` picks up `expectedCash` on its own.

- [ ] **Step 4: Confirm access control**

With the dev server running, use the View As feature to become a non-founder and confirm:
- The Documents module does not appear in the nav.
- `GET /api/doz/documents/quotations` returns 403.
- A document print URL renders "Not authorised" and no figures.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore(documents): verification pass"
git push
```

---

## Deferred to a later plan

- **Price list** — `ServiceItem.standardCost`, `unit`, `billsPerDay`, cost-sheet pre-fill and write-back.
- **Markup panel** — cost-to-client-price conversion with category defaults, reusing `grossUpSubtotal` and `computeTax` from Task 1.
- **Build a document from an approved cost sheet**, replacing manual line entry.
- **Margin panel** — cost versus `expectedCash`.

## Open questions

- Should an accepted quotation also be able to create the project, or is the project always created first?
- Does the price list need per-client rates, or is one standard cost per item enough?
