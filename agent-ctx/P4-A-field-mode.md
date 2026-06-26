# Task P4-A — Field Mode Builder

## Task
Build the Field Mode module (Phase 4) for DOZ OS — mobile-first on-site experience for interns/freelancers:
1. Quick daily report filing (≤30s)
2. Offline-capable event run-sheet (localStorage persistence + auto-sync when online)

## Files
- `src/app/api/doz/field/route.ts` (NEW) — GET (current user's tasks/projects/today's report/crew assignments) + POST (submit_report | toggle_milestone)
- `src/components/modules/field-mode.tsx` (OVERWROTE 1-line stub) — full "use client" component, `export function FieldMode()`

## Work Log
- READ worklog.md — confirmed Phase 2 auth setup (NextAuth Credentials provider, `getSessionUser()` from `@/lib/auth`, `useCurrentUser()` hook from `@/hooks/use-current-user`, demo password `doz2025` for all accounts). Reused shared primitives (StatCard/MiniBar/EmptyState), format helpers (formatDate/relativeTime), and patterns established in prior module builders (cancelled-flag useEffect, Promise.all batching, JS-side aggregation, emerald/amber/rose palette — NO indigo/blue).
- READ prisma schema — confirmed:
  - `DailyReport` (userId, reportDate, tasksDone newline-sep, tasksPlanned, blockers, hoursWorked, mood GREAT/OK/STRESSED)
  - `Milestone` (projectId, title, dueDate, status PENDING/IN_PROGRESS/DONE/OVERDUE, completedAt)
  - `CrewAssignment` (projectId, userId, role PRODUCTION_MANAGER/CAMERA_OP/SOUND_ENG/etc, status ASSIGNED/CONFIRMED/DECLINED, dayRate)
  - `Project` (managerId, eventDate, venue, serviceType, status PLANNING/CONFIRMED/IN_PROGRESS/COMPLETED/ON_HOLD/CANCELLED)
  - `Task` (assigneeId, status, priority, dueDate, project relation)

### API route — `src/app/api/doz/field/route.ts`
- **GET**: requires `getSessionUser()` — returns 401 if not authed. Single `Promise.all` of 4 Prisma queries: tasks assigned to user (not DONE, include project name), crewAssignments (include project + milestones), projects where user is manager (include milestones), today's report. Shapes response per spec:
  - `user: {id, name, role, title}`
  - `myTasks: [{id, title, status, priority, dueDate, project:{name}|null}]`
  - `myProjects`: dedupes via Map (user can be both crew AND manager on same project — crew role wins). Only includes "active" projects (PLANNING/CONFIRMED/IN_PROGRESS/ON_HOLD). Each carries `{id, name, code, eventDate, venue, serviceType, status, role, milestones:[{id,title,dueDate,status,completedAt}]}`. Sorted by upcoming eventDate asc.
  - `todayReport: {id,tasksDone,tasksPlanned,blockers,hoursWorked,mood,reportDate} | null` — uses `startOfToday()` (local midnight) as the reportDate lookup key.
  - `crewAssignments: [{id, projectName, role, status, dayRate}]`
- **POST**: requires `getSessionUser()` — returns 401 if not authed. Accepts JSON body with `action` field:
  - `submit_report`: validates tasksDone (non-empty), mood (GREAT|OK|STRESSED if provided). Uses `$transaction`: looks up existing report for today (same user, same local-day reportDate), if exists → UPDATE, else → CREATE. Returns `{ok:true, report:{...}}`. Prevents duplicate daily reports.
  - `toggle_milestone`: validates milestoneId + done (boolean). Uses `$transaction`: fetches milestone, then verifies user is crew OR manager on the milestone's project (else 403 `not_authorized_for_milestone`). Sets status to DONE/PENDING and completedAt to `new Date()` when marking DONE (null when reverting). Returns `{ok:true, milestone:{...}}`. Returns 404 `milestone_not_found` if id invalid.
  - Unknown action → 400. Invalid JSON → 400.
  - All errors wrapped in try/catch with structured JSON `{error, detail?}`. Console.error logs server-side.

### UI component — `src/components/modules/field-mode.tsx`
- "use client", `export function FieldMode()`. Mobile-first: `max-w-md mx-auto`, large touch targets (min-h-12 buttons, min-h-16 mood buttons), generous spacing.
- **State machine**: `view: "home" | "report" | "projects" | "runsheet"`. `selectedProject` for runsheet. `online: boolean` for offline indicator.
- **Data fetch**: useEffect on `useCurrentUser()` status — calls `reload()` only when authenticated. Cancelled-flag guard pattern.
- **Online/offline detection**: `navigator.onLine` initial state + `online`/`offline` window event listeners. Toasts on transitions: "Back online — syncing queued updates" / "You're offline — changes saved locally".
- **Header**: Smartphone icon in emerald tile, "Field Mode" title, "On-site tools for fast reporting & event execution" subtitle. Below it: user banner (avatar initials, name, title/role) + OnlineBadge (Wifi emerald / WifiOff amber).
- **HomeView**: 
  - Quick stats strip (3 mini-cards): Projects count, Tasks count, Report filed status.
  - "File Daily Report" big card (Clock icon, emerald tile, "Submitted ✓" badge if already filed, ChevronRight).
  - "Event Run-Sheet" big card (ClipboardCheck icon, amber tile, "X active events · works offline", ChevronRight).
  - Open tasks preview list (max-h-72 scroll-thin) — shows up to 8 tasks with Circle icon, title, project name, relativeTime due.
- **ReportView**:
  - If existing todayReport: emerald-tinted banner "You already filed today's report" + last filed summary.
  - Form fields (mobile-optimized):
    - "What did you do today?" Textarea (min-h-24, autosize via field-sizing-content, autofocus if not existing).
    - "What's planned for tomorrow?" optional Textarea.
    - "Any blockers?" optional Textarea.
    - Hours worked: big −/+ steppers (size-12 buttons) flanking a Slider (0-12, step 0.5). Live `Xh` label.
    - Mood: 3 big emoji buttons (text-3xl) in grid grid-cols-3 — 😄 Great / 😐 OK / 😟 Stressed. Selected state: `border-primary bg-primary/10 ring-2 ring-primary` + primary-tinted label.
  - Big "Submit Report" button (full-width, min-h-12, primary, Send icon). Shows Loader2 spinner while submitting.
  - If offline: amber note "report will be saved when you reconnect".
  - On submit success: confirmation Card with emerald CheckCircle2, "Report submitted ✓", summary rows (Hours, Mood, Done today count), and "File another" + "Done" buttons.
- **ProjectsView**: lists `myProjects` as tappable Cards. Each shows project name, code, role (with underscores→spaces), status Badge, eventDate (Calendar icon), venue (MapPin icon), and a milestone MiniBar with "X / Y done" sub. EmptyState if no active events.
- **RunSheetView** (per selected project):
  - BackBar "Active Events" + project header Card: name, code, role, OnlineBadge, eventDate/venue meta.
  - Progress: "X of Y complete" + pct + MiniBar.
  - If queue length > 0: amber "Sync now" button (or "Offline · N queued" if offline) with count Badge.
  - **Milestones section**: Card with divide-y list. Each row is a min-h-12 button: CheckCircle2 (emerald, done) / Circle (muted, not done) / Loader2 (busy) + title (strikethrough if done) + "Due {date}" + "· done {time}" sub. Tapping → optimistic UI + POST (online) or queue (offline).
  - **Event-Day Checklist section**: 11 hardcoded template items (Crew call confirmed, Equipment loaded & verified, Venue access confirmed, Power/generator confirmed, Sound check complete, Lighting check complete, Camera positions locked, Client briefing done, Livestream test (if applicable), Doors open, Event wrap & handover). Stored ONLY in localStorage key `doz-run-sheet-<projectId>`. Auto-initializes on first access. Each row: min-h-12 button with CheckCircle2/Circle + label (strikethrough if done) + "done {time}" sub. Tapping toggles locally.
  - Note: "Saved on this device — works offline".
- **localStorage helpers**:
  - `loadTemplate(projectId)` — auto-initializes from `EVENT_DAY_TEMPLATE` on first access.
  - `saveTemplate(projectId, items)`.
  - `loadQueue(projectId)` / `saveQueue(projectId, items)` — for offline milestone toggle queue (key `doz-run-sheet-queue-<projectId>`).
- **Offline behavior**:
  - When offline + toggling milestone: pushes `{milestoneId, done, timestamp}` to queue (replaces any existing queued toggle for same milestone), updates UI optimistically. Toast "Saved offline — will sync".
  - When `online` event fires OR queue length > 0 + online: auto-flush — POSTs each queued toggle. Successfully-synced items removed from queue. Failed items retained. Toasts: "Synced X updates ✓" / "X updates failed to sync".
- **Shared sub-components**: `OnlineBadge`, `QuickStat`, `Field` (label + hint + required marker + children), `SummaryRow`, `BackBar` (back button to a labeled parent view), `FieldHeaderSkeleton`.
- **Loading state**: Skeleton header + 2 skeleton cards.
- **Error state**: EmptyState with AlertTriangle icon + "Try again" button.
- All MANDATORY styling rules honored: max-w-md mx-auto, min-h-12 touch targets, Cards p-4/p-5, emerald/amber/rose palette (NO indigo/blue), mood emojis exact, sonner toasts, lucide-react icons from spec list.

### Testing
- Dev server clean (Ready in 587ms, no compile errors).
- Auth verified via curl:
  - Unauthenticated GET/POST → 401 `{"error":"unauthorized"}`.
  - Login flow (csrf → callback/credentials → session cookie) works for founder@, chioma@, bola@ accounts.
- **GET /api/doz/field as Chioma (intern)**: 200, returns 2 tasks (HIGH + MEDIUM priority), 0 projects (not crew/manager), 0 crew assignments, `todayReport: null`. Shape exactly per spec.
- **GET /api/doz/field as Adaeze (founder)**: 200, returns 9 tasks, 3 projects she manages (MTN Brand Film, GTBank Annual Conference, Dangote Sustainability Documentary) with role `MANAGER` and full milestone arrays, 0 crew assignments, todayReport null. (Founder had filed a report earlier but it was set to today's date — confirmed after submit that GET reflects it.)
- **GET /api/doz/field as Bola (freelancer)**: 200, returns 0 tasks, 2 projects where she's crew as PRODUCTION_MANAGER (MTN Brand Film + GTBank), 2 crewAssignments. Confirms crew→myProjects merge works and crew role takes precedence over manager.
- **POST submit_report (Chioma)**: 
  - First call → 200 `{ok:true, report:{id, tasksDone, tasksPlanned, blockers, hoursWorked:7.5, mood:"GREAT", reportDate}}`. 
  - GET immediately after → todayReport populated with the new report.
  - Second call (different fields) → 200, SAME id (no duplicate). GET confirms updated fields (tasksDone="Updated report", hoursWorked=8, mood=OK). Idempotency verified.
- **POST toggle_milestone (Adaeze founder, on her MTN Brand Film milestone "Principal shoot day")**:
  - Toggle PENDING→DONE → 200 `{ok:true, milestone:{status:"DONE", completedAt:"2026-06-25T22:10:08.545Z"}}`.
  - Toggle DONE→PENDING (revert) → 200, status PENDING, completedAt: null.
- **POST toggle_milestone access control**:
  - Chioma (not crew, not manager on MTN Brand Film) → 403 `{"error":"not_authorized_for_milestone"}`.
  - Bola (crew PRODUCTION_MANAGER on MTN Brand Film) → 200, can toggle and revert.
- **POST toggle_milestone edge cases**:
  - Invalid milestoneId → 404 `{"error":"milestone_not_found"}`.
  - Missing `done` field → 400 `{"error":"milestoneId_and_done_required"}`.
- **POST submit_report edge cases**:
  - Empty/whitespace tasksDone → 400 `{"error":"tasks_done_required"}`.
  - Invalid mood value → 400 `{"error":"invalid_mood"}`.
  - Unknown action → 400 `{"error":"unknown_action"}`.
- Home page (`GET /`) renders 200, compiles in 5.8s (first hit, Turbopack), then 38ms cached. No errors in dev.log.
- `bun run lint` → EXIT 0, zero errors/warnings across the whole repo.

## Stage Summary
- Field Mode module is fully implemented and verified end-to-end via authenticated curl.
- API: GET /api/doz/field (user context) + POST /api/doz/field (submit_report with upsert semantics, toggle_milestone with crew/manager authorization). All auth via `getSessionUser()`. Prisma transactions used for both POST actions.
- UI: mobile-first (`max-w-md`, min-h-12 touch targets, generous spacing) with 4 views (home/projects/report/runsheet), 3 big emoji mood buttons with ring-2 selected state, slider+stepper hours input, optimistic milestone toggling, localStorage-backed event-day checklist (11 template items) + offline toggle queue, auto-sync on `online` event, OnlineBadge (Wifi/WifiOff), progress MiniBars, sonner toasts.
- Color discipline: emerald primary, amber warning/offline, rose danger — NO indigo/blue.
- Files: src/app/api/doz/field/route.ts (new, ~270 lines), src/components/modules/field-mode.tsx (overwrote 1-line stub → ~750 lines).
- Work record saved to /home/z/my-project/agent-ctx/P4-A-field-mode.md.
