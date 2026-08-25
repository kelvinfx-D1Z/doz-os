# Client Documents: Quotation, Invoice, Receipt

**Date:** 2026-08-25
**Status:** Approved design, not yet planned
**Supersedes the invoicing sections of:** `2026-07-31-costing-and-invoicing-design.md`

## The problem

The founder cannot produce a client-facing document from DOZ OS. There is no
way to create an invoice at all — the only `invoice.create` in the codebase is
an internal side effect in the projects route. There is no quotation model, no
receipt model, and no PDF or print capability anywhere in the project.

Every quote, invoice and receipt D1Z has ever issued was made outside the
system. That means the numbers the business runs on and the numbers the client
sees have never been the same artefact.

## The workflow being replicated

This is how the work actually moves, in the founder's words:

1. The founder or production manager creates a project and prices each item
   **from D1Z's own price list** — or enters a new price for something not on
   it. This is the **budget**, meaning cost.
2. **Only the founder approves** that budget.
3. The founder then **marks up the cost**, and either sends the marked-up
   figures as a **quotation** or turns them into an **invoice**.
4. The client pays. A **receipt** confirms it.

Two facts about the client base shape the documents:

- **Some clients demand every line spelt out**, not grouped. Others want a
  clean summary. The same job must be presentable both ways.
- **Many events run for several days**, and day count multiplies some lines
  (LED, crew, generators) but not others (a fabricated backdrop, photography).

## What already exists

More than expected. This design finishes work that was started, rather than
inventing from scratch.

- `Invoice` carries the full tax structure: `subtotal`, `discount`, `vatRate`,
  `whtRate`, `whtAmount`, and `expectedCash`.
- `InvoiceLine` has `section`, `days`, `quantity`, `unitPrice`, `amount` and
  `sourceServiceIds`.
- `ProjectService.clientPrice` exists, commented *"Set by the founder during
  markup; never shown to a PM or intern."* Nothing was ever built on it.
- The cost sheet, budget submission and founder approval flow all work.
- `User.permissions` is a JSON array of module ids — a working per-user
  override that can grant module access without a new permission system.

## What is missing

- **No price list.** `ServiceItem` has a name and a category and no price, so
  there is nothing for a cost sheet to pull a rate from.
- **No company record.** Nowhere to hold RC number, TIN, VAT registration,
  company bank account or logo. The only bank fields are on `User` and they are
  personal.
- **No client billing address.** `Account` has name, industry and website.
- **No markup step**, no quotation, no receipt, no document rendering.

## Design

### Phase 1 — Foundation

Nothing user-visible changes. All additive.

#### Schema

```prisma
model CompanySettings {
  id            String  @id @default("singleton")
  legalName     String  // D1Z Technologies Ltd
  tradingName   String? // D1Z tech
  address       String
  phone         String
  email         String
  website       String?
  rcNumber      String?
  tin           String?
  vatRegistered Boolean @default(true)
  bankName      String?
  bankAccount   String?
  bankAccountName String?
  logoUrl       String?
  defaultPaymentTerms String? // "Payment due within 30 days of invoice date"
  updatedAt     DateTime @updatedAt
}
```

A single row, id fixed to `"singleton"`, created on first read if absent.
Founder-editable in Settings. Every document reads from it, so correcting the
TIN once corrects it everywhere.

```prisma
// Account
billingAddress String?

// ServiceItem — this is the price list
standardCost   Float?    // cost for ONE unit for ONE day
unit           String    @default("UNIT") // UNIT, DAY, SQM, PERSON
costUpdatedAt  DateTime?
billsPerDay    Boolean   @default(false) // does day count multiply this?
```

`unit` is a **label only** — it tells the founder what they are pricing
("per sqm", "per person"). It never enters a calculation.

`billsPerDay` is the one that does. It seeds `ProjectService.days` when a line
is added: `true` gives the line the event's day count, `false` pins it to 1.
An LED wall bills per day; a fabricated backdrop does not. The amount is
always `quantity × days × unitPrice`, with no second multiplier anywhere —
`unit` must never be read as one.

#### Documents module

A new `documents` module id. Founder-only by default; grantable to a named
person through the existing `User.permissions` array. Document routes check
module permission, not a hard-coded role, so granting access needs no code
change.

### Phase 2 — Pricing and markup

**Price list pre-fill.** Adding a service to a cost sheet pre-fills
`unitPrice` from `ServiceItem.standardCost`. The PM can override it. If they
do, a "save as new standard rate" action writes it back to the price list and
stamps `costUpdatedAt`. The price list is maintained by using it.

**Approval.** Unchanged. PM submits, only the founder approves.

**Markup panel — founder only.** Approved cost lines on the left, client price
on the right, writing to `ProjectService.clientPrice`. Category defaults
pre-fill as a starting point to argue with, not a formula:

| Section | Default |
|---|---|
| Equipment / audiovisual | 2.0× |
| Fabrication / scenic | 3.5× |
| Personnel | 1.3× |

Live margin in Naira and percent as the founder types. Never visible to a PM
or intern.

### Phase 3 — The three documents

#### Models

```prisma
model Quotation {
  id          String   @id @default(cuid())
  code        String   @unique       // QUO-2026-001
  projectId   String?
  accountId   String?
  title       String?
  eventStart  DateTime?
  eventEnd    DateTime?
  detailLevel String   @default("SUMMARY") // SUMMARY | ITEMISED
  subtotal    Float    @default(0)
  discount    Float    @default(0)
  vatRate     Float    @default(7.5)
  tax         Float    @default(0)
  total       Float    @default(0)
  paymentTerms String?
  notes       String?
  status      String   @default("DRAFT") // DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED
  validUntil  DateTime?
  convertedInvoiceId String?
  lines       QuotationLine[]
}

model Receipt {
  id          String   @id @default(cuid())
  code        String   @unique       // REC-2026-032
  invoiceId   String
  amount      Float                  // this payment only
  method      String?                // Bank transfer, cheque, cash
  reference   String?
  receivedAt  DateTime
  balanceAfter Float                 // outstanding after this payment
  createdAt   DateTime @default(now())
}

model DocumentSequence {
  id     String @id @default(cuid())
  type   String  // QUO | INV | REC
  year   Int
  next   Int    @default(1)
  @@unique([type, year])
}
```

`QuotationLine` mirrors `InvoiceLine`: `section`, `description`,
`subDescription`, `days`, `quantity`, `unitPrice`, `amount`, `sortOrder`.

`Invoice` gains the same document-level fields it currently lacks, all
additive and nullable or defaulted:

```prisma
// Invoice
detailLevel  String    @default("SUMMARY") // SUMMARY | ITEMISED
title        String?
eventStart   DateTime?
eventEnd     DateTime?
paymentTerms String?
quotationId  String?   // set when converted from a quotation

// InvoiceLine
subDescription String?
```

`subDescription` on both line models is the optional grey note under an item
saying what it includes. Blank leaves the line single-row.

**Numbering** comes from `DocumentSequence`, incremented inside the same
transaction that creates the document. Not `count() + 1`: a duplicated or
skipped invoice number is an audit problem, and two documents created in the
same second must not collide.

#### The itemisation toggle

Lines are **always stored granular**, one row per real item, each carrying a
`section` that names the group as the client should see it ("Stage design &
fabrication"). The toggle changes only rendering:

- **Summary** — one row per section, showing the section name and its total.
  No quantity or days columns, because a section with mixed day counts has no
  single honest calculation to show.
- **Itemised** — every line under its section header, with the full
  calculation.

Totals are identical in both views **by construction**, because both sum the
same rows. There is no second set of numbers to drift.

#### Multi-day lines

Itemised lines show the arithmetic in full: `12 × 4 days × ₦85,000 =
₦4,080,000`. A line that does not multiply by days shows a dash in the days
column. A government finance officer can check every figure without asking.

#### Lifecycle

Quotation → **Accept** → Invoice, carrying lines, sections, detail level and
terms across, and stamping `convertedInvoiceId` so the chain is traceable.

Invoice → **Record payment** → Receipt, one per payment. Partial payments each
get their own receipt showing the amount received and the balance outstanding.
Recording a payment updates `Invoice.amountPaid` and status through the
existing reconciliation, which compares against `expectedCash` — so a
government invoice settles correctly despite 5% WHT.

#### Tax

Unchanged from the existing model, which is already correct. VAT 7.5% on the
discounted subtotal. Where `Project.isGovernment`, WHT at 5% of the pre-VAT
subtotal is shown on the document and `expectedCash = total − whtAmount`. The
document shows both the invoice total and the cash expected, because those are
different numbers and only one of them will arrive.

Quotations show VAT. Quotations do not show WHT — it is deducted at payment,
not quoted.

### Rendering and PDF

Each document renders as a real A4 HTML page at
`/documents/[type]/[id]/print`, styled with a print stylesheet at exact A4
dimensions. The browser's own print-to-PDF produces the file.

**No new dependencies.** This is deliberate:

- Puppeteer or Playwright would not fit Vercel's serverless function size
  limits without a Chromium shim, and risks breaking a deploy that currently
  works.
- `jspdf` + `html2canvas` rasterises the page: text stops being selectable or
  searchable, and print output is soft.
- HTML and CSS give sharp, selectable, searchable text, exact control over the
  design, and the same page prints correctly on paper.

Delivery is download-or-print only. No email sending and no public share link
were requested, so neither is built — that keeps the external surface at zero.

### Visual design

One D1Z shell, three genuinely different layouts.

Shared shell:
- Charcoal (`#232323`) masthead with the logo reversed out in white, document
  type in orange caps, document number beneath.
- Stepped orange bars (`#d2570e` / `#e8681c` / `#f29222`) at the head and foot,
  carried over from the existing letterhead.
- Generous margins and hairline rules rather than filled table headers.
- Solid charcoal totals block with the key figure as the hero.
- Contact strip in the footer: phone, website, address.

Per document:

- **Quotation** — event dates and scope up front, terms and payment terms
  below, and a client acceptance signature line. The hero figure is the quoted
  total. No "amount payable", because nothing is owed yet.
- **Invoice** — issue and due dates, payment details, VAT and where applicable
  WHT. The hero figure is the amount payable, with the invoice total shown
  smaller beneath it.
- **Receipt** — short and confirmatory, roughly half a page. The hero figure is
  the amount received. Shows the payment method and date, which invoice it
  settles, and the balance still outstanding.

## Access

Founder only by default, across all three phases. The markup panel, client
prices, margin and every document are invisible to every other role, which
preserves the existing rule that only the founder sees budget, cost or profit.

The founder can grant the `documents` module to one named person through the
existing per-user permissions override. Granting it exposes client pricing to
that person by definition; that is the founder's decision to make.

## Build order

1. **Foundation** — company record, billing address, price list columns,
   documents module. Additive, invisible, cannot regress anything.
2. **Pricing and markup** — price list pre-fill and write-back, markup panel,
   margin.
3. **Documents** — models, numbering, builder, the three layouts, print routes,
   quote→invoice and payment→receipt.

Each phase ships independently and is useful on its own.

## Risk

Every schema change is a new model or a new nullable column. No existing table
changes shape, no existing column changes type or nullability, and no existing
route changes behaviour. The known failure mode in this codebase is a stale
Prisma client after a schema change, which is handled by the `prisma generate`
already in the build script and `postinstall`.

## Deliberately not built

- Email delivery and public share links — not requested; would add an external
  surface and a mail service dependency.
- Amount in words, quotation validity as a hard field, and signature images —
  offered and declined. Validity and signing can be written into the free-text
  terms if wanted later.
- Multi-currency. Every figure is Naira.
- Credit notes.

## Open questions

- Is WHT ever 10% for this work, or always 5%?
- Should an accepted quotation also be able to create the project, or is the
  project always created first?
