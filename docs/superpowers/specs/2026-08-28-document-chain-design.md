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
2. **Quotation revisions** — schema plus the revise action.
3. **Acceptance write-back** — needs `sourceServiceId`, which the Budgets tab's
   "Create quotation" action should set from the start.
4. **Derive budget and revenue** — only once 3 populates them.
5. **Dashboard approvals** — independent; can land any time after 1.

## Deferred

- A price list on `ServiceItem` so cost lines pre-fill from a maintained rate card.
- Per-client rate agreements.
- Sending a document by email from the app. The founder's chosen model is download
  and send it themselves.
