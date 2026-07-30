# DOZ OS — Fitness-for-Purpose Audit

**Date:** 2026-07-29
**Question asked:** does this app actually help grow a profitable business, or does it
just run without errors?
**Business context:** video/event production, Abuja, energy-sector clients. ~99%
referral-driven. No permanent staff — per-project hires plus two interns. The founder
personally holds every client relationship.

Audited against the founder's own ten scaling principles. Every claim below is backed
by a file, a query, or a measurement — not an impression.

---

## Headline

The app is **structurally sound and functionally alive** — 15 modules, 51 API routes,
71 tables, real auth, real role permissions. Nothing is broken in the sense of
crashing.

But fitness for purpose is a different test, and against it there are three systemic
problems:

1. **Four modules are read-only shells.** They display data you have no way to enter.
2. **Two complete, working features are orphaned** — full database models and working
   APIs with *zero* UI reaching them.
3. **Three metrics the principles explicitly demand do not exist anywhere in the
   codebase.**

The pattern is consistent: the app is strong at *displaying* a business and weak at
*operating* one. That matters because a dashboard you cannot write to will always
show stale or seeded numbers, and a founder stops trusting it within a week.

## Measured interactivity by module

Writes = POST/PATCH/DELETE calls. A module with zero writes cannot change anything.

| Module | Lines | Writes | Verdict |
|---|---|---|---|
| projects-events | 3,494 | 12 | Healthy |
| team | 2,949 | 9 | Healthy |
| strategic-planning | 2,194 | 7 | Healthy |
| staff-hub | 1,009 | 10 | Healthy |
| procurement | 1,359 | 3 | Adequate |
| field-mode | 1,294 | 3 | Adequate |
| client-portal | 1,372 | 3 | Adequate |
| routines | 809 | 3 | Adequate |
| internship-program | 1,148 | 2 | Thin |
| command-center | 3,098 | 2 | Thin (mostly a dashboard, acceptable) |
| financial | 1,717 | 2 | **Thin — see Principle 4** |
| marketing-growth | 1,538 | 1 | **Thin — see Principle 7** |
| ai-chief-of-staff | 983 | 1 | Thin |
| **crm-sales** | 1,064 | **0** | **Read-only** (partially fixed 2026-07-29) |
| **sop-knowledge** | 646 | **0** | **Read-only — critical** |
| **growth-dashboard** | 781 | **0** | Read-only (0 onClick — zero interactivity) |
| calendar-view | 158 | 0 | Read-only |
| help-page | 298 | 0 | Static by design — fine |

API routes with **no write handler at all**: `sop`, `growth`, `finance`, `cashflow`.

---

## Principle-by-principle

### 1. Define a laser-focused niche — ❌ Absent

No concept of an ideal client profile, positioning, or niche anywhere. `Account.industry`
exists as a free-text field, so industry concentration is *computable* but nothing
computes it. A `Competitor` model and an `SEOGap` model exist but connect to no
positioning logic.

**Why it matters here:** the business is already effectively niched — energy-sector
communications — but the app doesn't know that, so it can't tell you when you're
drifting out of it, or which industry actually pays best.

**Cheapest fix:** a single "revenue by client industry" breakdown. The data exists.

### 2. Charge for value, not hours — ⚠️ Right instinct, feature orphaned

**Good:** there is no hourly billing anywhere in the codebase — `grep -ri "hourly"`
across `src/` returns **zero** files. Income is not modelled as time. `TimeEntry`
exists but for internal capacity, not client billing. That is the correct architecture.

**The problem:** `PricingTemplate` is a fully-formed value-based pricing model —
`baseCost` (internal), `basePrice` (client-facing), computed `margin`, and a
`lineItems` JSON array — with a **working POST endpoint** at
`src/app/api/doz/pricing/route.ts`.

**Nothing in the entire UI references it.** `grep -rn "pricing" src/components/ src/lib/`
returns nothing. The mechanism for premium, value-anchored, productized pricing exists
in the database and is completely unreachable.

This is the single highest-value orphan in the app.

### 3. Build systems and automate — ❌ Fails at the core

**`src/app/api/doz/sop/route.ts` has zero write handlers.** The SOP & Knowledge module
— the place where core processes get documented — is read-only. You cannot create,
edit, or delete a process in the process-documentation module.

For a founder whose stated goal is a business that runs without him, this is the most
consequential gap in the audit. Documented process is the mechanism by which delivery
stops depending on one person.

**Automation:** there is no scheduler, cron, or job runtime anywhere
(`grep -rlEi "cron|scheduler|setInterval|node-cron" src/` → nothing). A `reminders`
route and a `NotificationLog` model exist, but nothing triggers them. Every
"automated" behaviour in the app is a button someone has to press.

**Working well:** the `routines` module (3 writes) genuinely supports recurring
business rhythm, and `Routine`/`RoutineLog` are sound.

### 4. Master cash flow — ⚠️ Half-built

**Good:** profitability per project is real and correct. `src/app/api/doz/projects/route.ts`
computes revenue, expenses, profit and margin per project, and "Received" is derived
from `sum(Invoice.amountPaid)` — money actually collected, not billed. That is the
right basis and it is used consistently.

**Missing — cash reserves:** the principle says *"keep an absolute minimum of six months
of cash reserves."* The app has **no concept of runway**. `grep -ri "runway"` → zero
files. What exists instead is `cashPosition = totalReceived - totalSpent` in
`src/lib/didi-engine.ts:46`, an all-time figure, compared against a **hardcoded
₦5,000,000** at line 60. A magic number, not a reserves policy, and not expressed in
months of cover.

**Missing — writability:** `api/doz/cashflow` has **zero write handlers**, yet
`CashFlowForecast` is a well-designed model with probability-weighted inflows and
outflows and a `source` field distinguishing MANUAL from AUTO entries. You cannot add
a forecast entry. `api/doz/finance` likewise has zero write handlers.

**Cheapest high-value fix:** express cash as *months of cover* (cash ÷ average monthly
outflow) and make the threshold a setting rather than a constant.

### 5. Prioritise client retention — ❌ Largely unmeasured

`Account.lifetimeValue` exists. Beyond that: `retention` appears in 1 file, `churn` in
**0**, `upsell` in **0**. There is no repeat-purchase rate, no measure of revenue from
existing versus new clients, and no upsell tracking.

For a 99%-referral business this is a strange blind spot — existing clients are the
whole engine, and the app cannot tell you whether they are coming back.

### 6. Productize services — ⚠️ Taxonomy, not products

`ServiceCategory` / `ServiceItem` / `ProjectService` exist and `api/doz/services`
supports writes. But `ServiceItem` carries only `name`, `categoryId` and `isCustom` —
**no price, no scope, no boundaries**. It is a classification system, not a catalogue
of fixed-price offers.

The actual productization mechanism is `PricingTemplate` (see Principle 2) — which has
prices, margins and line items, and no UI.

So both halves of "package skills into fixed-price offers with clear scope" exist in
different tables, and neither is usable for the purpose.

### 7. Build a lead generation machine — ⚠️ Weakest where it matters most

`marketing-growth` is 1,538 lines with **one** write call. `Lead` has `source` and
`sourceDetail`, so attribution is possible. `MarketingCampaign` and
`ContentCalendarItem` are real.

But the CRM this feeds was, until today, entirely read-only — `crm-sales.tsx` made a
single GET and never wrote. As of 2026-07-29 a one-line capture and four write actions
(`create_lead`, `create_contact`, `create_contract`, `update_contract`) have been added,
which is the first time a lead could enter the system through the UI at all.

Given the founder's stated bottleneck is enquiry volume, this was the most important
thing in the app and it was non-functional.

### 8. Outsource and delegate early — ✅ Genuinely good

The strongest area. `FounderTimeLog`, the Founder Freedom Score, `staff-hub` (10 writes),
`internship-program`, `Task` assignment with per-user module permissions, and a
`DailyStandup` model. The delegation instinct is well built.

**Caveat:** it currently has nobody to delegate to — no permanent staff, per-project
hires, two interns. So this capability is ahead of the business, not behind it. Not a
defect; worth knowing before investing further here.

### 9. Secure referrals and testimonials — ⚠️ Second major orphan

`ClientFeedback` is excellent: `rating` (1–5), `satisfactionScore`, `whatWentWell`,
`whatCouldImprove`, `wouldRecommend`, `testimonial`, and `testimonialApproved`. The API
at `src/app/api/doz/feedback/route.ts` even implements an `approve_testimonial` action
(founder-only) and exposes an `approvedTestimonials` collection.

**No UI module renders any of it.** `grep -rln "feedback" src/components/modules/`
returns nothing. Clients can submit feedback through the portal; the founder has no
screen on which to read it, approve a testimonial, or use one.

The principle says *"showcase proof on your website."* The proof is being collected and
buried.

**Also missing:** no referral incentive mechanism. `Referral` records who referred what
and its value, but has no reward, payout, or programme concept — so "build a formal
referral incentive program" has no support.

### 10. Commit to extreme reliability — ❌ Not measured at all

The principle the founder's own quoted community wisdom calls *"the most underrated
skill"* — and the app does not measure it.

`grep -riE "onTime|on_time|on-time"` across `src/` → **zero files**.

Yet the data is already there: `Milestone` has `dueDate`, `completedAt`, and a `status`
that includes `OVERDUE`. `Deliverable` has `dueDate` and `deliveredAt`. An on-time
delivery rate is a single query away and nothing computes it.

**This is the cheapest high-value addition in the entire audit** — the data exists, the
metric is one aggregate, and it measures the thing that most differentiates a
dependable production company from a talented one.

---

## Ranked recommendations

Ordered by value-per-effort for this specific business.

| # | Action | Principle | Effort | Why |
|---|---|---|---|---|
| 1 | **On-time delivery rate** on Command Center | 10 | Low | Data already exists; measures the differentiator |
| 2 | **Wire `PricingTemplate` into proposals/projects** | 2, 6 | Medium | Full value-pricing model already built, zero UI |
| 3 | **Feedback + testimonial screen** | 9 | Medium | Proof already being collected and buried |
| 4 | **Cash runway in months** + configurable threshold | 4 | Low | Replaces a hardcoded ₦5M with a real reserves policy |
| 5 | **Make SOP module writable** | 3 | Medium | Can't build systems inside the systems module |
| 6 | **Repeat-client / retention rate** | 5 | Low | The referral engine is unmeasured |
| 7 | **Revenue by client industry** | 1 | Low | Confirms or challenges the energy-sector focus |
| 8 | **Cash-flow forecast writability** | 4 | Medium | Good model, no way to use it |

Deliberately **not** recommended: further investment in delegation tooling
(Principle 8) until there are permanent staff, and any new dashboard. The app does not
need more places to look at numbers; it needs more places to enter them.

## The honest summary

Nothing here is a bug. This is a well-architected app that was built outward from
dashboards rather than inward from daily use. Roughly 4,500 lines of module code
render data that cannot be created through the interface, and two of the most
commercially valuable features in the schema — value-based pricing and client
testimonials — are finished on the backend and invisible on the frontend.

The good news is that most of the gaps above are wiring rather than construction. The
models are largely right. What's missing is the last mile between a working API and a
screen the founder actually touches.
