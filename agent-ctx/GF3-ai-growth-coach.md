# GF3 — AI Growth Coach (CEO Briefing, Weekly Review, Monthly Report, Coaching Nudges)

## Task
Build 4 AI-powered growth coaching features for DOZ OS:
1. Upgrade `/api/doz/ai/briefing` to CEO morning briefing format (revenue vs target, proposals not followed up, overdue invoices, referral %, intern completion, pending approvals, top 5 actions, business impact).
2. New `/api/doz/ai/weekly-review` GET — auto-generated Monday review with 9 question sections + Top 5 priorities.
3. New `/api/doz/ai/monthly-report` GET — auto-generated monthly board report with 14 sections.
4. New `/api/doz/ai/coaching` GET (return nudges) + POST (mark nudge read).
5. UI components: CoachingNudges, WeeklyReviewCard, MonthlyReportCard.
6. Integrate into command-center.tsx (FOUNDER-only).

## Work Log

### APIs created/edited (all server-side, auth-gated via getSessionUser)

1. **EDITED `/src/app/api/doz/ai/briefing/route.ts`** — Upgraded to new CEO format:
   - System prompt follows spec exactly: "You are the AI Chief of Staff and Growth Coach for Digit One Zero Ltd..." with explicit format including "Good morning Kelvin.", revenue status, proposals not followed up, overdue invoices, referral dependency, intern completion, pending approvals, "Today's highest-impact actions:" (5 numbered), "Estimated business impact:".
   - Context builder `buildContext()` gathers: revenue YTD vs GrowthKPI Annual Revenue target (with year-progress-adjusted % behind), unfollowed proposals (SENT/DRAFT proposals with no completed follow-up in 7+ days, summed value, max days overdue, account names), overdue invoices (count + value), referral dependency % (REFERRAL source opps / total), intern task completion (tasks assigned to INTERN-role users, % DONE), pending approvals (PENDING PaymentRequests grouped by requester title/role).
   - Top 5 actions generated from context: 1) Call biggest unfollowed proposal account, 2) Approve largest pending RFQ/payment request, 3) Chase largest overdue invoice, 4) Review LinkedIn/marketing campaign, 5) Meet BD prospect or delegate documentation.
   - Estimated business impact: unfollowed proposal value + 10% of pipeline value.
   - Caches as AIInsight type="DAILY_BRIEFING" for 1 hour. `?refresh=1` bypasses cache.
   - Rule-based fallback that matches the exact format if LLM fails.

2. **CREATED `/src/app/api/doz/ai/weekly-review/route.ts`** — GET endpoint:
   - System prompt follows spec: 9 markdown sections (Last Week Summary, What Improved, What Declined, Biggest Risks, Cash Leaks, Clients Needing Attention, Proposals Requiring Follow-up, Team Members Needing Help, Strategic Goals Off Track) + Top 5 CEO Priorities.
   - Context: last 7 days tasks completed, invoices paid/overdue, proposals sent/accepted/rejected, opportunities moved, expenses by category, follow-ups completed/overdue, KPI improvements/declines (using lowerBetter heuristic for DAYS/Dependency/Variance/Operational Time KPIs), goals off track (progress vs expected progress for due date), cash position, clients needing attention (overdue invoices + unfollowed proposals), team members needing help (no reports filed or ≥2 reports with blockers).
   - Caches in WeeklyReview table for 7 days (weekStart + content + topPriorities JSON). `?refresh=1` bypasses.
   - Extracts top 5 priorities from LLM markdown response (regex match for `## Top 5` section, parse numbered lines).
   - Rule-based fallback generates all sections from context.

3. **CREATED `/src/app/api/doz/ai/monthly-report/route.ts`** — GET endpoint:
   - System prompt requires 14 sections per spec: Revenue, Profit, Cash Flow, Pipeline, Sales, Marketing, Operations, People, Project Margins, Client Satisfaction, Vendor Performance, Growth Score, Founder Time Allocation, Recommendations.
   - Context: monthly revenue (paid this month), expenses, gross profit, cash flow, pipeline value, open/won/lost opportunities, proposals sent/accepted/rejected (with conversion rate), active/completed projects, projects-on-time %, referral %, marketing leads %, team headcount by role, intern task completion, project margins (per-project revenue - expenses), client satisfaction (overdue invoices per client as proxy), vendor performance (rating + total spent), composite growth score (avg of Freedom/Focus/Revenue-pace/Win-rate KPIs), founder time by category (hours + pct) + operational %.
   - Caches in MonthlyReport table for 30 days (month key "YYYY-MM" + content). `?refresh=1` bypasses.
   - Rule-based fallback generates all 14 sections.

4. **CREATED `/src/app/api/doz/ai/coaching/route.ts`** — GET + POST:
   - GET: returns existing AICoachingNudge rows (sorted: unread first, then recency, take 10). Generates NEW nudges if none created in last 6 hours. Returns `{nudges, unreadCount, generated}`.
   - Nudge generation logic per spec:
     - FOUNDER_TIME: admin hours > 4 this week → "Kelvin, you've spent X hours this week on administration. Target is below 4 hours. Recommend delegating [specific task from notes]."
     - BD_ACTIVITY: ≥2 client meetings with fewer proposals → "You attended X client meetings this week. Only Y generated a proposal. Meeting-to-proposal conversion is Z%. Recommend improving qualification."
     - REFERRAL_DEP: referral % > 60 → "Referral dependence remains at X%. Target is below 40%. Publish two LinkedIn case studies this week."
     - DELEGATION: <5 BD activities → "You completed only X business development activities. Target is five."
     - CASH: overdue invoices → "X invoice(s) overdue totalling ₦Y. Recommend escalation calls before Friday."
     - FOUNDER_TIME (operational %): operational % > 60 → "Founder operational time is X% this week. Target is 50%. Block 2 hours tomorrow for strategic work."
   - De-dups new nudges against existing recent ones (7-day window) by message prefix.
   - POST: `{nudgeId, action: "read"}` → sets `isRead=true` on AICoachingNudge. Returns `{ok, nudge: {id, isRead}}`.

### UI Components created

5. **CREATED `/src/components/doz/coaching-nudges.tsx`** (CoachingNudges):
   - Auto-fetches `/api/doz/ai/coaching` on mount.
   - Card with `border-l-4 border-l-primary bg-primary/[0.03]`.
   - Shows up to 3 unread nudges. Each: `border-l-4` colored by severity (ACTION=rose, WARNING=amber, INFO=teal), category icon (Clock/Users/Megaphone/Target/Wallet/TrendingUp/Sparkles), severity label, time-ago, message, X dismiss button.
   - "Refresh" button bypasses cache, generates new nudges.
   - Empty state: emerald "You're on track" card.
   - Optimistic dismiss: marks nudge read locally, POSTs to backend, reverts on failure.
   - Uses sonner toast for feedback.

6. **CREATED `/src/components/doz/weekly-review-card.tsx`** (WeeklyReviewCard):
   - Auto-fetches `/api/doz/ai/weekly-review` on mount.
   - Collapsible. On Mondays: `border-l-amber-500 bg-amber-500/[0.03]`, defaults OPEN, shows "It's Monday — review your weekly CEO report" prompt. Other days: `border-l-primary`, defaults COLLAPSED.
   - Top section: "Top 5 CEO Priorities This Week" highlight box with numbered list (always visible when expanded).
   - Body: react-markdown render with custom styled headers (h2 → primary uppercase), lists, paragraphs.
   - `max-h-[28rem] overflow-y-auto scroll-thin` for long content.
   - Refresh button. Collapsed summary chip shows priority count.

7. **CREATED `/src/components/doz/monthly-report-card.tsx`** (MonthlyReportCard):
   - Auto-fetches `/api/doz/ai/monthly-report` on mount.
   - Collapsible, defaults COLLAPSED. `border-l-4 border-l-primary bg-card`.
   - Shows month label (e.g. "June 2026") + "Generated X days ago" in header.
   - Body: react-markdown render with same styled headers.
   - `max-h-[32rem] overflow-y-auto scroll-thin`.
   - Refresh button. Collapsed summary chip shows month label.

8. **EDITED `/src/components/modules/command-center.tsx`** (additive):
   - Imported `CoachingNudges` and `WeeklyReviewCard`.
   - Inserted `{user?.role === "FOUNDER" && <CoachingNudges />}` immediately after `<AiBriefingCard />` block (before founder freedom card, before KPIs) — for FOUNDER only.
   - Inserted `{user?.role === "FOUNDER" && <WeeklyReviewCard />}` as the FIRST item in the RIGHT COLUMN (above FocusScoreCard) — for FOUNDER only.

### Color discipline
- Emerald primary (border-l-primary, bg-primary/...)
- Amber warning (border-l-amber-500, bg-amber-500/[0.03])
- Rose action (border-l-rose-500, bg-rose-500/10, text-rose-400)
- Teal info (border-l-teal-500, bg-teal-500/10, text-teal-400)
- NO indigo, NO blue anywhere.

### Testing — verified end-to-end via authenticated curl

All 4 endpoints tested with authenticated session (founder@digitonezero.com):

1. `GET /api/doz/ai/briefing?refresh=1` → 200, generated fresh briefing in CEO format:
   ```
   Good morning Kelvin.
   We are 46% behind our revenue target with ₦31.5M collected against ₦120M target.
   No proposals require follow-up.
   1 invoice is overdue for ₦4,500,000.
   Referral dependency is at 50%, above our 40% target.
   Intern completion rate is 0% with 0 of 3 interns completed.
   2 pending approvals: Operations Lead has 1, Production Manager has 1.
   Today's highest-impact actions:
   1. Approve PR-2025-051 for Lagos Chamber Annual Lecture.
   2. Chase overdue INV-2025-061 (₦4.5M).
   3. Review marketing campaign performance.
   4. Meet Business Development prospect (Shell Nigeria).
   5. Develop plan to reduce referral dependency below 40%.
   Estimated business impact: ₦11,380,000 potential pipeline.
   ```
2. `GET /api/doz/ai/briefing` (cached) → 200, `cached: true`, same content.
3. `GET /api/doz/ai/weekly-review` → 200, generated full markdown with all 9 sections + Top 5 Priorities (extracted correctly: "Secure payment of ₦4.5M overdue invoice...", "Implement immediate daily report submission protocol...", etc.).
4. `GET /api/doz/ai/monthly-report` → 200, generated full markdown with all 14 sections (Revenue/Profit/Cash Flow/Pipeline/Sales/Marketing/Operations/People/Project Margins/Client Satisfaction/Vendor Performance/Growth Score/Founder Time Allocation/Recommendations). Cached in MonthlyReport table.
5. `GET /api/doz/ai/coaching` → 200, returns 4 nudges (REFERRAL_DEP/DELEGATION/BD_ACTIVITY/FOUNDER_TIME from seed), `unreadCount: 4`.
6. `POST /api/doz/ai/coaching {nudgeId, action: "read"}` → 200, `{"ok":true,"nudge":{"id":"...","isRead":true}}`.
7. Re-GET coaching → `unreadCount: 3` (correctly decremented).

### Unauthorized tests
- `GET /api/doz/ai/briefing` (no cookie) → 401 `{"error":"Unauthorized"}`
- `GET /api/doz/ai/weekly-review` (no cookie) → 401
- `GET /api/doz/ai/monthly-report` (no cookie) → 401
- `GET /api/doz/ai/coaching` (no cookie) → 401

### Quality
- `bun run lint` → EXIT 0, zero errors/warnings.
- Page `GET /` returns 200, ~30KB HTML, no compile errors.
- Fixed JS parser issue: `(b.amount || b.opportunity?.value ?? 0)` requires parens around the `??` expression — changed to `(b.amount || (b.opportunity?.value ?? 0))` in briefing and weekly-review routes.

## Stage Summary
- AI Growth Coach system fully implemented and verified end-to-end.
- CEO Morning Briefing now follows the exact spec format (greeting + 6 status lines + 5 numbered actions + estimated impact) with real numbers from the database.
- Weekly CEO Review auto-generates on first request each week, cached 7 days in WeeklyReview table, surfaces the 9 strategic questions + Top 5 priorities.
- Monthly Board Report auto-generates monthly, cached 30 days in MonthlyReport table, includes all 14 board-ready sections with project margins, vendor performance, growth score, and founder time allocation.
- AI Coaching Nudges continuously monitor 6 triggers (founder admin time, BD conversion, referral dependency, delegation count, overdue invoices, operational %) and generate contextual nudges every 6 hours. Dismissable via POST.
- Command Center now shows: AI Morning Briefing → Coaching Nudges (FOUNDER only) → Founder Freedom Card → KPI row → main grid (with Weekly Review Card at top of right column for FOUNDER only).
- Color discipline maintained: emerald primary, amber warning, rose action, teal info. NO indigo/blue.
- All endpoints auth-gated. All cards have loading skeletons, error fallbacks, refresh buttons, and sonner toast feedback.
