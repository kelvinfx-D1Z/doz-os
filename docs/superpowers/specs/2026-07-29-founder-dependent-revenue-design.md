# DOZ OS — Contracted Revenue

**Date:** 2026-07-29
**Status:** Approved design
**Scope:** Replaces the CRM & Sales and Marketing & Growth modules

---

## 1. The problem

Digit One Zero is a founder-led production company in Abuja working mainly with
energy-sector clients. Roughly 99% of work arrives by referral.

The goal is not more revenue. It is a business that can be handed to the
founder's children — one that exists independently of him.

**The constraint is that the founder is the relationship.** Freelancers can
deliver the work; nobody else can win it. Clients want him in the room.

### Operating reality

- **No permanent staff.** Crew is hired per project.
- **Two interns.**
- Introducing a per-project freelancer into a client relationship is a real
  commercial risk — that freelancer can become a competitor with your client.

This rules out the standard remedy of putting a second person from the company
into each account. It is not available and, at this stage, not wise.

### What is available

1. **Contracts.** A signed recurring agreement between the client and the
   *company* is an asset regardless of headcount. Achievable solo.
2. **Client-side multi-threading.** Knowing three people at a client instead of
   one. Costs nothing, needs no staff, and protects the account when a contact
   changes job.
3. **Proof.** Case studies and published work, so demand begins arriving at the
   company name rather than the person. Delegable to interns.

Energy-sector clients suit recurring agreements: their communications need is
continuous (results, safety, CSR, community relations, internal comms,
conferences, site documentation), not project-shaped.

## 2. The organising metric

> **Contracted revenue — the percentage of revenue under a signed recurring
> agreement.**

It starts at zero, the founder can move it alone this quarter, and it directly
measures the conversion of personal goodwill into company property.

One supporting metric:

- **Accounts with 2+ known contacts** — client-side key-person risk.

### Metrics explicitly rejected

- **Founder-dependent revenue** (from an earlier draft). With no staff it would
  sit at 100% with no lever to move it. A metric that cannot move is
  demoralising, not informative. Revisit if permanent staff are hired.
- **Client meetings the founder did not attend.** Nothing in the schema records
  meetings; it would be a number with no data behind it.
- **Enquiries per month.** Measures how busy the founder will be, not whether
  the company could survive without him.
- **Weighted pipeline, probability-adjusted forecasting, conversion rate.**
  Enterprise-SaaS mechanics for working large pools of cold deals. Not this
  business.

## 3. Non-goals

- Referral-ask workflow (nurture dates, quotas, `log_nurture`). The founder
  does this naturally in conversation; tooling would be bureaucracy.
- Team-ownership modelling (`Account.ownerId`, `Contact.ownedById`). Assumes
  staff that do not exist.
- File storage or delivery for event-capture media. Files continue to move via
  WeTransfer/Drive/WhatsApp.
- Sales tooling for a second salesperson.

**No data is deleted.** The `ReferralSource` table is retained; only the UI
built on it is removed.

## 4. Data model changes

Additive only. Requires `prisma db push` against the production Supabase
database, run deliberately and separately from a code deploy.

| Change | Purpose |
|---|---|
| `Contract.projectId` → optional | **Blocker today.** It is required, so a contract cannot exist at account level and an annual retainer has nowhere to live. |
| `Contract.isRecurring` (Boolean) | Distinguishes a retainer from a one-off project contract |
| `Contract.renewalDate` (DateTime?) | Drives renewal reminders |
| `FollowUp.leadId` → `Lead?` (+ index) | So a one-line capture can carry a reminder |
| `Lead.direction` ("INBOUND"/"OUTBOUND") | Distinguishes an enquiry from a target |
| `Lead.accountId` → `Account?` | Links a target contact to a company |

### Deriving the metrics

**Contracted revenue %** = revenue attributable to accounts with an active
recurring contract ÷ total revenue, where revenue is `sum(Invoice.amountPaid)`
per account — consistent with how "Received" is computed elsewhere.

**Accounts with 2+ contacts** = accounts having two or more `Contact` rows.

### One reminder system

`FollowUp` becomes the single reminder mechanism across leads, contacts and
opportunities. A separate `nextAction` field on `Lead` was rejected: the app
already suffers from `Referral` and `ReferralSource` being two disconnected
systems for one concept, and this would repeat that mistake.

## 5. Screens

### 5.1 Accounts (replaces CRM & Sales)

An asset register, not a pipeline. Each account shows:

- Its contacts, and a warning when only one is known
- Contract status and renewal date, or its absence
- When it was last contacted
- Lifetime value

The implied work is visible on its face: get a second contact in, get it under
contract.

Retained tabs: **Accounts**, **Deals** (opportunities with value and stage, no
probability weighting), **Proposals** — all finally writable.

**Critical prerequisite:** the current CRM page makes exactly one network call,
`GET /api/doz/crm`, and never writes. The only interactive element in 945 lines
is "copy portal link". Meanwhile `/api/doz/crm/create` already supports
`create_account`, `create_opportunity`, `create_proposal`, `create_followup`,
`create_referral` and the deletes. The backend exists; the UI was never wired
to it. Until it is, every screen above it reports on seed data.

### 5.2 Proof (replaces Marketing & Growth)

Publishing serves credibility, not lead volume. Its job is to let a comms
director who has never met the founder justify choosing the company. This is
the intern-delegable half of the system.

- **Case studies** built from delivered projects — footage and results already
  exist as a by-product of delivery
- **Published/unpublished gap** — reads completed projects and surfaces work
  shot but never posted
- **Event capture** (below)

Removed: the `ReferralSource` nurture UI, referral-dependency gauge, and 10 of
the 12 KPI cards.

### 5.3 Event capture

The founder's existing, proven motion for opening energy accounts: shoot people
at an event, collect contact details, send the material free, follow up. Value
first, ask later — the right opener for a retainer conversation.

A **"Met someone"** action, prominent on Proof and in Field Mode. One mobile
screen: name (only required field), company, role, contact, event, what was
shot.

On save:
- Creates a `Lead` with `source = EVENT_CAPTURE`, `direction = OUTBOUND`,
  `sourceDetail` = event name
- Auto-creates two follow-ups: "Send the material" (+2 days) and "Follow up"
  (+9 days)
- DIDI drafts both messages via the existing Gemini integration; editable,
  copied to clipboard, sent by the founder through his own channels

## 6. Capture must be trivially fast

Every screen depends on the founder logging things. A one-line input, saved on
Enter, no required fields beyond a name. If capture takes longer than about ten
seconds it will not happen at 9pm, and every metric built on it will be false.

## 7. Phasing

Each phase is independently useful; work can stop after any of them.

1. **Make it writable and tell the truth.** Wire the CRM UI to its existing
   create API. Account-level recurring contracts. Show contracted revenue % and
   single-contact warnings.
2. **Proof.** Case studies and the published/unpublished gap — the intern-run
   half.
3. **Event capture + DIDI drafting.**

**Phase 1 is the unit to plan next.** Phases 2–3 get their own plans once phase
1 is in use and has shown whether the capture habit holds.

## 8. Risks

- **The app is not the work.** It can show that an account is uncontracted and
  single-threaded. It cannot have the retainer conversation or write the case
  study. If the app becomes where the founder goes *instead* of doing those
  things, it is an expensive distraction. This is the largest risk here.
- **Capture habit.** If enquiries and contacts are not logged, phases 2–3 are
  decoration. Phase 1 is deliberately small so it serves as an honest test.
- **Ceiling without staff.** Contracts and proof make the business more
  valuable and more resilient, but full transferability eventually requires
  someone other than the founder. That hire should be funded by retainer
  revenue rather than preceding it — which is why this design deliberately does
  not model a team yet.
- **Production migration.** Schema changes touch the live database shared with
  https://doz-os.vercel.app.
