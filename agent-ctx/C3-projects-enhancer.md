# Task C3 — Project Create Form + Enhanced Financial Display

**Agent:** Projects Enhancer (Phase 5)
**Task:** Add a Project Creation form + enhance project cards to prominently display earned / received / balance / cost financials.

## Work Log
- READ /home/z/my-project/worklog.md — confirmed conventions (db at @/lib/db, emerald/amber/rose palette, NO indigo/blue, shared primitives from @/components/doz/ui-primitives, sonner toast, formatNGN/formatDate helpers, API pattern at src/app/api/doz/<module>/route.ts). Reused the existing Projects module structure rather than rewriting it.
- READ prisma/schema.prisma — Project (name, code?, serviceType, status, accountId?, managerId?, eventDate?, venue?, budget, revenue, progress) and Invoice (projectId?, amount, amountPaid, status). confirmed Invoice.amountPaid is the source of truth for "received".
- READ src/app/api/doz/projects/route.ts (existing GET only) and src/components/modules/projects-events.tsx (~750 lines) — preserved all existing functionality and only ADDED/enhanced.

## Files Edited

### 1. src/app/api/doz/projects/route.ts (EDITED — added POST + enhanced GET)
- **GET (enhanced)** — kept the original Promise.all structure but added a 3rd query for invoices (select projectId + amountPaid). Built a `receivedByProject` Map (sum of amountPaid per project) alongside the existing expensesByProject Map. Each decorated project now includes:
  - `received` (sum of invoice.amountPaid)
  - `balance` (Math.max(0, revenue - received))
- Stats block now also includes `totalReceived` and `totalBalance`.
- **POST (NEW)** — full handler with:
  - Strict validation: required name (non-empty string), serviceType (must be in 12-item VALID_SERVICE_TYPES list), budget (non-negative number), revenue (non-negative number).
  - Optional fields: status (validated against VALID_STATUSES, defaults to PLANNING), eventDate (parsed as Date, 400 on invalid), venue (string), accountId (validated against db.account → 404 if missing), managerId (validated against db.user → 404 if missing).
  - Auto-generated project code: `<PREFIX>-<YEAR>-<NNN>` where PREFIX is derived from serviceType (EVT for events, VID for video, CONF for conference, etc.) and NNN = (current project count + 1) padded to 3 digits. Used when `code` is not provided in the body.
  - Returns 201 with `{ project: {...} }` including account/manager names and computed received=0, balance=revenue, expensesTotal=0, profit, margin (since it's brand new).
  - 400 on validation errors with helpful messages; 404 on missing account/manager; 500 catch-all.

### 2. src/components/modules/projects-events.tsx (EDITED — 4 enhancements)
- **Imports** — added useCallback, useMemo; lucide Plus, Loader2, ArrowDownCircle, ArrowUpCircle; shadcn Button, Input, Label, Select*; DialogFooter; sonner toast.
- **Types** — extended `Project` interface with `received: number; balance: number;`; extended `ProjectsData.stats` with `totalReceived: number; totalBalance: number;`; added `AccountOption` interface for the form's account dropdown.
- **Constants** — added `SERVICE_TYPES` (12 items, in sync with backend) and `CREATE_STATUSES` (PLANNING/CONFIRMED/IN_PROGRESS).
- **ProjectsEvents** — converted useEffect fetch to a `useCallback` `load()` function so the dialog can trigger a refresh after creating a project. Added `createOpen` state. Used `if (loading && !data)` to keep existing data on screen during refreshes (avoids the cascading-render lint rule `react-hooks/set-state-in-effect`).
- **KPI row** — expanded from 6 to 8 StatCards (xl:grid-cols-8): added "Received" (emerald/primary, ArrowDownCircle icon) and "Balance Owed" (amber if >0, ArrowUpCircle icon) between Revenue and Profit. Total Projects, Active, Revenue, Received, Balance Owed, Profit, Avg Margin, Completed.
- **SectionHeader action** — added `<NewProjectButton>` (Plus icon, primary, size sm) that opens the dialog.
- **NewProjectDialog (NEW component, ~340 lines)**:
  - Controlled Dialog (open + onOpenChange props), max-w-2xl, scrollable body.
  - Fetches accounts from `/api/doz/crm` when dialog opens (cancelled-flag guard) — populates Client/Account Select with account names (star prefix for strategic).
  - Form fields: Project Name (Input, required, autofocus), Service Type (Select, required, 12 options), Status (Select, default PLANNING, 3 options), Client/Account (Select, optional), Event Date (Input type="date"), Venue (Input), Project Cost (Budget) (Input type=number, required, helper "What will this project cost us to deliver?"), Total Contract Value (Input type=number, required, helper "Total amount the client will pay").
  - Live profit calculation card showing: projected profit (₦X), margin % (if revenue > 0), and breakdown "Contract ₦X − Cost ₦Y". Color-coded emerald (positive) or rose (negative).
  - Submit button disabled until name + serviceType + budget + revenue are valid. Spinner (Loader2 animate-spin) shown while submitting.
  - On submit: POST /api/doz/projects with the payload → toast.success on 201 ("Project created" + name + code) → close dialog → call onCreated() to refresh list. toast.error on failure with the server's error message.
  - Form fields reset when dialog closes.
- **ProjectCard (ENHANCED)** — replaced the old "Revenue / Budget" rows with a new 4-cell Financial Summary strip:
  - `grid grid-cols-4 gap-2` inside a bordered muted container.
  - Each cell has: tiny uppercase label (10px, muted, with mini icon) + value (text-sm font-semibold, compact NGN format).
  - **Earned** (primary, CircleDollarSign icon) = revenue
  - **Received** (emerald, ArrowDownCircle) = sum of invoice.amountPaid
  - **Balance** (amber if >0, emerald if 0, ArrowUpCircle) = revenue - received
  - **Cost** (muted, Wallet) = budget
  - Below the strip, a separate "Budget burn" card shows: MiniBar (expensesTotal / budget, amber if over 80% of revenue) + "Spent ₦X · Y% of budget" + a "Collected" progress MiniBar (received / revenue, emerald) + "X / Y · Z%" + "High burn" warning if applicable.
- **ProjectDialog (detail view) (ENHANCED)** — expanded the Quick facts grid from 4 cells (sm:grid-cols-4) to 6 cells (sm:grid-cols-3): Earned (Contract), Received, Balance Owed, Budget (Cost), Expenses, Profit/Margin. Each with appropriate color coding.

## Testing

### API tests (curl)
- `POST /api/doz/projects` with `{name, serviceType, budget, revenue}` → **HTTP 201**, returns `{project: {...}}` with auto-generated code `EVT-2026-008`, received=0, balance=revenue, profit=revenue, margin=100.
- `POST /api/doz/projects` with full body (name, serviceType, status=CONFIRMED, eventDate, venue, budget, revenue) → **HTTP 201**, code `VID-2026-010`, all fields preserved (eventDate parsed to ISO, venue saved, status=CONFIRMED).
- `POST` with real accountId (from /api/doz/crm) → **HTTP 201**, response includes `account: {name: "MTN Nigeria", isStrategic: true}`.
- `POST` missing name → **HTTP 400** `{"error":"Missing required field: name"}`.
- `POST` with invalid serviceType "FOO" → **HTTP 400** with full list of valid service types.
- `POST` missing budget → **HTTP 400** `{"error":"Missing or invalid required field: budget (must be a non-negative number)"}`.
- `POST` with invalid accountId "nonexistent_id" → **HTTP 404** `{"error":"Account not found for id=nonexistent_id"}`.
- `GET /api/doz/projects` → **HTTP 200**, response includes `stats.totalReceived` + `stats.totalBalance` and each project has `received` + `balance` fields. Verified real data:
  - Shell Past Event: earned ₦22M, received ₦22M, balance ₦0 (fully paid)
  - Lagos Chamber Annual Lecture: earned ₦4.5M, received ₦1.5M, balance ₦3M (partial)
  - MTN Brand Film + Livestream: earned ₦24M, received ₦8M, balance ₦16M (partial)
  - Total received from stats = ₦31.5M ✓ (sum of all invoice.amountPaid across projects)

### UI tests (agent-browser)
- Page renders HTTP 200, no console errors.
- Signed in as Adaeze (founder), clicked "Projects & Events" in sidebar:
  - SectionHeader now shows "New Project" button (Plus icon, primary).
  - KPI row shows 8 cards including Received (₦31.50M, collected) and Balance Owed (₦84.80M, outstanding, amber accent).
  - All 11 projects listed with the new Financial Summary strip (Earned/Received/Balance/Cost) visible on each card.
- Clicked "New Project" → dialog opens with all fields. Verified:
  - Service Type dropdown lists all 12 service types.
  - Status defaults to "Planning".
  - Client/Account dropdown lists real accounts (MTN Nigeria, etc.) with star prefix for strategic.
  - Filled name="Browser Test Project", serviceType="Video Production", budget=4,000,000, revenue=7,500,000.
  - Live calculation showed: "PROJECTED PROFIT (IF CLIENT PAYS IN FULL) ₦3,500,000 46.7% margin · Contract ₦7.50M − Cost ₦4.00M".
  - Clicked "Create Project" → toast success, dialog closed, list refreshed to show "All (12)" with "Browser Test Project" (code VID-2026-012) at the top.
  - New card's Financial Summary strip shows: Earned ₦7.50M, Received ₦0, Balance ₦7.50M, Cost ₦4.00M ✓.
- Verified MTN Brand Film + Livestream card shows: EARNED ₦24.00M, RECEIVED ₦8.00M, BALANCE ₦16.00M, COST ₦17.00M, Budget burn "Spent ₦1.16M · 7% of budget", Collected "₦8.00M / ₦24.00M · 33%" ✓.
- Screenshot saved to /home/z/my-project/agent-ctx/C3-projects-verify.png.

### Lint
- `bun run lint` → EXIT 0, zero errors, zero warnings.
- Fixed `react-hooks/set-state-in-effect` rule by removing synchronous `setLoading(true)` from `load()` callback (initial state is already true; refreshes keep existing data on screen).

## Stage Summary
- Project create form + enhanced financial display fully implemented and verified end-to-end.
- API: GET /api/doz/projects now returns `received` + `balance` per project (computed from invoices) and `totalReceived` + `totalBalance` in stats. POST /api/doz/projects creates a project with full validation, auto-generated code, and 201 response.
- UI: "New Project" button in SectionHeader opens a Dialog (max-w-2xl, scrollable) with all required fields + live profit calculation. ProjectCard now prominently displays a 4-cell Financial Summary strip (Earned/Received/Balance/Cost, color-coded emerald/amber/muted/primary) plus a budget-burn MiniBar and a collected-progress MiniBar. KPI row expanded to 8 cards.
- All existing functionality (tabs, project detail dialog, milestones, deliverables, crew, progress, etc.) preserved — only added to and enhanced.
- Color discipline: emerald primary, amber warning, rose danger — NO indigo/blue.
- Demo verified: founder can input a new project with cost + contract value and immediately see earned/received/balance/cost on every project card.
