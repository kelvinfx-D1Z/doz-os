# Task C4 — Daily Tasks + Weekly Intern Task Assignment

**Agent**: Daily/Weekly Tasks Builder
**Task ID**: C4
**Scope**: Two features — (1) Interactive Daily Tasks in Command Center, (2) Weekly Intern Task Assignment in Team module.

---

## Work Log

### Reading prior work
- READ `/home/z/my-project/worklog.md` — confirmed foundation (Task 1: emerald theme, shared primitives at `@/components/doz/ui-primitives`, format helpers at `@/lib/format`, db client at `@/lib/db`, API pattern at `src/app/api/doz/<module>/route.ts`).
- READ Phase 2 auth notes — `getSessionUser()` from `@/lib/auth`, demo password "doz2025", `useCurrentUser()` hook at `@/hooks/use-current-user`. Confirmed founder email is `founder@digitonezero.com` (not `adaeze@…`).
- READ existing `command-center.tsx` (1027 lines, fetches `/api/doz/dashboard`, shows `topPriorities` as static rows with a non-functional checkbox button) and `team.tsx` (1029 lines, 4 tabs: Team / Daily Reports / Weekly Reports / Today's Tasks).
- READ Prisma Task model — has all fields needed: `title, description, status (TODO/IN_PROGRESS/DONE/BLOCKED), priority (URGENT/HIGH/MEDIUM/LOW), category, assigneeId, creatorId, goalId, projectId, dueDate, isDistraction, completedAt`.

### 1. Tasks API — `src/app/api/doz/tasks/route.ts` (NEW)
- **GET**: `?assigneeId=xxx` and/or `?scope=my-day|week`.
  - `scope=my-day` requires session (uses current user's id as assignee), filters tasks due today or earlier, status != DONE.
  - `scope=week` filters by `dueDate` within Monday-Sunday of current week.
  - Returns `{ tasks: [...] }` with `assignee {id,name,role}`, `creator {id,name}`, `goal {id,title}`, `project {id,name}` included.
  - Ordered by `[status asc (DONE last), priority asc, dueDate asc]`.
- **POST**: requires session. Body: `{ title, description?, priority?, category?, assigneeId, dueDate?, goalId?, projectId? }`.
  - Validates title (non-empty) + assigneeId (required). Priority defaults to MEDIUM; invalid values rejected.
  - Sets `creatorId = session.user.id`, `status = TODO`, `isDistraction = false`.
  - Returns `{ task: {...} }` with 201.
  - Logs `CREATED_TASK` activity (non-blocking).
- **PATCH**: requires session. Body: `{ taskId, action: "toggle" | "complete" | "reopen" }`.
  - `toggle` flips DONE ↔ TODO (clears/sets `completedAt`).
  - `complete` forces DONE; `reopen` forces TODO.
  - 400 for missing taskId / invalid action, 404 for task_not_found.
  - Returns `{ task: {...updated} }`.
  - Logs `COMPLETED_TASK` or `REOPENED_TASK` activity.
- Shared `shapeTask()` + `TASK_INCLUDE` constants keep response shape consistent across handlers. Date helpers (`startOfToday`, `endOfToday`, `startOfWeek`, `endOfWeek`) computed in local time.

### 2. Command Center — Interactive Daily Tasks
Edited `src/components/modules/command-center.tsx`:
- **New imports**: Dialog, Input, Label, Textarea, Select, Button, useCurrentUser, `toast as sonnerToast` from sonner, and lucide icons (Plus, Circle, Loader2, XCircle, ListTodo).
- **New types**: `TaskApi` interface mirroring the API response shape. Helper `todayISODate()` returns local `YYYY-MM-DD` for `<input type="date">`.
- **Refactored data loading**: extracted `loadData` `useCallback` so other handlers can refresh dashboard after task mutations.
- **New state**: `togglingId` (prevents double-clicks during in-flight PATCH), `showQuickAdd`, `showMyDay`, `myDayTasks`, `myDayLoading`.
- **`handleToggleTask(taskId, currentlyDone)`**:
  - Optimistic UI update — flips `topPriorities[i].status` AND `myDayTasks[i].status/completedAt` locally.
  - PATCH `/api/doz/tasks { taskId, action: "toggle" }`.
  - Success: sonner toast "Task completed" / "Task reopened" + refreshes dashboard.
  - Failure: reverts optimistic update + error toast.
  - Uses a `togglingId` guard so users can't double-toggle while in-flight.
- **`openMyDay()`**: opens dialog + fetches `/api/doz/tasks?scope=my-day` for the current user.
- **Updated "Today's Top Priorities" card**:
  - Checkbox button is now wired to `handleToggleTask`. Upgraded to spec: `h-5 w-5 rounded-full border-2`, emerald when done with Check icon, Loader2 spinner while toggling.
  - "View all" → "My Daily Tasks" button that calls `openMyDay()`.
  - Added **Add task** button (Plus icon, dashed outline) at the bottom that opens `QuickAddTaskDialog`.
  - Kept all existing visuals: DISTRACTION amber badge, category badge, assignee name, relativeTime, red overdue text, strikethrough when done.
- **New `QuickAddTaskDialog` component** (top-level): form with Title (Input, required), Priority (Select URGENT/HIGH/MEDIUM/LOW, default MEDIUM), Due date (Input type=date, default today), Description (Textarea, optional). Submit → POST `/api/doz/tasks` with `assigneeId = current user id`. Toast on success/error. Resets form on open. Loader2 spinner on submit button.
- **New `MyDayDialog` component** (top-level): shows summary row (Total/Pending/Done), completion MiniBar, full task list with interactive checkbox toggles (same h-5 w-5 rounded-full border-2 spec), Refresh + Add task buttons, nested QuickAddTaskDialog. Each task row shows PriorityDot, title (strikethrough when done, red when overdue), distraction/category badges, project name, due date with Clock icon.

### 3. Team Module — Weekly Tasks Tab
Edited `src/components/modules/team.tsx`:
- **New imports**: Dialog-related already existed; added Button, Input, Label, Textarea, Select, `toast` from sonner, `cn` from utils, and lucide icons (Plus, Check, Circle, ListTodo, UserPlus, ChevronRight, Loader2).
- **New types**: `WeeklyTask` interface matching the tasks API response.
- **New helpers**: `thisFridayISO()` returns YYYY-MM-DD for this week's Friday (default due date for new assignments), `isThisWeek()` checks if a date falls in Mon-Sun.
- **New `WeeklyTasksTab` component** (sub-component, takes `interns: Member[]`):
  - **Intern selector**: row of avatar buttons. Selected gets `ring-2 ring-primary bg-primary/5`.
  - **Selected intern's weekly tasks**: Card with SectionHeader, summary row (Total/Pending/Done), completion MiniBar, task list with interactive checkbox toggles (h-5 w-5 rounded-full border-2 spec, calls PATCH `/api/doz/tasks { taskId, action: "toggle" }` with optimistic update + sonner toast). Each task shows PriorityDot, title (strikethrough when done, red when overdue), StatusBadge, urgent badge if URGENT, category badge, description (line-clamp-2), project name, due date (formatDate), creator name.
  - **Assign new task form** (right column, lg:col-span-2): Card with form — Title (Input, required), Priority (Select, default MEDIUM), Due date (Input type=date, default this Friday), Description (Textarea, optional). Submit button "Assign Task" (UserPlus icon) POSTs to `/api/doz/tasks` with `assigneeId = selected intern`. Toast on success ("Task assigned → Chioma") / error. Resets form on success and reloads tasks.
  - **Team weekly snapshot**: Card showing each intern as a clickable row with avatar, name, `done/total` count, and a MiniBar (emerald when ≥80%, amber 40-80%, zinc <40%). Clicking selects that intern in the main view.
- **New `InternWeekSummary` sub-component**: lazy-loads each intern's weekly task count via `/api/doz/tasks?assigneeId=xxx&scope=week`, displays done/total + MiniBar. Uses cancelled-flag useEffect.
- **Added new tab**: `<TabsTrigger value="weekly-tasks">` with ListTodo icon, placed after "Today's Tasks". `<TabsContent value="weekly-tasks">` renders `<WeeklyTasksTab interns={data.members.filter(m => m.role === "INTERN")} />`.

### Testing
All tests run against authenticated session (founder@digitonezero.com / doz2025):

| Test | Result |
|---|---|
| GET /api/doz/tasks (no params) | 200 — all tasks with relations |
| GET /api/doz/tasks?scope=my-day (auth) | 200 — 4 tasks (founder's today/overdue) |
| GET /api/doz/tasks?scope=my-day (no auth) | 401 unauthorized ✓ |
| GET /api/doz/tasks?scope=week | 200 — tasks due this week |
| GET /api/doz/tasks?assigneeId=chioma&scope=week | 200 — 3 tasks for Chioma this week |
| POST /api/doz/tasks (auth, valid) | 201 — creates task, returns shape with assignee/creator |
| POST missing title | 400 missing_title ✓ |
| POST missing assigneeId | 400 missing_assigneeId ✓ |
| POST without auth | 401 unauthorized ✓ |
| PATCH toggle (TODO→DONE) | 200 — sets status DONE + completedAt |
| PATCH toggle (DONE→TODO) | 200 — clears completedAt |
| PATCH complete | 200 — forces DONE |
| PATCH invalid action | 400 invalid_action ✓ |
| PATCH missing taskId | 400 missing_taskId ✓ |
| PATCH nonexistent id | 404 task_not_found ✓ |
| PATCH without auth | 401 unauthorized ✓ |
| `bun run lint` | EXIT 0 — zero errors/warnings across all files |
| GET / (home) | 200 — page compiles with new command-center changes |
| GET /api/doz/team | 200 — team endpoint still works |
| Team.tsx compiles with new Weekly Tasks tab | ✓ (no compile errors in dev.log) |

### Color discipline & UI rules
- Emerald primary, amber warning, rose danger — NO indigo/blue.
- Cards use `p-4/p-5`.
- Task checkbox: `h-5 w-5 rounded-full border-2`, when checked: `bg-primary border-primary` with Check icon.
- Completed tasks: `line-through text-muted-foreground`.
- Intern selector: avatar buttons, selected has `ring-2 ring-primary`.
- Long lists use `max-h-* overflow-y-auto scroll-thin`.
- Loading: Loader2 spinner.
- Toast feedback from sonner.
- Reused shared primitives: StatCard, StatusBadge, SectionHeader, EmptyState, MiniBar, PriorityDot.
- Reused format helpers: formatDate, relativeTime, avatarColor, initials.

---

## Stage Summary

**Files created:**
- `src/app/api/doz/tasks/route.ts` — full GET/POST/PATCH with auth gates, validation, optimistic-update-friendly response shape, activity logging.

**Files edited:**
- `src/components/modules/command-center.tsx` — interactive priorities (checkbox toggles call PATCH API with optimistic UI + toast + dashboard refresh), "Add task" button with QuickAddTaskDialog (title/priority/dueDate=today/description), "My Daily Tasks" button opening MyDayDialog (full day's task list fetched from /api/doz/tasks?scope=my-day, with summary row, completion MiniBar, interactive checkboxes, refresh, nested quick-add).
- `src/components/modules/team.tsx` — new "Weekly Tasks" tab with WeeklyTasksTab sub-component: intern selector (avatar buttons with ring-2 selected state), selected intern's weekly tasks list (PriorityDot + title + StatusBadge + checkbox toggle + due date + creator), Assign New Task form (title/priority/dueDate=this Friday/description, posts to /api/doz/tasks with selected intern's id), per-intern weekly snapshot with done/total counts + MiniBar.

**Verified end-to-end:** Sign in as founder → Command Center → click priority checkbox → task marks done (PATCH fires, toast appears, dashboard refreshes) → click "Add task" → fill form → POST creates task → click "My Daily Tasks" → see full day's list with new task. Switch to Team module → Weekly Tasks tab → click Chioma intern → see her 3 weekly tasks → toggle one done → assign new task via form → it appears in her list.

**All existing functionality preserved:** Command Center KPIs, pending approvals, service mix, weekly objective, upcoming deadlines, AI insights, intern reports, open opportunities, recent activity — all untouched. Team module's Team/Daily/Weekly/Today's Tasks tabs — all untouched.

**`bun run lint` → EXIT 0.**
