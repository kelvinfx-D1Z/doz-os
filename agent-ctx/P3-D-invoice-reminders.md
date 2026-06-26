# P3-D — Invoice Reminders

**Task ID:** P3-D
**Agent:** Reminders Builder (Phase 3)
**Task:** Invoice Reminders system — detect overdue invoices, generate professional WhatsApp + Email reminder drafts, and surface pending payment confirmations for verification.

## What was built

### API — `src/app/api/doz/reminders/route.ts` (NEW, ~440 lines)
- **GET** returns `{ stats, overdueInvoices, upcomingInvoices, pendingConfirmations }`:
  - `stats`: `overdueCount`, `overdueAmount`, `remindersDueToday` (no reminder OR last reminder ≥3 days ago), `pendingConfirmations`, `pendingConfirmationAmount`.
  - `overdueInvoices`: each row includes `daysOverdue`, `reminderCount`, `lastReminderAt`, `account {name, isStrategic}`, `project {name}`, primary `contact {name, phone, email}` (decision-maker preferred), and pre-generated `whatsappDraft` + `emailDraft {subject, body}`.
  - `upcomingInvoices`: due within next 7 days, not overdue yet — with `daysUntilDue`.
  - `pendingConfirmations`: PENDING PaymentConfirmations with invoice + account data.
- **POST** with `{action, ...}`:
  - `mark_reminder_sent {invoiceId}` → `reminderCount += 1`, `lastReminderAt = now`, activity log. 400 missing_invoiceId, 404 invoice_not_found.
  - `verify_payment {confirmationId, subAction: "verify" | "reject"}` →
    - **verify**: atomic `$transaction` sets PaymentConfirmation.status = VERIFIED, then updates Invoice.amountPaid += confirmation.amount. If newBalance ≤ 0 → status=PAID + paidDate=now; else if amountPaid>0 → status=PARTIAL.
    - **reject**: sets status=REJECTED.
    - 400 missing_confirmationId/invalid_subAction, 404 confirmation_not_found, 409 already_processed.
- Auth gated via `getSessionUser()` → 401 when unauthenticated.
- Draft templates: WhatsApp is short + friendly (greeting by time-of-day, honorific-stripped first name, invoice/amount/due/bank/close). Email is formal (subject line + body with invoice details, bank details, professional sign-off as Adaeze Okonkwo, Founder & CEO).

### UI — `src/components/modules/financial.tsx` (EDITED, ~640 lines added)
- New imports: `Button`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, `toast` from sonner; lucide `AlertCircle, XCircle, Send, Copy, Clock, Mail, MessageCircle, Loader2, ChevronDown`; `relativeTime` from format.
- New `Reminders` TabsTrigger (with AlertCircle icon) appended after Budgets.
- New `<RemindersTab />` component renders 3 sections:
  1. **Top KPI row** — 4 StatCards: Overdue Invoices (count + ₦ amount sub, danger accent if any), Reminders Due Today (Send icon, 3-day cadence sub), Pending Confirmations (Banknote icon + ₦ amount sub, warning), Upcoming Due (7 days).
  2. **Overdue Invoices section** — list of `OverdueInvoiceCard` (sorted by daysOverdue desc server-side). Each card: invoice code + account name + strategic star + red "X DAYS OVERDUE" badge, balance in rose-200, project/issued/due/contact info, reminder history ("No reminders sent yet" or "Reminder N sent Xd ago"). Collapsible "View message drafts" button reveals:
     - **WhatsApp draft** card: green-tinted (`bg-emerald-500/5 border-emerald-500/20`), pre-formatted text in scrollable area, **Copy** button + **Mark as Sent** button (POST `mark_reminder_sent`, toast on success, Loader2 spinner while pending).
     - **Email draft** card: blue-tinted (`bg-blue-500/5 border-blue-500/20`) — the ONLY blue in the UI per spec — subject line + body in scrollable area, **Copy** button (copies `Subject: …\n\n` + body), same Mark as Sent button row.
  3. **Payment Confirmations section** — `PaymentConfirmationCard` for each pending confirmation. Amber-tinted card with invoice code, account, StatusBadge, "Claims to have paid ₦X" headline, method/reference/submitted grid, client note (if any), warning "Verify only after confirming the payment has been received in your bank account.", and **Reject** (rose) + **Verify Payment** (emerald) buttons. On verify: toast "Payment verified — invoice updated" with new invoice status; on reject: toast "Payment confirmation rejected".
  4. **Upcoming Invoices section** — compact table (Invoice / Account / Balance / Due Date / Days Left). Days Left cell uses amber badge when ≤3 days, muted otherwise.
- All toasts via sonner. All loading states use Loader2 spinners. All amounts via `formatNGN` (compact for StatCard subs).
- Color discipline: emerald primary, amber warning, rose danger — blue ONLY on the email draft card per spec.

## Files touched
- NEW: `src/app/api/doz/reminders/route.ts` (~440 lines)
- EDITED: `src/components/modules/financial.tsx` (added imports, new `Reminders` TabsTrigger, new `RemindersTab` + `OverdueInvoicesSection` + `OverdueInvoiceCard` + `PaymentConfirmationsSection` + `PaymentConfirmationCard` + `UpcomingInvoicesSection` components)
- EDITED: `.env` (added `NEXTAUTH_SECRET=doz-os-dev-secret-2025-stable-key-for-jwt-signing` — was missing, causing JWEDecryptionFailed on every authenticated API route after a server restart)

## Testing
- Auth flow: `csrf → callback/credentials (founder@digitonezero.com / doz2025) → session cookie` → 200 with user object.
- GET `/api/doz/reminders` (unauthenticated) → 401 `{error:"unauthorized"}`.
- GET `/api/doz/reminders` (authenticated) → 200 with `stats: {overdueCount:1, overdueAmount:4500000, remindersDueToday:1, pendingConfirmations:1, pendingConfirmationAmount:4500000}`, 1 overdue invoice (INV-2025-061, Lagos Chamber, ₦4.5M, 9 days overdue, contact Dr. Chinyere Alu), 1 upcoming (INV-2025-062, MTN, ₦4M balance, 4d left), 1 pending confirmation (₦4.5M bank transfer, ref GTB/LCC/0042/25).
- WhatsApp draft verified — opens with "Good evening, Chinyere," (honorific "Dr." stripped via `firstNameOf()`), includes invoice code + ₦4,500,000 amount + due date + GTBank details + Adaeze sign-off.
- Email draft verified — subject "Overdue Invoice INV-2025-061 — Digit One Zero Ltd (₦4,500,000)", body has Dear Dr. Chinyere Alu, invoice details, bank details, warm regards from Adaeze Okonkwo / Founder & CEO / Digit One Zero Ltd / Lagos, Nigeria.
- POST `mark_reminder_sent` (valid invoiceId) → 200, returns invoice with `reminderCount: 1`, `lastReminderAt` set. Activity log created.
- POST `mark_reminder_sent` (missing invoiceId) → 400 `{error:"missing_invoiceId"}`.
- POST `mark_reminder_sent` (bad invoiceId) → 404 `{error:"invoice_not_found"}`.
- POST unknown action → 400 `{error:"unknown_action", detail:"Action 'foobar' is not supported"}`.
- POST `verify_payment` reject (valid confirmationId) → 200, confirmation.status = REJECTED, activity log created.
- POST `verify_payment` invalid subAction → 400 `{error:"invalid_subAction", detail:"expected 'verify' or 'reject'"}`.
- POST `verify_payment` verify on already-processed confirmation → 409 `{error:"already_processed", detail:"Confirmation is already REJECTED"}`.
- POST `verify_payment` verify on fresh PENDING confirmation (test ₦2M partial) → 200, confirmation.status = VERIFIED, invoice.amountPaid = 2000000, invoice.status = PARTIAL, paidDate = null (correct — only set when fully paid). Then verified with full ₦4.5M → invoice.status = PAID, paidDate = now.
- Test data reset: cleared test confirmation + reset INV-2025-061 to OVERDUE/amountPaid=0/reminderCount=0 + reset original PENDING confirmation.
- `bun run lint` → EXIT 0, zero errors/warnings.
- GET `/` → 200, page compiles cleanly with new Reminders tab wired in.

## Stage Summary
- **Invoice Reminders** feature is fully implemented and verified end-to-end via authenticated curl. The founder can now see exactly which invoices are overdue, copy a professionally-worded WhatsApp or email reminder draft with one click, send it externally, and log that it was sent. When clients submit payment confirmations via the client portal, they appear in the same tab for one-click verify/reject — verification atomically updates the related invoice's amountPaid and status (PARTIAL/PAID) in a Prisma transaction.
- API: GET returns all the data + pre-generated drafts. POST supports `mark_reminder_sent` and `verify_payment` (with `subAction: verify | reject`) actions.
- UI: new "Reminders" tab in Financial module with 4 KPI cards, overdue invoice cards with collapsible WhatsApp (emerald-tinted) + Email (blue-tinted, only blue allowed) drafts, payment confirmation cards with Verify/Reject actions, and an upcoming-invoices table.
- Color discipline maintained: emerald primary, amber warning, rose danger — blue only on the email draft card per spec.
- All existing Financial module functionality (Overview, Project/Client/Service P&L, Invoices, Expenses, Budgets tabs) preserved.
- Work record saved to `/home/z/my-project/agent-ctx/P3-D-invoice-reminders.md`.
