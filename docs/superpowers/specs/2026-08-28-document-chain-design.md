# The Document Chain: Budget → Quotation → Invoice → Receipt

**Date:** 2026-08-28
**Status:** Approved design, not yet planned
**Builds on:** `2026-08-25-client-documents-design.md`, `2026-08-27-base-and-official-price-design.md`

## The problem, in the founder's words

> "When we create a project (founder, PM or staff) we are creating a budget for the
> project. Budget when done can be converted to a quotation for the client (with
> the mark up). These could have different versions based on the negotiation with
> the client. When the company and the client agree, the quotation is now turned
> into invoice. Then when the client starts paying part payment or full, we start
> issuing receipts."

And then, having used it:

> "I logged in, went to Projects and Events, clicked on New Project… made the
> project. I went to the Documents link on the sidebar, expecting to find the
> budget of the project I just created and it wasn't there. It should be there, so
> I can modify it if I want before sending out. And when someone sends out a budget
> or invoice to me to approve, I should see it on my dashboard."

Every link in that chain exists in the code. None of them is joined, and the first
one is not where anyone would look for it.

## What is actually there today

| Step | Built | Where it lives |
|---|---|---|
| Budget | yes | The project's cost sheet (`ProjectService` rows), inside the project dialog |
| Markup to client price | yes | Markup panel, inside the project dialog |
| Quotation | yes | Documents → New document → pick project → "Load priced lines" |
| Quotation → Invoice | yes | Convert action |
| Invoice → Receipts | yes | Record payment |

Reaching a quotation from a new project takes five unsignposted steps: open the
project, approve the budget, open the markup panel, convert base to official, then
go to Documents and load the lines. The founder tried the obvious path and it led
nowhere.

Three things are missing outright:

- **Documents has no Budgets tab.** There is nowhere to open a budget, change it,
  and act on it.
- **Nothing reaches the dashboard for approval.** `BUDGET_SUBMITTED` appears
  nowhere in `dashboard/route.ts` or the Command Center. A submitted budget is
  invisible until someone opens that specific project.
- **Quotations have no revisions**, and an agreed price never returns to the
  project. `Quotation` has no `revision`, no link between revisions, and
  `convert/route.ts` writes nothing to `Project`.

And one contradiction, introduced when base/official pricing was added without
retiring what it replaced: **the New Project form still asks for "Project Cost
(Budget)" and "Total Contract Value" by hand**, while the cost sheet and the
markup panel compute both. The app asks for figures it also derives, and nothing
reconciles the two answers.

## The chain, and who each link is for

```
Budget          INTERNAL — cost from our vendors, put together by the team and
   │                       production managers
   │  mark up
   ▼
Quotation       TO THE CLIENT — revisable through negotiation
   │  agree
   ▼
Invoice         TO THE CLIENT
   │  part or full payment
   ▼
Receipt         TO THE CLIENT — one per payment
```

A budget never leaves the company. If a client is to see a priced document, it is a
quotation, and it carries markup.

### The two rates, and what to call them

The founder's own words, and the terms the app should use everywhere:

| | Also called | What it is | Who sees it |
|---|---|---|---|
| **BP** | Budget Rate, Basic Rate | What the job costs D1Z — vendor hire, crew day rates, transport | Founder, staff, and the PM building it |
| **CP** | Official Rate, Client Rate, Corporate Rate | What the client is charged | Founder only, until it reaches a quotation |

Earlier specs in this series called the second one **OP** (Official Price). **CP is
the term from here on**, because it is the founder's, and because "client rate" says
plainly whose number it is.

The schema already agrees: `ProjectService.clientPrice` is CP, and `unitPrice` is BP.
Only the wording in the interface and in the earlier specs needs to follow.


## Design

### 1. The budget is a document, not a hidden panel

**No new table.** The budget *is* the project's `ProjectService` rows. Duplicating
them into a `Budget` model would create a second source of truth for what a job
costs — the exact mistake this codebase already carries once, in `Referral` and
`ReferralSource`.

Documents gains a fourth tab, **Budgets**, listing every project that has a cost
sheet. Each row shows the project, its line count, its base total, and its state:

| State | Meaning |
|---|---|
| Draft | Lines still `LISTED`; the PM is building it |
| Submitted | `BUDGET_SUBMITTED`; waiting on the founder |
| Approved | `APPROVED`; costs settled, ready to price |
| Priced | Project is `OFFICIAL`; a quotation can be raised |

Opening a budget shows the same cost sheet the project dialog shows, editable
under the same rules — the PM edits while the project is `BASE`, and it locks when
the founder converts it.

Actions, each gated as it already is server-side: **Submit for approval** (PM),
**Approve** (founder), **Price it** (founder — opens the markup panel), and
**Create quotation** (founder — once the project is `OFFICIAL`).

That last action closes the gap the founder hit. From a budget, one click produces
a quotation carrying its priced lines.

#### A budget is internal

It is cost: what D1Z pays vendors and crew. "Sending it out" means sending it to
the founder for approval, never to a client. A client receives a quotation, which
carries markup.

The budget's print view is therefore marked **INTERNAL — NOT FOR CLIENT
CIRCULATION** and does not use the D1Z client letterhead. Its access follows the
cost sheet exactly: founder and staff on any project, a production manager or
freelancer on projects they manage, nobody else. An intern never sees it.

### 1b. The company rate card

> "We should have a cost sheet of all our services, which can be modified per
> project. So starting a budget fee can be done from a template."

Today every cost is typed from scratch on every project. `ServiceItem` — the 31-line
service catalogue behind the Section and Description dropdowns — holds a name and a
category and no price, so there is nothing for a budget line to pull a rate from.

```prisma
// ServiceItem
standardCost  Float?     // BP — what D1Z pays. Null where it always varies.
standardClientRate Float? // CP — the published client rate. Null where unpriced.
unit          String    @default("UNIT") // UNIT, DAY, SQM, PERSON — a LABEL only
costUpdatedAt DateTime?
rateUpdatedAt DateTime?  // when the client rate last changed
```

**Two figures, not one.** The founder's own rate card insists on this separation:

> "I strongly recommend that the actual internal costing sheet and client rate card
> remain separate. Your internal sheet should contain: Actual Cost → Markup →
> Selling Price → Gross Margin. The client should normally see: Service → Quantity
> → Rate → Amount, rather than your supplier costs."

A camera **costs** ₦30,000 and is **charged** at ₦45,000. Storing only one of those
would either lose the margin or expose the cost. `standardCost` (BP) is founder-and-team visible under the
existing cost-sheet rule; `standardClientRate` (CP) is what reaches a quotation.

`unit` tells the founder what they are pricing ("per sqm", "per person"). **It never
enters a calculation.** The amount is always `quantity × days × unitPrice`, with no
second multiplier anywhere.

**How a rate reaches a budget line.** Adding a service to a cost sheet pre-fills
`unitPrice` from `standardCost`. The production manager can override it for that
project — a vendor quoted differently this time, or the venue is further out. The
override lives on that project's line and changes nothing company-wide.

**The rate card is maintained by using it.** When a line's cost is overridden, an
optional "save as the new standard rate" action writes it back to `ServiceItem` and
stamps `costUpdatedAt`. Nobody has to remember to maintain a price list; it drifts
toward reality as jobs are priced.

**Templates carry rates by reference, not by copy.** `EventTemplateItem` gains an
optional `serviceItemId`. Where a template line is linked to a catalogue service, its
cost comes from that service's `standardCost` at seeding time, so raising the camera
rate once updates every future budget. `defaultUnitCost` remains, but only as a
deliberate per-template override for a line that is not in the catalogue.

**Seeding.** The rate card is seeded from D1Z's own equipment-rental cost sheet — a
genuine cost document, unlike the three client invoices behind the templates. Only
lines with a real known cost are seeded; the rest stay null, because an unpriced line
is honest and an invented one is not.

#### The catalogue is rebuilt around how D1Z actually costs

> "Can we merge them together? For instance under Displays would be LED screens,
> Standing Monitors, Floor Monitors, Control room Monitors, Stage Timer. We need the
> list to be extensive and we need to be able to add to it."

The existing six departments are business-facing groupings — "Audiovisual & Technical
Production" — under which sit 31 generic services. The founder costs by **equipment
type**, which is finer and more useful at the point a budget line is added.

The catalogue is therefore rebuilt: the founder's cost-sheet lines and the existing
generic services are merged into type-based departments, each holding an extensive
list. Displays, Cameras & Capture, Sound, Lighting, Streaming & Broadcast, Stage &
Scenic, Branding & Print, Furniture, Personnel, and Logistics & Welfare.

Every line the founder budgets with survives, including ones the generic list had no
home for — Bucket chairs, Workmanship, Lunch for crew. Nothing is dropped to keep the
list tidy; a rate card that omits what you actually spend money on is worse than the
spreadsheet it replaces.

Lines the founder named but for which no rate is known — Standing Monitors, Floor
Monitors, Control room Monitors, Stage Timer — are seeded **with no cost**. They
appear in the dropdowns and the founder fills the rate in the first time one is used,
or in the Catalogue tab, which already supports adding, renaming and removing.

#### Where the sheet disagrees with itself

Several lines carry two rates on the same sheet — lighting at ₦200,000 and ₦180,000,
the mixer at ₦30,000 and ₦20,000, transport at ₦50,000 and ₦30,000.

> "It varies per project; the average for light is 180,000."

So a standing rate is a **representative average**, not a ceiling or a floor, and it
is expected to be adjusted per project — which is exactly what the per-project
override in this section is for. Lighting seeds at **₦180,000** on the founder's
direct instruction. Any other split rate is seeded at its midpoint and flagged for
the founder to correct, rather than a figure being picked silently.

This is why the three seeded templates currently have no costs. Once the rate card
exists, a template that links its lines to catalogue services produces a budget with
real figures in it, which is what "starting a budget from a template" means.

### 1c. The rate card prices a job; the multiplier is only a fallback

**A published rate beats a formula.** Where a service carries a `standardClientRate`, the
markup panel pre-fills that figure directly — no arithmetic, no guessing. The section
multiplier is used only for a service with no published rate yet.

This matters because a formula cannot express what a real rate card does: a stage
does not mark up like a camera, and some services are priced by package rather than
as a multiple of cost.

The founder's margin is then whatever the rate card actually earns, shown honestly,
rather than assumed by a multiplier nobody checked.

#### The shipped multipliers are wrong and must be corrected

`src/lib/pricing.ts` currently ships:

| | In the code | The founder's own rate card (§25) |
|---|---|---|
| Equipment | **2.0×** | 25–40% → 1.25–1.40× |
| Fabrication | **3.5×** | 25–40% → 1.25–1.40× |
| Personnel | 1.3× | 30–50% → 1.30–1.50× |

Checked against real cost-and-rate pairs in that document, actual markups cluster at
**1.2×–1.5×**: camera ₦30,000 → ₦45,000 (1.50×), LED 6sqm ₦150,000 → ₦225,000
(1.50×), stage ₦390,000 → ₦500,000 (1.28×), production manager ₦250,000 → ₦325,000
(1.30×), photography ₦100,000 → ₦120,000 (1.20×).

**The 3.5× fabrication multiplier would quote a ₦390,000 stage at ₦1,365,000, where
the founder's own rate card says ₦500,000** — nearly three times too high, and a lost
job with no explanation. The 3.5× came from analysing a single earlier invoice where
fabrication genuinely did mark up several times; that may have been true of that job,
but it is plainly wrong as a default.

Replace the three rules with the founder's own category table, using the midpoint of
each stated range:

| Category | Stated range | Fallback multiplier |
|---|---|---|
| Equipment rental | 25–40% | 1.35× |
| Crew / personnel | 30–50% | 1.40× |
| Production management | 30–50% | 1.40× |
| Branding materials | 20–30% | 1.25× |
| Printing | 20–30% | 1.25× |
| Fabrication | 25–40% | 1.35× |
| Exhibition stands | 25–40% | 1.35× |
| Logistics | 20–30% | 1.25× |
| Post-production | 40–60% | 1.50× |
| Motion graphics | 50%+ | 1.50× |
| Colour grading | 50%+ | 1.50× |
| Creative / consultancy | 50%+ | 1.50× |
| Anything unmatched | — | 1.35× |

**Priority.** This code is live. No quotation has been raised and no cost line
exists, so nothing has been mispriced yet — but it is a landmine under the first real
job, and it should be corrected before the rate card is seeded rather than after.

#### Scope of the seed

The founder's rate card runs to roughly 200 lines across 30 sections. **Per-service
lines are seeded**: camera and video equipment, LED and display, lighting, sound,
livestreaming, photography, crew, production management, stage, branding and print,
furniture, flags, exhibition stands, booth and walkway, drone, post-production,
colour grading, motion graphics, content production, data, transport and catering.

**Packages, overtime rates, multi-day discount bands, the minimum project charge and
payment terms are deliberately not catalogue lines.** They are pricing policy, not
services, and a package's cost has to be derived from its components or it silently
breaks the margin. They get their own treatment later.

### 2. A quotation becomes a thread of revisions

```prisma
// Quotation
revision       Int     @default(1)
rootId         String?  // first revision in the thread; null on the root itself
supersededById String?  // set when a newer revision replaces this one
```

`code` moves from `@unique` to `@@unique([code, revision])`, so every revision in a
thread shares `QUO-2026-018` and differs by revision number. There are zero
quotations in production, so this costs nothing.

The **current** revision is the one in its thread that nothing supersedes. Earlier
revisions are read-only.

**Revise** clones a quotation and its lines into revision N+1 as a draft, and points
the previous revision at it. The rendered document reads
**"QUO-2026-018 · Revision 2"**, so a client holding two PDFs can tell which is
which.

### 3. Accepting a revision writes the deal back to the project

```prisma
// QuotationLine
sourceServiceId String?  // the ProjectService line this priced
```

This link does not exist today, which is why nothing can flow back. It is set when
lines are loaded from a project.

Accepting a revision:

1. marks it `ACCEPTED` and supersedes its siblings
2. writes each line's unit price to the `ProjectService.clientPrice` it came from
3. sets `Project.revenue` to the accepted total

After that the markup panel, dashboard, P&L and cash flow all describe the deal
that happened rather than the opening ask.

Two limits, stated rather than hidden:

- **A line typed freehand on the quotation has no cost line behind it** and updates
  nothing. That is correct — there is no cost to attach it to.
- **A blanket discount does not map onto lines.** Knocking 7% off a total flows to
  `Project.revenue`, but individual `clientPrice` values stay as quoted, so
  per-section margin reads slightly high while the headline margin is right.
  Spreading a discount across lines the founder did not touch would be inventing
  numbers.

Accepting **overwrites** `Project.revenue`. That is the point — one source of
truth — but it means the accepted quotation wins over anything typed by hand.

### 4. Invoicing tightens to match

Converting refuses anything that is not the accepted, current revision, and names
which revision is current. Today it would happily invoice a superseded draft.

### 5. The manual cost and contract fields go

The New Project form stops asking for "Project Cost (Budget)" and "Total Contract
Value". Cost comes from the cost sheet; contract value comes from the accepted
quotation.

`Project.budget` and `Project.revenue` **remain as columns** — they are read by
the dashboard, Financial Intelligence, cash flow, the reminder engine and the AI
briefings — but they become **derived** rather than typed:

- `budget` ← the cost sheet's base total, recomputed when a cost line changes
- `revenue` ← the accepted quotation's total, written on acceptance

**Build-order constraint:** this step must come *after* the write-back in section 3.
Removing the manual entry before anything populates `revenue` would leave every
downstream figure at zero. The four existing projects carry hand-typed values and
keep them until a quotation is accepted against them.

### 6. Approvals reach the dashboard

The Command Center gains one **Waiting on you** block for the founder, listing:

- budgets submitted for approval (`ProjectService` rows at `BUDGET_SUBMITTED`,
  grouped by project)
- projects proposed by a production manager (`approvalStatus: "PENDING"`)
- quotations sent and awaiting a client decision, older than their `validUntil`
- invoices still `DRAFT` — issued in the app but never marked sent, so invisible
  to Finance and to the reminder engine

Each row links straight to the thing. Empty means genuinely nothing waiting, and
the block hides itself.

## What this does not change

- The confidentiality boundary. `clientPrice`, margin and official totals stay
  founder-only; the budget's own view is cost-only and follows the cost sheet's
  existing access rule.
- WHT still appears on no client-facing document, and `expectedCash` remains
  `net − wht` for government clients.
- Receipts are unchanged: one per payment, measured against `collectableAmount`.

## Build order

1. **Budgets tab** — the founder's immediate gap; needs nothing new in the schema.
2. **Correct the shipped markup multipliers** — a few lines in `pricing.ts` plus its
   tests. Do this FIRST within the rate-card work: the live 3.5× fabrication default
   overprices a stage nearly threefold, and every later step assumes sane fallbacks.
3. **Rate card** — `standardCost` and `standardClientRate` on the catalogue, the rebuilt
   type-based departments, pre-fill on a new cost line, rate-card-first pricing in the
   markup panel, save-back on override, and seeding. This is what makes "start a
   budget from a template" mean anything; without it a template supplies line names
   and day counts but every figure is still typed by hand.
4. **Quotation revisions** — schema plus the revise action.
5. **Acceptance write-back** — needs `sourceServiceId`, which the Budgets tab's
   "Create quotation" action should set from the start.
6. **Derive budget and revenue** — only once 5 populates them.
7. **Dashboard approvals** — independent; can land any time after 1.

## Deferred

- Per-client rate agreements.
- Sending a document by email from the app. The founder's chosen model is download
  and send it themselves.
