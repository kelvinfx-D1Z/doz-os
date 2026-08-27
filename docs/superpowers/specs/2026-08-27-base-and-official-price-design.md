# Base Price and Official Price

**Date:** 2026-08-27
**Status:** Approved design, not yet planned
**Builds on:** `2026-08-25-client-documents-design.md` (the invoice/quotation layer this feeds)

## The problem

The founder needs the production manager to build a project — adding services,
vendors, quantities and costs. But a project that already carries client-facing
prices would expose those prices, and therefore the margin, to the PM.

The founder put it plainly:

> "If the project has been using OP, then the founder should be sharing these
> figures with the PM, which is very wrong. There has to be a point where the
> founder fully takes over the project and the Production manager can no longer
> add to it."

So this is not a display toggle. It is a **handover**: a point at which the
project stops being the PM's cost sheet and becomes the founder's priced job.

## Two prices

| | What it is | Who sets it | Who sees it |
|---|---|---|---|
| **BP** — Base Price | What the job costs D1Z: vendor hire, crew day rates, transport, catering | Production manager | Founder, staff, the PM who built it |
| **OP** — Official Price | What the client is charged | Founder only | Founder only |

Evidence from the founder's own documents: a videographer costs ₦30,000/day on
the internal sheet and bills at ₦40,000 on the SPE invoice — a 1.33× personnel
markup, matching the section defaults below.

The schema already anticipated this and was never built on:

- `ProjectService.unitPrice` — *"COST per unit per day — what we pay out"* → **BP**
- `ProjectService.clientPrice` — *"What the CLIENT is charged. Set by the founder
  during markup; never shown to a PM or intern."* → **OP**, currently unused
  everywhere in `src/`.

## The lifecycle

```
        PM builds cost sheet          founder converts        founder prices
BASE ──────────────────────────►  ──────────────────────►  OFFICIAL
  ▲   add services, vendors,        BP × section default      invoices and
  │   quantities, days, costs       pre-fills OP;             quotations draw
  │   submit_budget →               cost sheet LOCKS          from OP
  │   approve_budget →                  to the PM
  │   vendor payment requests
  │                                                              │
  └───────────────── founder reopens (late additions) ───────────┘
```

### While BASE

The PM's phase, and the default for every new project.

- PM adds and edits cost lines: service, vendor, quantity, days, unit cost.
- `clientPrice` stays `null` on every line. There is nothing on the project for
  a PM to see even if a permission check were wrong — the defence is the absence
  of the data, not only the gate in front of it.
- **No invoice or quotation can be raised.** There is no client price to raise
  one from; attempting it returns a plain refusal naming the reason.
- The existing `submit_budget` → `approve_budget` flow is unchanged and still
  generates vendor `PaymentRequest` rows on approval. Approving the budget
  settles *what we will spend*; it is a different question from *what we will
  charge*, and remains a separate step.

### Conversion — founder only

Approving the budget is a precondition: price the job once the costs are settled.

The founder opens the markup panel, which shows each approved cost line with its
BP and a pre-filled OP. On confirm, every line's `clientPrice` is written and the
project's stage flips to `OFFICIAL`.

Section defaults, as starting points to argue with rather than a formula:

| Section | Default |
|---|---|
| Equipment / audiovisual | 2.0× |
| Fabrication / scenic | 3.5× |
| Personnel | 1.3× |
| Anything else | 2.0× |

A line may be set to zero to mark it complimentary — the reference invoices do
exactly this, with a footnote reading *"Items with the Unit Price of '0' are
complementary"*.

### The lock

The moment a project becomes `OFFICIAL`, the cost sheet is closed to the PM:
they can no longer add, edit or delete lines. This is the whole point of the
feature and is enforced server-side, not merely hidden in the UI.

### Reopening

Late additions are normal on a live job. A founder-only **reopen** action returns
the project to `BASE` so the PM can add what is missing.

- Prices already set are **kept**, not discarded.
- Any line added while reopened has `clientPrice` null, so it is visibly
  **unpriced** and the founder can see exactly what still needs an OP before
  re-converting.
- Reopening exposes nothing: the PM never sees `clientPrice` at any stage.

## Templates

At project creation the founder (or a proposing PM) picks a template or leaves it
blank. A template seeds the cost sheet with sections, line names, quantities,
days and default unit costs.

`EventTemplate` and `EventTemplateItem` already carry every field needed —
`section`, `name`, `defaultQuantity`, `defaultDays`, `defaultUnitCost`,
`enabledByDefault`, `sortOrder` — and none of the default fields are read
anywhere in `src/` today. The earlier "saved service lists" feature writes only
`section` and `name`; those templates keep working, seeding lines with quantity
1, days 1 and no cost.

Three templates are seeded from the founder's reference documents:

1. **One-day production** — from the PTDF invoice: LED screen, live streaming, HD
   cameras, complete audio, video mixer, stage and audience lighting, production
   personnel, photography, panellist mics, professional fees.
2. **Multi-day conference** — from the SciBiz invoice: adds riser, stage TV
   monitor, stage timer, branding, decoration, opening animation, programme
   slides, panellist chairs, poster session.
3. **Lecture series** — from the SPE invoice: adds stage and platform
   construction, streaming equipment, post-production, external branding,
   conference advert production.

Default **costs are left blank** where they are not known. The reference
documents are client invoices showing OP, not cost sheets; populating BP from
them would put invented figures into the founder's pricing. The equipment-rental
sheet supplies real costs for the lines it covers, and only those are seeded.

## Visibility

Unchanged and non-negotiable. A PM or intern never sees `clientPrice`, the OP
total, or margin, at any stage. Every route that could return them strips them
server-side, as `/api/doz/projects` already does for `budget` and `revenue`.

## Schema additions

All additive.

```prisma
// Project
pricingStage        String    @default("BASE")   // BASE | OFFICIAL
convertedToOfficialAt DateTime?
convertedById       String?
templateId          String?   // which template seeded it, for reference
```

`ProjectService.clientPrice` already exists and needs no change.

## Margin

Once `OFFICIAL`, margin is available to the founder: OP total against BP total,
in naira and percent, by section and overall. Consistent with the client-documents
spec, the headline margin is measured against **cash that lands** rather than the
invoice face value, since government clients withhold 12.5% at source.

## Deferred

- A price list on `ServiceItem` (`standardCost`) so cost lines pre-fill from a
  maintained rate card. The catalogue editor now exists, so this is a natural
  follow-on.
- Per-client OP overrides (a rate agreed with a repeat client).
- Reordering template lines by drag.

## Decisions taken, for the record

- **Converting requires an approved budget.** Attempting to convert while lines
  are still `LISTED` or `BUDGET_SUBMITTED` is refused with a message naming how
  many lines are unapproved. Pricing a job whose costs are not settled produces
  a margin figure that is not real. The founder approves the budget themselves,
  so this costs one extra click, not a wait on someone else.
- **Reopening keeps existing prices** rather than clearing them, so a late
  addition does not throw away pricing work already done.
- **Template costs are seeded only where a real cost is known.** Client invoices
  show OP; inferring BP from them would put invented figures into the founder's
  pricing.
