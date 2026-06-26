# Task P3-C — Client Portal

**Agent:** Client Portal Builder (Phase 3)
**Task ID:** P3-C
**Parent task:** Build a complete client-facing portal (no DOZ OS login) where clients can view projects, approve deliverables, and confirm invoice payments via `/?portal=TOKEN`.

## What was built

1. **API route** — `src/app/api/doz/portal/route.ts` (~330 lines)
   - **GET** `/api/doz/portal?token=TOKEN` — finds the Account by `portalToken` where `portalActive = true`. Returns ONLY client-facing data (no internal costs, profit, expenses, team info):
     - `account: { name, industry, isStrategic }`
     - `projects[]` with `deliverables[]` (only client-facing fields: title, type, status, dueDate, clientApproved, clientApprovedAt, clientApprovalNote, clientRejectedAt, deliveredAt)
     - `invoices[]` with computed `balance = amount - amountPaid`, project name, and nested `paymentConfirmations[]`
     - `paymentConfirmations[]` — flat list of all confirmations for the account
     - Returns `404 { error: "invalid_token" }` if token is missing, inactive, or wrong.
   - **POST** `/api/doz/portal` — body `{ token, action, ...payload }`. Always validates the token first (returns `401 invalid_token` if invalid):
     - `approve_deliverable` `{ deliverableId, note? }` — sets `clientApproved=true`, `clientApprovedAt=now`, `clientApprovalNote=note`, clears `clientRejectedAt`. If status was `REVIEW`, also bumps it to `DELIVERED`. Ownership enforced: deliverable's project.accountId must equal account.id, else `403 not_authorized`.
     - `reject_deliverable` `{ deliverableId, note }` — note is required (else `400 note_required_for_rejection`). Sets `clientApproved=false`, `clientRejectedAt=now`, `clientApprovalNote=note`. Same ownership check.
     - `confirm_payment` `{ invoiceId, amount, method, reference?, note? }` — validates `amount > 0` and `method ∈ {BANK_TRANSFER, CHEQUE, CASH, CARD}`. Creates a `PaymentConfirmation` with `status="PENDING"`. Does **NOT** change invoice.status or invoice.amountPaid — the founder verifies first. Ownership enforced: invoice must belong to the account (via `accountId` or `project.accountId`), else `403 not_authorized`.
   - All `select` clauses deliberately exclude internal fields (budget, revenue, managerId, expenses, vendor info, etc.) — only client-facing data ever leaves the server.

2. **UI component** — `src/components/modules/client-portal.tsx` (~1200 lines, OVERWROTE the stub)
   - **Light theme** wrapper: `bg-zinc-50 text-zinc-900 min-h-screen` (overrides the dark DOZ OS theme).
   - **Branded header**: "10" emerald logo badge + "Digit One Zero Ltd" wordmark + "Client Portal" pill. "Welcome, [Account Name]" + subtitle. Industry + strategic-partner chips. "Exit portal" link back to `/` (removes `?portal` param).
   - **Quick-stat strip**: Active projects · Awaiting your approval · Open invoices · Pending confirmations.
   - **Tabs**: Projects (default) | Invoices | Payment Confirmations.
   - **Projects tab**: grid `sm:grid-cols-2 gap-4`. Each card has mono code, name, color-coded status badge, service-type/event-date/venue chips, emerald progress bar, and a deliverables list. Each deliverable row: type icon, title, due date, status badge. If `(status === REVIEW || status === DELIVERED) && !clientApproved` → shows emerald **Approve** + amber **Request Changes** buttons. Approved → green "Approved on [date]" callout. Rejected → amber "Changes requested on [date]" + note. Approve calls POST → toast → refresh. Request Changes opens a Dialog with a required Textarea note.
   - **Invoices tab**: stacked cards. Code, project name, status badge (color-coded: PAID=emerald, PARTIAL=amber, OVERDUE=red, SENT=blue), issued/due dates (due in red if overdue). Amount / Paid / Balance strip (balance in amber if >0). If balance > 0 → "Confirm Payment" button opens a Dialog form: Amount (number, default=balance), Method (Select: BANK_TRANSFER/CHEQUE/CASH/CARD), Reference (text), Note (textarea). Submit → POST confirm_payment → toast "Payment confirmation submitted — we'll verify and update your invoice." → refresh. Existing payment confirmations for the invoice are listed below with status badges.
   - **Payment Confirmations tab**: emerald info banner explaining verification. Desktop table + mobile list of all account confirmations (Invoice code, Amount formatNGN, Method, Reference, Submitted relativeTime, Status badge PENDING=amber / VERIFIED=emerald / REJECTED=red).
   - **Error state**: clean centered screen with red AlertCircle, "This portal link is no longer valid. Please contact your Digit One Zero project lead for access." + "Return to homepage" button.
   - **Loading state**: centered "10" emerald logo (pulsing) + Loader2 spinner + "Loading your portal…".
   - Footer: secure-portal note + © Digit One Zero Ltd.
   - Mobile-first responsive throughout. Used `formatNGN`, `formatDate`, `relativeTime` from `@/lib/format`. Used sonner `toast`. Used lucide-react icons: CheckCircle2, Clock, FileText, CreditCard, Building2, Calendar, MapPin, ArrowLeft, Send, Loader2, ShieldCheck, AlertCircle, Video, Camera, Radio, FileCheck, XCircle, Star, Inbox.

## Lint rule compliance note

The Next.js 16 `react-hooks/set-state-in-effect` rule is strict — even calling `load()` (a `useCallback` that internally calls `setState`) directly inside `useEffect` triggers the rule. Following the pattern in `command-center.tsx`, I used an inline async IIFE inside `useEffect` with `let alive = true;` for cancellation, plus a separate `refresh` useCallback for post-mutation refreshes. Initial `loading=true` state ensures the skeleton shows until the IIFE flips it to false.

## Files

- **NEW**: `src/app/api/doz/portal/route.ts` (~330 lines)
- **OVERWRITTEN**: `src/components/modules/client-portal.tsx` (was a 5-line stub, now ~1200 lines)

## Testing (all via curl against port 3000)

- **GET valid token**: `curl /api/doz/portal?token=lcc-portal-2025` → 200. Returns account (Lagos Chamber of Commerce, Association, non-strategic), 1 project (EVT-2025-014, COMPLETED, 100%) with 2 approved deliverables, 2 invoices (INV-2025-061 OVERDUE balance ₦4.5M with 1 PENDING confirmation; INV-2025-060 PAID balance 0), 1 top-level payment confirmation.
- **GET invalid token**: `curl /api/doz/portal?token=invalid` → `404 {"error":"invalid_token"}`.
- **GET all 5 portal tokens**: GTBank (1 project, 0 invoices, Banking, strategic), MTN (1 project, 1 invoice, Telecoms, strategic), LCC (1 project, 2 invoices, Association, non-strategic), Dangote (1 project, 0 invoices, Manufacturing, strategic), Shell (1 project, 1 invoice, Oil & Gas, strategic). All return correct client-facing data only — no internal costs/profit/team data exposed.
- **POST confirm_payment (valid)**: `POST {token:"lcc-portal-2025", action:"confirm_payment", invoiceId:"<LCC INV-2025-061 id>", amount:4500000, method:"BANK_TRANSFER", reference:"TEST123"}` → `201 {confirmation:{...status:"PENDING"}}`. Verified invoice status remains OVERDUE, amountPaid remains 0 — founder verifies first. ✓
- **POST invalid token**: → `401 invalid_token`. ✓
- **POST invalid method**: → `400 invalid_method`. ✓
- **POST invalid amount (negative)**: → `400 invalid_amount`. ✓
- **POST unknown action**: → `400 unknown_action`. ✓
- **POST missing invoiceId**: → `400 missing_invoiceId`. ✓
- **POST approve_deliverable (valid)**: `POST {token:"lcc-portal-2025", action:"approve_deliverable", deliverableId:"<LCC photo gallery id>", note:"..."}` → `200 {deliverable:{...clientApproved:true, clientApprovedAt:"2026-...", clientApprovalNote:"..."}}`. ✓
- **POST approve_deliverable on a deliverable NOT owned by account** (Nollywood Title Sequence, project has no accountId, tried via LCC token): → `403 not_authorized`. Ownership enforced. ✓
- **POST reject_deliverable without note**: → `400 note_required_for_rejection`. ✓
- **POST reject_deliverable with note**: → `200 {deliverable:{...clientApproved:false, clientRejectedAt:"...", clientApprovalNote:"..."}}`. ✓
- **POST confirm_payment on invoice NOT owned by account** (MTN invoice via LCC token): → `403 not_authorized`. Ownership enforced. ✓
- **GET /?portal=lcc-portal-2025**: → `200` (portal page renders).
- **`bun run lint`**: EXIT 0, zero errors/warnings.
- Cleaned up test data (restored the 2 LCC deliverables to seeded state; deleted the 2 TEST123 payment confirmations I created during curl tests) so the demo DB is pristine.
- dev.log shows clean compilation, all expected status codes (200/201/400/401/403/404), no errors.

## Stage Summary

- Client Portal is fully implemented and verified end-to-end via curl. Clients can access via `/?portal=TOKEN` with no DOZ OS login.
- API strictly enforces token validity, ownership (deliverable's project must belong to the account; invoice must belong to the account), and input validation. No internal data (costs, profit, team, vendor info) ever leaves the server.
- Light, branded, mobile-first UI with the "10" emerald logo, "Digit One Zero Ltd" wordmark, "Welcome, [Account Name]" header, three tabs (Projects / Invoices / Payment Confirmations), Approve/Request Changes workflow for deliverables, Confirm Payment dialog with method/reference/note, and a clean invalid-token error screen.
- All 5 seeded portal tokens (gtb/mtn/lcc/dangote/shell) work correctly.
- Files: NEW `src/app/api/doz/portal/route.ts`, OVERWRITTEN `src/components/modules/client-portal.tsx`.
