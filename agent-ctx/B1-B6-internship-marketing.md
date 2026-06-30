# Task B1-B6 — Internship Programme Update + Marketing Simplification

**Agent:** Main (orchestrator)
**Task IDs covered:** B1 (intern names), B2 (July 6 start date), B3 (separate intern responsibilities), B4 (make it editable), B5 (marketing simplification — overview), B6 (marketing simplification — content calendar + referrals)

## Summary of changes

### Task 1: Internship Programme (`src/app/api/doz/internship/route.ts` + `src/components/modules/internship-program.tsx`)

**API changes:**
- `PROGRAM_START = new Date(2025, 6, 6)` (July 6, 2025) replaces the old Jan 1, 2025 reference.
- GET now returns `hasStarted` (boolean) and `programStartsAt` (ISO string) alongside `currentMonth`. When `now < programStart`, `currentMonth = 0` and the UI shows "Starts July 6".
- New `pickInternForTrack()` helper matches interns to tracks by **title keyword** ("operation" vs "content"/"brand") instead of relying on array index. Verified it correctly resolves:
  - OPERATIONS_GROWTH → Akpala Arome (title: "Operations & Growth Coordinator")
  - CONTENT_BRAND → Esther Joseph (title: "Content & Brand Coordinator")
- Returns `interns: InternSummary[]` so the UI can populate the assignee dropdowns.
- New POST actions (FOUNDER-only except `update_milestone` + `submit_standup`):
  - `add_intern` — creates a User with `role=INTERN`, hashes the password with `hashPassword`, sets title based on the chosen track, validates email uniqueness and password ≥ 6 chars.
  - `add_milestone` — creates an InternshipMilestone (validates track ∈ {OPERATIONS_GROWTH, CONTENT_BRAND}, monthStart/monthEnd ∈ 1-12).
  - `edit_milestone` — partial update of any field set on the body.
  - `delete_milestone` — hard delete.

**UI changes:**
- Founder-only header bar with **Edit Mode switch** + **Add Intern** button.
- Each track tab now opens with a **prominent intern header**: large icon tile, track name, "Graduates as {role}" badge, a circular avatar (initials + `avatarColor()`), the intern's full name + title, and the progress bar / completion count.
- Edit Mode reveals: per-track "Add Milestone" button + per-milestone pencil/trash icon buttons.
- "Programme starts July 6" banner in Current Month card + roadmap header when `!hasStarted`.
- New dialogs: `AddInternDialog` (name/email/track/graduationRole/password), `MilestoneFormDialog` (re-used for add + edit, remounted via `key` so initial state is derived from props — no sync effect), `DeleteMilestoneDialog` (confirmation).
- Standup tab + Weekly Workflow + Three Golden Rules preserved unchanged.
- Click-to-cycle status on milestone icons preserved.

### Task 2: Marketing Simplification (`src/app/api/doz/marketing/route.ts` + `src/components/modules/marketing-growth.tsx`)

**API changes:**
- GET now returns `stats.postsThisMonth` (count of PUBLISHED ContentCalendarItems whose `publishedDate` falls in the current calendar month) and `stats.contentGoalMonthly` (hard-coded 12).
- New POST action `log_post` — creates a ContentCalendarItem with `status=PUBLISHED`, `publishedDate` = today (or supplied date), `scheduledDate` = same, `type=POST`, `topic="Monthly goal post"`. This is what the "Add Post" button on the Overview tab uses.

**UI changes — full rewrite of `marketing-growth.tsx`:**
- Tabs reduced from 4 (Overview / Campaigns / Content / Referrals) to **3 (Overview / Content Calendar / Referral Sources)**. Campaigns tab removed; the module now focuses entirely on the 12-posts-per-month target.
- Top KPI strip removed; the Overview tab leads with the headline widget instead.
- **Overview tab:**
  1. `MonthlyContentGoalCard` — "Monthly Content Goal — {MonthName}" header, big progress bar ("6 of 12 posts this month" + pct), **12 circles** in a 6/12-column grid that fill (primary bg + check icon) as posts are logged, an **Add Post** button (opens `LogPostDialog`), and a "View calendar" shortcut.
  2. `PostIdeasCard` — 7 pillars in a responsive grid (Behind the Scenes, Case Studies, Event Tips, Filmmaking Tips, Client Success Stories, Founder Stories, Fiestivo Journey). Each pillar lists its preset ideas with a **"Use"** button that calls `create_content` with that title (status defaults to IDEA on the API) and switches the user to the Content Calendar tab.
  3. `ReferralSourcesMiniCard` — at-a-glance referral summary (active sources, total referred, overdue nurtures, top referrers list) with a "Manage" shortcut to the Referrals tab.
- **Content Calendar tab:** simplified from a card grid to a list (`ContentRow`) grouped by This Week / Next Week / Backlog / Recently Published. Each row has a platform icon tile, status pill, scheduled/published date, and a one-click "→ drafting/scheduled/published" advance button. "New Post" button opens `NewContentDialog`.
- **Referral Sources tab:** kept largely as-is but simplified — same `ReferralCard` with avatar, relationship tag, total referred / referral count, last/next nurture, overdue alert, and Log Contact button. Add Referral Source dialog preserved.
- **LogPostDialog** — title + platform + published date (defaults to today). Submits to `log_post`.

## Lint & runtime verification

- `bun run lint` → **EXIT 0**, zero errors / zero warnings.
- Two initial lint errors (`react-hooks/set-state-in-effect`) in `MilestoneFormDialog` and `LogPostDialog` were resolved:
  - `MilestoneFormDialog` now derives initial state from the `milestone` prop and is remounted via `key` (per edit target) instead of syncing in `useEffect`.
  - `LogPostDialog` uses `useState(() => today)` lazy initializer; no effect needed.
- End-to-end API smoke test (founder login via cookie auth):
  - `GET /api/doz/internship` → 200. `hasStarted=true`, `currentMonth=12` (system clock is past July 6, 2025), `programStartsAt=2025-07-06T00:00:00.000Z`. Tracks resolve correctly: OPERATIONS_GROWTH→Akpala Arome (14 milestones), CONTENT_BRAND→Esther Joseph (14 milestones).
  - `POST /api/doz/marketing {action:"log_post"}` → 201. Created ContentCalendarItem with status=PUBLISHED. Subsequent GET confirmed `postsThisMonth` incremented from 1 → 2. Test row deleted afterwards.
  - `POST /api/doz/internship {action:"add_intern", name:""}` → 400 `name_required` ✓
  - `POST /api/doz/internship {action:"add_milestone", title:""}` → 400 `title_required` ✓

## Files touched
- `src/app/api/doz/internship/route.ts` (rewritten)
- `src/components/modules/internship-program.tsx` (rewritten — InternshipProgram + TrackDetail + AddInternDialog + MilestoneFormDialog + DeleteMilestoneDialog)
- `src/app/api/doz/marketing/route.ts` (added postsThisMonth + contentGoalMonthly + log_post action)
- `src/components/modules/marketing-growth.tsx` (full rewrite — simplified 3-tab UI with Monthly Content Goal + Post Ideas + simplified Content Calendar + simplified Referral Sources)

## What the user will see
- **Internship tab:** Each track view leads with the intern's name + avatar + graduation role. Edit Mode (founder-only) exposes add/edit/delete milestone controls and an "Add Intern" button at the top. If today is before July 6, the Current Month card reads "Starts July 6" instead of "Month 1".
- **Marketing tab:** Overview shows the big "Monthly Content Goal" with 12 circles filling up as posts are logged, plus a "Post Ideas" library organised by the 7 pillars with one-click "Use" buttons. Content Calendar is a flat list grouped by This Week / Next Week / Backlog with one-click status advance. Referral Sources kept simple with the Log Contact action.
