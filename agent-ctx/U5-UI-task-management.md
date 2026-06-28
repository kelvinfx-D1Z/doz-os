# U5-UI — Task Management UI for Strategic Planning

**Task ID:** U5-UI
**Agent:** Task Management UI builder
**File edited:** `src/components/modules/strategic-planning.tsx`

---

## Starting point

READ `worklog.md` — confirmed prior Strategic Planning build (Task 5) and the
U1-U2 stage summary mentioning "Next: 3 subagents for project vendor management
UI, team CRUD, task management + DIDI actions." This task is the
**task management + DIDI** leg.

READ `src/components/modules/strategic-planning.tsx` (~2147 lines) — discovered
that the **prior build already shipped most of the requested features**:
`TaskRow` already had Edit (Pencil) + Delete (Trash2) icon buttons + a
distraction toggle, `TaskFormDialog` already handled both create + edit with
all required fields (title, description, priority, category, assignee, due
date, isDistraction, plus goalId + projectId), `PlanTasksDialog` already
fetched AI suggestions and let the user add them, and an `AlertDialog`
already confirmed deletes.

READ `src/app/api/doz/tasks/route.ts` — confirmed PATCH supports both
`{ taskId, action: "toggle" }` and `{ taskId, fields: {...} }`, POST requires
a non-empty `assigneeId`, DELETE accepts `{ taskId }` in the body.

READ `src/app/api/doz/planning/route.ts` — confirmed the planning response
already includes `users`, `projects`, and `allGoals` (so the form's Selects
are already populated without a separate `/api/doz/team` fetch).

READ `src/hooks/use-current-user.ts` — confirmed `useCurrentUser()` returns
the session user (id, name, email, role).

## Gaps found vs. spec

1. **Distraction toggle icon** — `TaskRow` used `Ban` (when distraction) /
   `CircleDot` (when not). Spec wants `AlertCircle`, amber & **filled** when
   distraction=true, muted when false.
2. **Is Distraction control in form** — was a custom full-width button, not a
   `Switch` (spec explicitly says "Is Distraction (Switch)").
3. **Distraction Detector explanation** — card had dynamic recommendation
   text but not the always-on explanation requested:
   *"Tasks marked as distractions are low-priority items that interrupt
   strategic work. Batch them into a 30-min block. Click the alert icon on
   any task to mark/unmark it as a distraction."*
4. **Create-task assigneeId bug** — POST `/api/doz/tasks` **requires** a
   non-empty `assigneeId` (returns 400 `missing_assigneeId` otherwise). The
   form offered a "— unassigned —" option (value `__none__`), and
   `handleCreateSubmit` mapped that to `undefined`, which would always fail
   the API check. The user could never create a task without manually
   picking an assignee.

## Changes made (all in `strategic-planning.tsx`)

### 1. Imports
- Added `AlertCircle` to the `lucide-react` import block.
- **Removed** `Ban` (no longer used after the toggle swap — verified via
  grep that `Ban` only appeared in the two toggle spots).
- Added `import { Switch } from "@/components/ui/switch"`.
- Added `import { useCurrentUser } from "@/hooks/use-current-user"`.

### 2. `TaskRow` distraction toggle (the quick button on each row)
- Replaced `Ban` / `CircleDot` with a single `AlertCircle` icon.
- When `isDistraction === true`: amber bg + `fill-amber-400 text-amber-400`
  (filled amber circle).
- When `false`: muted text + transparent fill, hover lifts to amber.
- Added `aria-pressed={isDistraction}` for accessibility.

### 3. `TaskFormDialog` Is Distraction field
- Replaced the custom full-width button with a row containing:
  - An `AlertCircle` icon (filled amber when on, muted when off)
  - A two-line label ("Flagged as distraction" / "Flag as distraction" +
    helper text)
  - A proper `Switch` component bound to `form.isDistraction` via
    `onCheckedChange`.
- The whole row still tints amber when distraction is on, matching the
  previous visual cue.

### 4. Default new-task assignee to current user (bug fix)
- `emptyForm()` now accepts an optional `defaultAssigneeId` and uses it for
  the initial `assigneeId` (falls back to `__none__`).
- `StrategicPlanning` now calls `useCurrentUser()` and passes
  `emptyForm(currentUser?.id)` as the `initial` prop of the create
  `TaskFormDialog` — so when a founder/staff/intern opens "New Task", the
  assignee Select is **pre-populated with themselves**.
- Added a defensive fallback in `handleCreateSubmit`: if the user somehow
  clears the assignee (selects "— unassigned —") and there's no session
  user, throw a clear error ("Please pick an assignee before creating the
  task.") instead of letting the API return an opaque 400. If there IS a
  session user, silently fall back to their id.

### 5. Distraction Detector explanation (always visible)
- Added a new block directly under the card header (above the dynamic
  content) that is **always shown**, regardless of whether distractions
  exist. Contains the exact spec text with an inline `AlertCircle` glyph
  illustrating the icon to click.
- The existing dynamic content (distraction list + "Batch these into a
  single 30-min block at 4 PM" recommendation, OR the "Stay on the
  cascade" message when clear) is preserved below it.

## What was already working (kept as-is)

- ✅ Edit button (Pencil) on every task row → opens `TaskFormDialog` in
  edit mode → PATCH `/api/doz/tasks` with `{ taskId, fields }` → toast →
  reload.
- ✅ Delete button (Trash2) on every task row → `AlertDialog` confirmation
  → DELETE `/api/doz/tasks` with `{ taskId }` → toast → reload.
- ✅ "New Task" button (Plus) in the Tasks `SectionHeader` action slot →
  opens `TaskFormDialog` in create mode → POST → toast → reload.
- ✅ "Plan Tasks with DIDI" button (Sparkles, primary `bg-primary`) in the
  same header → opens `PlanTasksDialog` which auto-POSTs
  `/api/doz/ai` with `{ action: "plan_tasks" }`, shows loading state
  (Bot + spinning Loader2), parses suggestions, each with an "Add" button
  that POSTs to `/api/doz/tasks` (resolving goalId + assigneeId by fuzzy
  match against `allGoals` / `users`), toasts "Task added", and disables
  the button showing a check.
- ✅ Optimistic toggle for task completion (`handleToggle` with revert on
  failure) and for distraction (`handleToggleDistraction` with revert).
- ✅ Tabs: Today (grouped by priority), This Week, All, Distractions —
  each with counts in `Badge`s, each tab's list scrolls inside
  `max-h-96 overflow-y-auto`.

## Testing

- `bun run lint` → **EXIT 0**, zero errors/warnings.
- Dev server log reviewed — no compile errors after edits (the only log
  entries are pre-existing 401/405s on unrelated endpoints from earlier
  agents).
- Manual code review of all 5 changed regions confirmed correct syntax,
  correct prop wiring, and correct conditional classNames.

## Files touched

- `src/components/modules/strategic-planning.tsx` (edited, +~60 / −~30 lines)

## Notes for downstream agents

- The create form now defaults the assignee to the current session user.
  If a downstream agent changes the POST `/api/doz/tasks` handler to make
  `assigneeId` optional, the UI fallback in `handleCreateSubmit` becomes
  a no-op but is still safe (it only kicks in when assigneeId is missing).
- `Ban` was removed from the lucide-react imports — do not re-add it
  unless something new uses it.
- The Distraction Detector explanation is hardcoded English text matching
  the spec; if i18n is added later, this string should be keyed.
