# Production Costing & Invoicing

**Date:** 2026-07-31
**Status:** Design, not yet built
**Replaces:** the Google Sheets costing workflow

---

## The workflow being replicated

1. **PM builds a cost sheet** — what we pay out, line by line, grouped by section
2. **PM submits it** for approval
3. **Founder approves**, which queues vendor payments
4. **Founder marks it up** and issues one or more client invoices
5. Client pays; on government jobs, 5% is withheld at source

Steps 1–3 already exist in DOZ OS (`ProjectService`, `submit_budget`,
`approve_budget`). Steps 4–5 do not.

## Evidence base

Three real cost sheets (OLEF v1 ₦3,120,800; OLEF v2 ₦5,122,800; APPO
₦15,394,400) and the two APPO client invoices (₦13,227,875 and ₦18,237,375).

**Measured APPO margin:** cost ₦15,394,400 against ₦29,270,000 invoiced ex-VAT
= **₦13,875,600 gross margin, 47.4% of revenue, 90.1% markup on cost.**

**Markup varies sharply by section:**

| Section | Multiple |
|---|---|
| Stage design & fabrication | ~4.6× |
| Equipment / LED | ~2.1× |
| Exhibition booths | ~1.7× |
| Production personnel | **~1.3×** |

Personnel is the thinnest line in the business — crew billed at ₦50k/day
against ₦30k cost, with a ₦350k production manager largely absorbed by margin.

## Key structural finding

**The invoice is not the cost sheet with a price column.** It is a separate,
client-facing document:

- Cost sheet: ~40 granular lines (MATERIALS, WORKMANSHIP, LIGHT STRIP, BUCKET
  CHAIRS, SIDE TABLES, PANEL CHAIRS, TRANSPORTATION, PRINTING)
- Invoice: 19 **bundled** lines ("Stage Design & Fabrication", "Wall branding",
  "Photowall and Directional Stands")
- Invoice adds lines with no cost equivalent — *Professional fees ₦520,000*
- One project produced **two** invoices (event, exhibition)
- Zero-priced lines are deliberate: *"Items with the Unit Price of '0' are
  complementary"*

Any design that merely adds a price column to each cost row produces invoices
that do not look like theirs. Cost lines must **roll up** into fewer invoice
lines.

## Per-line days, not per-project

APPO ran two days. LED went ₦480k → ₦960k, lighting ₦150k → ₦300k,
videographers ₦60k → ₦120k — but **sound stayed at ₦200k and photography at
₦80k**. Whether a line multiplies by days is decided line by line.

The invoice carries the same idea in its DAYS column: `AMOUNT = DAYS × QTY ×
UNIT PRICE`.

## Tax: VAT and WHT are different things

**VAT 7.5%, added on top.** Confirmed on both invoices (922,875 / 12,305,000 and
1,272,375 / 16,965,000 — exactly 7.5%).

**WHT 5% on government contracts, deducted at source**, on the pre-VAT value.

Worked example, APPO event invoice:

```
Subtotal (ex-VAT)              12,305,000
VAT @ 7.5%                        922,875
Invoice total                  13,227,875
Less WHT @ 5% of 12,305,000      (615,250)
CASH ACTUALLY RECEIVED         12,612,625
```

**This matters for a feature already shipped.** The "Received" reconciliation
added on 2026-07-29 compares money collected against the invoice total. On a
government job the client remits ₦12,612,625 against a ₦13,227,875 invoice —
the invoice will look permanently underpaid by exactly the withheld amount,
which is not a debt but a tax credit.

So the invoice must record WHT and treat `invoiceTotal − WHT` as the expected
cash. Without this, every government invoice reads as partially unpaid forever.

---

## Design

### Schema additions

| Change | Purpose |
|---|---|
| `Project.isGovernment` (Boolean) | Drives WHT. Set at project creation. |
| `ProjectService.days` (Int, default 1) | Per-line day multiplier |
| `ProjectService.clientPrice` (Float?) | Unit price charged, distinct from cost |
| `Invoice.subtotal`, `discount`, `vatRate`, `vatAmount`, `whtAmount` | Invoice arithmetic |
| `Invoice.expectedCash` (Float) | `total − whtAmount`; what should actually arrive |
| New `InvoiceLine` | description, days, quantity, unitPrice, amount, section, sortOrder |
| New `EventTemplate` + `EventTemplateItem` | The reusable "typical event" list |

`PricingTemplate` already has `baseCost` / `basePrice` / `margin` / `lineItems`
and no UI. Either reuse it as `EventTemplate` or retire it — do not leave two
overlapping models.

### 1. Create Event from template

A **Create Event** button for the PM opens a standard event template
pre-populated with everything a typical job might need — the full list,
including lines that usually carry no cost (drone, post-production, producer,
executive director).

The PM **enables or disables** each line rather than typing from scratch. This
mirrors how the sheets are actually used: a master list reused per event, with
irrelevant rows left at zero.

Disabled lines are excluded entirely. Enabled lines become `ProjectService`
rows at `LISTED`, ready for costing.

The PM can always add a line not on the template — the `add_custom_item`
action already exists.

### 2. Cost sheet (exists, needs extending)

Add the `days` column and section subtotals. Everything else works: sections,
quantity, unit cost, vendor details, notes, submit → approve, and automatic
vendor payment requests on approval.

PM sees cost only. Never client price, never margin.

### 3. Invoice builder — founder only

Starts **from the approved cost sheet**. The founder:

- Selects cost lines and **bundles** them into a single invoice line, naming it
  as the client should see it ("Stage Design & Fabrication")
- Sets DAYS, QTY and UNIT PRICE for that invoice line
- Adds lines with no cost basis (professional fees)
- Sets a line to zero price to mark it complimentary
- Applies an optional discount

Section markup defaults (equipment 2.0×, fabrication 3.5×, personnel 1.3×)
pre-fill the unit price as a **starting point to argue with**, not a formula.

Multiple invoices per project, each with its own line set.

### 4. Margin panel — founder only

Total cost vs total invoiced ex-VAT, margin in Naira and percent, and margin by
section. This is the payoff: it turns two disconnected documents into the one
number the business has never had.

### 5. Tax handling

- VAT 7.5% added to subtotal (rate editable)
- If `Project.isGovernment`, compute WHT at 5% of the pre-VAT subtotal, show it
  on the invoice, and set `expectedCash = total − wht`
- The Received reconciliation compares against `expectedCash`, not `total`

## Build order

1. **Schema + government flag + per-line days** — small, unblocks everything
2. **Invoice builder with bundling, VAT and WHT** — the core gap
3. **Margin panel** — cheap once 1 and 2 exist
4. **Create Event template** — highest UI cost, biggest time saver for the PM

## Open questions

- Is WHT ever 10%, or always 5% for this work?
- Do any clients require the invoice to show cost breakdown, or only the bundled
  view?
- Should a template be per-event-type (conference, exhibition, shoot) or one
  master list?
