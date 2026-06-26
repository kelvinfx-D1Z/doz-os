# G1 — Role-Aware Command Center

**Agent**: Role-Aware Command Center Builder
**Task**: Make the Command Center role-aware and personalized so different users (Founder, Staff, Intern, Freelancer) see DIFFERENT dashboards scoped to their role.

## What changed

### API — `src/app/api/doz/dashboard/route.ts` (rewritten, ~430 lines)
- Auth-gated via `getSessionUser()` — returns 401 if not signed in.
- Added 8 new parallel Prisma queries scoped to the current user.
- Added `currentUser: { id, name, email, role, title }` to the response (the ACTUAL logged-in user — separate from the existing `founder` field which is the FOUNDER record for the company-wide view).
- Added `myDay` block with 16 fields: tasks, taskCount, overdueCount, doneToday, reportFiled, todayReportId, weeklyObjective, pendingApprovals, pendingApprovalItems, myProjects, myPendingRequests, crewAssignments, deliverables, recentReports, learningPlan, teamReportsToday, teamReportsTotal, teamActivity.
- **Segregation of duties enforced at API level**: user can action a PENDING payment request only if (a) they're the assigned approver, OR (b) approver is null AND they are NOT the requester. Founder sees all pending.
- All existing company-wide data preserved (founder needs the full view).

### UI — `src/components/modules/command-center.tsx` (extended, ~2780 lines)
- Extended `DashboardData` type with `currentUser` + `myDay`. Added `MyDay` + `MyDayTask` interfaces.
- Founder greeting now uses `firstName(displayName)` (sourced from session user, not founder record).
- 3 role-aware early returns (INTERN, FREELANCER, STAFF) before the founder layout. Each renders the role dashboard + the existing QuickAddTaskDialog + MyDayDialog (so all roles can add tasks / view their full day).
- 5 new shared sub-components + 3 role dashboard components:
  - `DailyReportBanner` — amber (not filed) / green (filed) prominent banner.
  - `MyTasksList` — reusable checkbox task list.
  - `RoleHeader` — reusable greeting + subtitle + badges.
  - `InternDashboard` — focused/encouraging: Tasks Today / Done Today / Overdue / Weekly Goal KPIs + Your Tasks Today + Your Weekly Objective + Your Learning Plan + Quick Actions + Your Recent Reports + Daily rhythm card.
  - `StaffDashboard` — operational: My Open Tasks / My Projects / Approvals I can action / Team Reports Today KPIs + My Tasks Today + Pending Approvals (segregation-enforced) + My Projects + My Submitted Requests + Weekly Objective + Team Activity.
  - `FreelancerDashboard` — crew-focused: Crew Assignments / My Tasks / My Deliverables / Total Day Rate KPIs + My Crew Assignments (with role + day rate) + My Tasks + My Deliverables + Weekly Objective + Quick Links + DailyReportBanner.

## Test results

### curl/JSON (all 4 roles + unauth)
- FOUNDER (Adaeze): currentUser.name="Adaeze Okonkwo"; myDay.pendingApprovals=2; founder.name preserved.
- INTERN (Chioma): currentUser.name="Chioma Adeyemi"; reportFiled=true; learningPlan=1 item; recentReports=2; crewAssignments=0; pendingApprovals=0.
- STAFF (Tunde): currentUser.name="Tunde Bakare"; myProjects=1 (Access Bank); pendingApprovals=1 (ONLY PR-2025-053 — PR-2025-051 correctly excluded, Tunde requested it); myPendingRequests=2; teamReportsToday=3/12.
- FREELANCER (Bola): currentUser.name="Bola Martins"; crewAssignments=2 (GTBank + MTN, ₦120K each, PRODUCTION_MANAGER); deliverables=2 (3-min brand film IN_PROGRESS + Livestream recording PENDING); reportFiled=false.
- UNAUTHENTICATED: HTTP 401 ✓

### agent-browser UI (signed in via role quick-buttons)
- FOUNDER: "Good evening, Adaeze" + full company-wide layout (Top Priorities, Pending Approvals, Revenue by Service Line, Open Opportunities, Intern Reports Today, AI Morning Briefing, Focus & Alignment).
- INTERN: "Good evening, Chioma" + "Here's your plan for today — stay focused, you've got this." + green "Daily report filed ✓" + 4 KPIs + Your Tasks Today + Your Weekly Objective (45%) + Your Learning Plan (Intern Onboarding) + Quick Actions + Your Recent Reports (26 JUN + 25 JUN) + Daily rhythm card. NO financials/pipeline/approvals. Restricted sidebar.
- STAFF: "Good evening, Tunde" + "Here's what needs your attention today." + Operations Lead badge + 4 KPIs + My Tasks Today + Pending Approvals (only PR-2025-053 ₦300K) + My Projects (Access Bank) + My Submitted Requests (PR-2025-052 APPROVED + PR-2025-051 PENDING) + Weekly Objective + Team Activity.
- FREELANCER: "Good evening, Bola" + "Here's your work for today." + amber "You haven't filed your daily report yet" + 4 KPIs (Total Day Rate ₦240K) + My Crew Assignments (GTBank + MTN with rates/venues/dates) + My Tasks + My Deliverables (brand film + livestream) + Weekly Objective + Quick Links.

### Lint + dev server
- `bun run lint` → EXIT 0, zero errors/warnings.
- dev.log: GET /api/doz/dashboard 200 for all 4 roles, 401 for unauth, no compile errors.
- Screenshots: /tmp/intern-dashboard.png, /tmp/staff-dashboard.png, /tmp/freelancer-dashboard.png.

## Color discipline
Emerald primary, amber warning, rose danger. NO indigo/blue.

## Key design decisions
1. **Keep company-wide data in the API response** — founder needs it, and it's also useful as a fallback. Non-founder roles just don't render it.
2. **`currentUser` vs `founder`** — `founder` is the FOUNDER record (always Adaeze); `currentUser` is whoever is logged in. UI uses `currentUser.name` for greeting.
3. **Segregation of duties at API level** — requester can never approve their own request. The UI receives a pre-filtered list, so even if a buggy UI tried to show PR-2025-051 to Tunde for approval, it wouldn't be in `pendingApprovalItems`.
4. **Weekly objective fallback** — prefer a WEEKLY goal owned by the user; fall back to the company weekly goal. So interns without their own goal still see the company's weekly focus.
5. **Deliverables only fetched for FREELANCER role** — small optimization, since interns/staff don't have crew assignments.
6. **DailyReportBanner navigates to Field Mode** (`setModule("field")`) — reuses the existing P4-A Field Mode for actual report filing, no duplicate UI.
7. **All role dashboards share QuickAddTaskDialog + MyDayDialog** — so interns/staff/freelancers can still add tasks and view their full day's tasks, same as founder.
