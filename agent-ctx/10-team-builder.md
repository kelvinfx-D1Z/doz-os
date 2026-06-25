# Task 10 — Team Management Module

Agent: Team Management builder
Task: Build Team Management module (API route + UI component) for DOZ OS — interns, freelancers, daily/weekly reports, accountability.

## Work Log

### Read prior context
- READ `/home/z/my-project/worklog.md` (Tasks 1, 4, 6, 7, 8, 9): foundation + dashboard + CRM + Projects + Procurement + Finance modules already built.
- Confirmed shared primitives at `@/components/doz/ui-primitives` (StatCard, StatusBadge, SectionHeader, EmptyState, MiniBar, PriorityDot) and format helpers at `@/lib/format` (formatDate, relativeTime, avatarColor, initials, formatNGN, statusStyle).
- DB client at `@/lib/db`. Schema models: `User` (role: FOUNDER/STAFF/INTERN/FREELANCER, capacity hrs/week, isActive), `DailyReport` (reportDate, tasksDone newline-sep, tasksPlanned, blockers, hoursWorked, mood: GREAT/OK/STRESSED), `WeeklyReport` (weekStart, weekEnd, achievements, challenges, learnings, nextWeekPlan), `Task` (assigneeId, status: TODO/IN_PROGRESS/DONE/BLOCKED, priority URGENT/HIGH/MEDIUM/LOW, dueDate, completedAt), `CrewAssignment`.
- Seed data: 1 founder (Adaeze Okonkwo), 2 staff, 3 interns (Chioma, Emeka, Fatima), 7 freelancers; 6 daily reports (2 per intern, today + yesterday), 3 weekly reports.

### API — `/home/z/my-project/src/app/api/doz/team/route.ts`
- Single `Promise.all` of 4 parallel Prisma queries: users (with `_count` of tasksAssigned/dailyReports/weeklyReports/crewAssignments), dailyReports (include user), weeklyReports (include user), tasks (include assignee).
- Computes:
  - `openTasksByMember` Map: count of tasks where status != DONE, keyed by assigneeId.
  - `completedTodayByMember` Map: tasks where status=DONE and completedAt >= today's start.
  - `lastReportByUser` Map: first row (most recent, since sorted desc) per userId.
  - `reportingToday`: interns whose latest daily report's reportDate == today.
  - `reportingRate`: round(internsReportingToday / totalInterns * 100).
  - `avgHours`: mean of hoursWorked across today's reports.
- Returns `{ stats, members, dailyReports, weeklyReports, todayTasks }` with exact shape per spec.
- `todayTasks`: open tasks only, sorted by priority (URGENT→HIGH→MEDIUM→LOW) then dueDate asc.
- Fixed an SWC parse error: `new Map<string, (typeof dailyReports)[number]>()` had `>>` token issue. Extracted to a type alias: `type DailyReportRow = (typeof dailyReports)[number];`.
- Verified: HTTP 200, ~11.5KB JSON. stats = `{totalMembers:13, interns:3, freelancers:7, staff:2, founder:1, reportingToday:3, reportingRate:100, openTasks:15, completedToday:0, avgHours:7}`. 13 members, 6 daily reports, 3 weekly reports, 15 today's tasks (URGENT/HIGH/MEDIUM/LOW groups).

### UI — `/home/z/my-project/src/components/modules/team.tsx` (overwrote stub)
- `"use client"` `export function Team()` — fetches `/api/doz/team` in `useEffect` with cancelled-flag guard (lint-clean: no setState in effect body).
- Loading: skeleton grid (6 KPI cards + filter row + 6 member cards).
- Error: EmptyState with AlertTriangle icon + error message.
- **Top KPI row (6 StatCards)**: Team Members, Interns (sub "X reporting today"), Freelancers, Reporting Rate % (accent=danger if <80%, primary otherwise), Open Tasks (warning accent if ≥10), Avg Hours/Day.
- **Tabs**: Team (default) | Daily Reports | Weekly Reports | Today's Tasks.

**Team tab:**
- Filter pills: All | Founder | Staff | Interns | Freelancers (custom FilterPill component, active state = emerald border/bg, shows count badge).
- Member cards grid (`sm:grid-cols-2 lg:grid-cols-3 gap-4`):
  - Header: Avatar (initials+avatarColor), name, role badge (FOUNDER=emerald, STAFF=teal, INTERN=amber, FREELANCER=violet — each with appropriate lucide icon: UserCog/Users/GraduationCap/Briefcase).
  - Contact info (email, phone) — small, with Mail/Phone icons.
  - Capacity: "X hrs/week" with MiniBar utilization indicator (color: rose if ≥6 open, amber if ≥3, primary otherwise).
  - Stats row: 3 mini stat boxes (Open tasks, Reports count = daily+weekly, Crew assignments).
  - Last report indicator: green dot + "Reported today" OR amber dot + "No report today". Plus mood emoji (😄/😐/😟) and hoursWorked.

**Daily Reports tab:**
- Note banner explaining grouping by date (today first).
- "Missing today's report" section at top: amber-flagged empty cards for interns who haven't reported today ("⚠ [Name] — No daily report submitted" + role/sub note).
- Grouped by date (desc), each group: header with formatDate + TODAY badge (emerald) if today + report count.
- Report card: header (avatar, name, title, mood emoji, hours badge with Clock icon, formatDate), Done section (split tasksDone by newline into list items with emerald CheckCircle2 icons), Planned section (Target icon, bullet list), Blockers section (amber-tinted box with AlertTriangle icon — only shown if blockers != "None").
- Scrollable: `max-h-[800px] overflow-y-auto scroll-thin`.

**Weekly Reports tab:**
- Each card: header (avatar, name, title, week range "formatDate(weekStart) → formatDate(weekEnd)" in muted pill with CalendarDays icon).
- 4 sections in 2-col grid: Achievements (emerald, Sparkles icon), Challenges (amber, AlertTriangle icon), Learnings (teal, Lightbulb icon), Next Week Plan (primary, Rocket icon). Each section splits its text by newline into bullet list, "—" if empty.

**Today's Tasks tab:**
- Note banner with task count.
- Grouped by priority (URGENT → HIGH → MEDIUM → LOW), each group: header with colored dot (rose/amber/teal/zinc) + label + task count, then a Card containing a Table.
- Table columns: Task (title), Assignee (avatar+name+role), Status (StatusBadge), Due (relativeTime).
- EmptyState with Inbox icon if no open tasks.

### Styling compliance (MANDATORY)
- Cards `p-4` (some `p-4` for inner sections).
- Used `StatCard`, `StatusBadge`, `SectionHeader`, `EmptyState`, `MiniBar` from `@/components/doz/ui-primitives`.
- Used `formatDate`, `relativeTime`, `avatarColor`, `initials` from `@/lib/format`.
- lucide-react icons: Users, UserCog, GraduationCap, Briefcase, CheckCircle2, Clock, AlertTriangle, FileText, Calendar, Smile, Phone, Mail, Target, ListChecks, CalendarDays, Sparkles, Lightbulb, Rocket, Inbox.
- Color: emerald primary, amber warning, rose danger. NO indigo/blue.
- Role badges: FOUNDER=emerald, STAFF=teal, INTERN=amber, FREELANCER=violet (verified).
- Mood emojis as specified: GREAT=😄, OK=😐, STRESSED=😟.
- Loading: skeleton grid.
- Scrollable: `scroll-thin`, `max-h-[800px] overflow-y-auto` on long lists.

### Testing
- Restarted dev server (port 3000). Ready in 599ms.
- `curl -s http://localhost:3000/api/doz/team -m 30` → HTTP 200, ~11.5KB JSON with all 5 keys (stats, members, dailyReports, weeklyReports, todayTasks). All shapes match spec exactly.
- `curl -s http://localhost:3000/ -m 30` → HTTP 200, page compiles cleanly.
- `bun run lint` → EXIT=0 (zero errors, zero warnings).
- dev.log shows: `GET /api/doz/team 200 in 70ms (compile: 52ms, render: 18ms)` then `GET /api/doz/team 200 in 9ms`. Clean compilation, no errors.

## Stage Summary
- Module 7 (Team Management) is fully implemented and verified.
- Files:
  - `src/app/api/doz/team/route.ts` (new, GET only).
  - `src/components/modules/team.tsx` (overwrote 1-line stub with full ~720-line "use client" component).
- API contract verified end-to-end: 13 members, 3 interns, 7 freelancers, 2 staff, 1 founder, 100% reporting rate (3/3 interns), 15 open tasks (URGENT/HIGH/MEDIUM/LOW distribution), 6 daily reports (3 today + 3 yesterday), 3 weekly reports.
- UI: 4 tabs (Team / Daily Reports / Weekly Reports / Today's Tasks), filter pills for member role, per-member open tasks count + last-report indicator + mood emoji, daily reports grouped by date with "missing today" amber flags for non-reporting interns, weekly reports with 4 colored sections (Achievements/Challenges/Learnings/Next Week Plan), today's tasks grouped by priority in tables with assignee avatars.
- All shared primitives reused, exact import paths per spec.
- Color discipline: emerald/amber/rose/teal/violet — zero indigo/blue.
