# Task CRM-ENHANCE — CRM Create Forms + External Source Links

## Agent: code (CRM Enhancer)
## Task ID: CRM-ENHANCE

## Summary
Extended the CRM & Sales module with:
1. New `POST /api/doz/crm/create` endpoint supporting 5 actions (create_account, create_opportunity, create_proposal, create_followup, create_referral) — all auth-gated via `getSessionUser()`.
2. "New" buttons + dialog forms on each of the 5 tabs (Pipeline / Accounts / Proposals / Follow-ups / Refosals) that POST to the new endpoint, show a toast, and refresh the list.
3. External source-link icon on every opportunity (Pipeline board cards + open-opportunities table) — opens source URL in a new tab based on the opportunity's `source` field.

## Files Touched
- **NEW** `src/app/api/doz/crm/create/route.ts` — POST endpoint with 5-action dispatch (345 lines).
- **EDITED** `src/app/api/doz/crm/route.ts` — added `website` to shaped accounts + opportunity.account (so EXISTING_CLIENT source links work client-side).
- **EDITED** `src/components/modules/crm-sales.tsx` — added New buttons, 5 dialog form components, external source-link helper + button. (945 → 1921 lines.)

## API Design (`POST /api/doz/crm/create`)
Body: `{ action, ...payload }` → dispatches to one of 5 handlers:

| action             | required fields                          | optional fields                                  | returns |
|--------------------|------------------------------------------|--------------------------------------------------|---------|
| create_account     | name                                     | industry, website, isStrategic                   | account |
| create_opportunity | name, value                              | accountId, stage (default DISCOVERY), serviceType, expectedClose, source | opportunity (+ include account) |
| create_proposal    | opportunityId, title, amount             | validUntil                                       | proposal (+ include opportunity.account) |
| create_followup    | subject, dueDate                         | opportunityId, contactId, type (default CALL), notes | followUp (+ include contact + opportunity.account) |
| create_referral    | referrerName                             | fromAccountId, toAccountId, value, note          | referral (+ include accounts + referrer) |

**Auth**: every request calls `getSessionUser()`. No session → 401.

**Validation**:
- Required fields validated server-side → 400 with descriptive error.
- Numeric fields parsed from string or number; rejected if NaN/negative.
- Optional relation IDs (accountId, opportunityId, contactId, fromAccountId, toAccountId) verified against DB → 404 if missing.
- Probability auto-set from stage (DISCOVERY=20, QUALIFIED=40, PROPOSAL=60, NEGOTIATION=80, WON=100) since UI form doesn't collect it.

**Defaults**: stage → DISCOVERY, source → REFERRAL, type → CALL, proposal status → DRAFT, completed → false.

All returns are HTTP 201 with `{ ok: true, <record> }`.

## UI Changes

### 1. New buttons + dialogs (one per tab)
Each is a self-contained component with local form state, submitting flag, and `onCreated` callback that triggers `refetch()` in the parent.

- **Pipeline tab** — "New Opportunity" button on both Pipeline Board header + Open Opportunities card header. Form: name*, account (select existing or leave blank), value*, stage (default DISCOVERY), service type, expected close date, source (default REFERRAL).
- **Accounts tab** — "New Account" button on Accounts card header. Form: name*, industry, website, isStrategic (Switch).
- **Proposals tab** — "New Proposal" button on Proposals card header. Form: opportunity (select)*, title*, amount*, valid until date.
- **Follow-ups tab** — "New Follow-up" button on a new "Follow-ups" SectionHeader card at top. Form: type (CALL/EMAIL/MEETING/WHATSAPP), due date*, subject*, related opportunity (select), related contact (select), notes (Textarea).
- **Referrals tab** — "New Referral" button on Referrals card header. Form: referrer name*, from account (select), to account (select), value, note (Textarea).

All dialogs use shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger`. Forms use `Input`, `Label`, `Select`, `Textarea`, `Switch`. Buttons use `Button size="sm"` with `Plus` icon. All feedback via `toast` from sonner.

### 2. External source-link button (ExternalSourceButton component)
Helper `opportunitySourceUrl(opp)` computes a URL client-side based on the opportunity's `source`:

| source          | URL                                                                          |
|-----------------|------------------------------------------------------------------------------|
| REFERRAL        | `mailto:?subject=Follow-up on referral: {oppName}` (mailto: link — opens email composer) |
| NETWORKING      | `https://www.linkedin.com/search/results/all/?keywords={oppName}`           |
| EXISTING_CLIENT | account.website if set (auto-prepends `https://`); else Google search for account name |
| SOCIAL          | `https://www.linkedin.com/search/results/all/?keywords={oppName}`           |
| COLD            | `https://www.google.com/search?q={accountName}`                             |

The `ExternalSourceButton` is a small 24×24 px `<a>` with `target="_blank" rel="noopener noreferrer"` (except for `mailto:` links), `ExternalLink` icon (lucide, h-3.5), `sr-only` label for a11y, and `stopPropagation` so it doesn't trigger any parent onClick. Renders only when `opportunitySourceUrl` returns a non-null URL.

Placement:
- **Pipeline board**: every opportunity card has the external-link icon in the top-right corner (next to the strategic star).
- **Open opportunities table**: new rightmost column with the icon.

### 3. Color discipline
Emerald primary (default `Button`), amber warning (strategic star, expired proposals), rose danger (overdue follow-ups). No indigo/blue. New buttons use the default primary color (emerald in this theme).

## Data Flow
- The main `CrmSales` component owns the data fetch.
- A new `refreshKey` state + `refetch = () => setRefreshKey(k => k+1)` triggers re-fetch via the `useEffect` dependency array.
- Every dialog receives `onCreated={refetch}` so a successful create re-fetches the list, immediately showing the new record in its tab.

## Testing

### API tests (via curl with auth cookie)
Authenticated as `founder@digitonezero.com` (seeded user, password `doz2025`) via NextAuth credentials flow.

| Test | Body | Result |
|------|------|--------|
| No auth | `{action: create_account, name: X}` | **401 Unauthorized** ✓ |
| create_account | `{name, industry, website, isStrategic:true}` | **201**, returns account with all fields ✓ |
| create_opportunity | `{name, accountId, value:7.5M, stage:DISCOVERY, serviceType:VIDEO_PRODUCTION, source:COLD}` | **201**, returns opp with `probability:20` (auto-set from stage), nested `account` ✓ |
| create_proposal | `{opportunityId, title, amount:6.8M, validUntil:2025-12-31}` | **201**, status=DRAFT, nested opportunity.account ✓ |
| create_followup | `{opportunityId, type:CALL, subject, dueDate, notes}` | **201**, completed:false, nested opportunity.account ✓ |
| create_referral | `{referrerName, fromAccountId, value:2M, note}` | **201**, nested fromAccount ✓ |
| Unknown action | `{action: bogus}` | **400 Unknown action: bogus** ✓ |
| Missing required field | `{action: create_opportunity, name:"", value:100}` | **400 name is required** ✓ |
| GET /api/doz/crm | — | **200**, returns website field on accounts + opportunity.account ✓ |

All 5 happy-path cases returned HTTP 201 with the created record. Both negative cases returned HTTP 400 with descriptive errors. No errors in dev.log.

### Lint
`bun run lint` — **EXIT=0** (zero errors/warnings across the whole project, including crm-sales.tsx, crm/route.ts, crm/create/route.ts).

### Dev server log
No errors. Notable successful requests:
```
POST /api/doz/crm/create 401 in 218ms   (no auth)
POST /api/doz/crm/create 201 in 35ms    (create_account)
POST /api/doz/crm/create 201 in 17ms    (create_opportunity)
POST /api/doz/crm/create 201 in 14ms    (create_proposal)
POST /api/doz/crm/create 201 in 16ms    (create_followup)
POST /api/doz/crm/create 201 in 15ms    (create_referral)
POST /api/doz/crm/create 400 in 9ms     (unknown action)
POST /api/doz/crm/create 400 in 10ms    (missing field)
GET  /api/doz/crm 200 in 77ms           (still works with new website field)
GET  / 200 in 536ms                     (page renders cleanly)
```

## Notes
- The seeded accounts (MTN, GTBank, Shell, Dangote, Access) don't have `website` values populated — for the EXISTING_CLIENT source link, those will fall back to Google search for the account name. To see the website link work, create a new account with a website, then create an EXISTING_CLIENT opportunity linked to it.
- A few realistic test records were created during verification (Acme Test Co account, Acme Brand Film Q1 opportunity with COLD source, Brand Film — Phase 1 proposal, Intro call follow-up, Tunde Bakare referral). These serve as live demo of the new create buttons + external link (COLD → Google search for "Acme Test Co").
- The `Select` component renders the first SelectItem only when opened; an empty `SelectValue placeholder` shows when no value is selected. New Opportunity form lets you skip the account (creates opp with accountId=null).
