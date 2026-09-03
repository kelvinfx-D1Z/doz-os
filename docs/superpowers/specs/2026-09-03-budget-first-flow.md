# Budget-first: a project's figures stop being typed and start being earned

**Date:** 2026-09-03
**Status:** Approved by the founder, ready to implement
**Supersedes the deferred item:** "Deriving the manual fields" from
`2026-08-28-rate-card-and-budgets.md`

## The complaint, in the founder's words

> "when creating a project, i am asked to select the type of services from a
> list, then i have to type the project cost, and total contract value, at this
> point of project creation i do not have that information yet."

He is right, and the form is asking him to invent two numbers. The real
sequence is:

```
Budget (founder or PM)  ->  Quotation (marked up, to the client)
      names the job              negotiated, possibly several times
      picks the client                        |
      builds the cost sheet                   v
                                       accepted  ->  Invoice  ->  Receipt
                                          |                          |
                            Project.revenue = this total      against the invoice
```

`Project.budget` is what the job costs D1Z. `Project.revenue` is the total
contract value. Neither is knowable when the project is created, which is
exactly when the form demands both.

## A detail that shows the answer was already half-known

The server requires `budget` and `revenue` — **except when a production
manager is proposing a project** (`proposing` skips both, `projects/route.ts`
around line 372). The exemption exists. It was simply never extended to the
founder, who is the person with least reason to know the figures at that
moment.

## Why this cannot be one edit

Both columns are read in **twelve** places: `projects`, `crm`, `dashboard`,
`procurement`, `finance`, `marketing` and `ai/monthly-report` routes, plus
`financial.tsx`, `crm-sales.tsx`, `procurement.tsx`, `growth-dashboard.tsx`
and `projects-events.tsx`.

Delete the inputs without deriving the values first and every one of those
reads zero — the founder's finance module, dashboard and margin all go blank
at once. So the columns stay; only their **source** changes. No reader is
touched.

## Decisions taken

- **Entry point:** New Budget. The founder names the job, picks the client,
  and lands on the cost sheet. The project is created behind it. He never sees
  a blank project form asking for figures he does not have.
- **Contract value:** the **accepted quotation's total**, re-stamped if a
  revised quotation is later accepted. This matches how he actually works —
  Triple Helix has already been renegotiated from N12,117,400 to N9,384,105
  mid-conversation.
- **Project cost:** the sum of the cost sheet, `SUM(quantity x days x
  unitPrice)` over `ProjectService`. That is `lineTotal`, which already owns
  this arithmetic; it must not be re-derived.

## Order of work — this order and no other

1. **Derive `Project.budget` from the cost sheet** and keep writing it to the
   column, so all twelve readers keep working unchanged. Recompute whenever a
   cost line is added, edited or removed.
2. **Backfill** the five existing production projects so nothing reads zero
   during the transition.
3. **Acceptance write-back:** accepting a quotation stamps its total onto
   `Project.revenue`. Until this exists, step 4 would leave revenue at zero
   forever.
4. **Remove the two inputs** from New Project and drop the server-side
   requirement, matching what a proposing PM already gets.
5. **New Budget entry point:** creates project + client and opens the cost
   sheet.

Steps 4 and 5 must come last. Doing 4 before 3 replaces a wrong number with a
zero, which is worse: a wrong number is visibly wrong, a zero looks like a
project with no value.

## A consequence the founder should expect

Once revenue is earned rather than typed, a project with no accepted quotation
reports **zero** contract value instead of an estimate. That is more truthful,
but the finance module will read lower until quotations are accepted. Four of
the five current projects have no quotation at all.

This is the right trade — a typed guess that nothing ever corrects is how a
margin figure becomes fiction — but it is a visible change, not a silent one.

## Rules that still bind

- A rate of `0` is a real complimentary price; `null` is unpriced. Never
  collapse them.
- A line's amount is always `quantity x days x unitPrice`.
- `Project.budget` and `Project.revenue` are money: founder-only, stripped
  server-side for every other role, absent from the payload rather than null.
- Any write that depends on a value read first is a compare-and-set.
