# Task 12 — AI Chief of Staff

## Agent
AI Chief of Staff builder (Module 9)

## Task
Build the AI Chief of Staff module: API route AND UI component.
The AI layer that acts like an Operations Director — daily plans, priorities, proposals, risk detection, overdue + budget-overrun detection.
Uses `z-ai-web-dev-sdk` (server-side only) for LLM completions.

## Files
- `/home/z/my-project/src/app/api/doz/ai/route.ts` — GET (insights + context summary) + POST (daily_plan | risk_check | proposal_draft | chat)
- `/home/z/my-project/src/components/modules/ai-chief-of-staff.tsx` — full "use client" UI (overwrote stub)

## Work Log
- READ worklog.md (Tasks 1, 4, 6, 7, 8, 9 already complete) — reused conventions: StatCard/SectionHeader/EmptyState from `@/components/doz/ui-primitives`, formatNGN/relativeTime from `@/lib/format`, db client at `@/lib/db`, emerald primary / amber warning / rose danger palette (no indigo/blue).
- READ prisma/schema.prisma — confirmed AIInsight model exists (type, severity, title, message, isRead, entityType, entityId, createdAt) and that Opportunity has `value`, `account.name`, `serviceType`.
- READ dashboard/route.ts — reused the lighter contextSummary queries (opportunities + invoices + expenses + tasks + projects + paymentRequests) but only the fields needed.
- Verified `z-ai-web-dev-sdk` v0.0.18 is installed; checked `dist/index.d.ts` for the correct API: `ZAI.create()` → `zai.chat.completions.create({ messages, thinking })` → `completion.choices[0].message.content`. Matches the spec exactly.

### API route `/api/doz/ai`
- `buildContextSummary()` — single Promise.all of 6 lean Prisma queries (opportunities, invoices, expenses, tasks, projects, paymentRequests). Computes: pipelineValue (open opps), outstandingAmount (SENT/PARTIAL/OVERDUE), overdueAmount (OVERDUE only), cashPosition (revenue − expenses), pendingApprovals (PENDING payment requests), openTasks, overdueTasks, activeProjects, distractions (isDistraction && !DONE), topPriorities (top 5 due-soon tasks by priority), upcomingDeadlines (tasks + project eventDates + unpaid invoice dueDates within ±1d to +7d).
- **GET** returns `{ insights: [{id,type,severity,title,message,isRead,createdAt,entityType,entityId}], stats: {critical,warnings,info,unread}, contextSummary }`. Try/catch — never 5xx (returns 200 with empty arrays on error).
- **POST** accepts `{ action, message?, opportunityName? }`:
  - `daily_plan` — injects contextSummary as text + asks AI for markdown with Top 3 Priorities / Delegate / Defer / Risk to Watch.
  - `risk_check` — injects contextSummary + asks for top 5 risks with severity + recommended action.
  - `proposal_draft` — if opportunityName matches an Opportunity, fetches it (name, value, accountName, serviceType) and asks for a client-ready proposal outline (Project Overview / Scope / Deliverables / Timeline / Investment tiers / Terms). Falls back to generic template if no match.
  - `chat` — uses `message` field + system prompt + context summary.
- System prompt verbatim per spec (Operations Director for Digit One Zero Ltd, founder Adaeze Okonkwo, Naira, direct + concise).
- **SDK call wrapped in try/catch**: on failure returns `{ response: "AI service temporarily unavailable. Here's a cached recommendation: ...", error: true }` with HTTP 200 so the UI never crashes. `cachedFallback()` provides per-action fallback text.
- Returns `{ response: text }` JSON on success.

### UI component `ai-chief-of-staff.tsx`
- `"use client"` component, exported as `AiChiefOfStaff`. Fetches `/api/doz/ai` once in `useEffect` with `cancelled` guard (no direct setState in effect body — passes lint clean).
- **Hero banner** — Card with gradient `bg-gradient-to-br from-primary/10 via-primary/5 to-transparent`, border-primary/20. Sparkles icon in rounded tile, "AI Chief of Staff" title, "Your digital Operations Director" subtitle, and animated emerald Online status badge (ping dot).
- **Top KPI row (4 StatCards)** — Critical Alerts (danger), Warnings (warning), Open Tasks (primary, with overdue sub), Unread Insights.
- **Main layout `lg:grid-cols-3 gap-6`**:
  - **Left col (lg:col-span-2)**:
    1. **AI Console** card — SectionHeader + 4 action buttons in `grid grid-cols-2 sm:grid-cols-4 gap-2` (Daily Plan/Target, Risk Check/AlertTriangle, Draft Proposal/FileText, Ask Question/MessageSquare). When "Ask Question" toggled, shows Input + Send Button (form submit). Response area: either ThinkingIndicator (pulsing Sparkles + animated ping + bouncing dots) while busy, or the AI markdown response in a primary-tinted card with `MarkdownRender`, or a placeholder dashed card. Keeps a recent-exchanges list (last 6 messages, reversed) in a ScrollArea.
    2. **Active Insights** card — list with severity dot (red CRITICAL, amber WARNING, teal INFO), left border highlight (border-l-4), title, message, relativeTime, type badge (OVERDUE/BUDGET_OVERRUN/RISK/DISTRACTION/OPPORTUNITY with custom colors), "New" pill for unread. Max-h-28rem + scroll-thin.
  - **Right col**:
    1. **Live Context** card — list of 8 ContextRows (pipeline, outstanding, overdue, cash position, pending approvals, open tasks, active projects, distractions) with tone colors (primary/warning/danger). Plus Top priorities list and Upcoming deadlines list (CornerDownRight bullets).
    2. **Quick Prompts** card — 4 clickable suggestion chips ("What should I delegate today?", "Which project is at risk of going over budget?", "Draft a follow-up to GTBank", "Summarize this week's wins") that auto-fire as chat messages.
- **MarkdownRender** — custom component wrapping `react-markdown` with manual prose-like styling (h1/h2/h3, p, ul/ol with custom bullet `::before`, strong, em, code/pre, blockquote, hr, a, table). No typography plugin needed.
- **ThinkingIndicator** — pulsing Sparkles with animated ping ring + 3 bouncing dots.
- **State** — `busy` tracks which action is in-flight (disables buttons), `history` keeps last few exchanges, `chatMode` toggles the chat input, `lastResponse` shows current response. Uses `sonner` toast for errors and warning when AI falls back to cached.
- **Loading state** — full skeleton grid (hero, 4 KPIs, 2 left cards, 2 right cards). **Error state** — EmptyState with AlertTriangle icon.

## Testing
- Restarted dev server (port 3000) — Ready in 599ms, no errors.
- `curl -s -m 25 http://localhost:3000/api/doz/ai` → HTTP 200, returns 6 insights, stats `{critical:1, warnings:3, info:2, unread:6}`, contextSummary with `pipelineValue=₦113.8M, outstandingAmount=₦9.9M, overdueAmount=₦4.5M, cashPosition=₦9.52M, pendingApprovals=1, openTasks=15, overdueTasks=4, activeProjects=5, distractions=1, topPriorities=[3 items], upcomingDeadlines=[3 items]`.
- `curl -X POST /api/doz/ai -d '{"action":"daily_plan"}'` → HTTP 200 in ~3.2s. Response: full markdown with Top 3 Priorities (Approve MTN video edit PO, Finalize GTBank proposal, Approve vendor payment), Delegate (Finance/PM/Ops Lead), Defer (intern reports, WhatsApp batch), Risk to Watch (overdue invoices ₦4.5M). Real numbers, real project names — AI used the injected context.
- `curl -X POST /api/doz/ai -d '{"action":"risk_check"}'` → HTTP 200 in ~4.4s. Response: 5 risks with severity + recommended action, including CRITICAL overdue invoices (₦4.5M, 47% of cash position), CRITICAL GTBank proposal deadline, WARNING MTN PO approval, WARNING cash flow gap, INFO unmanaged distractions.
- `curl -X POST /api/doz/ai -d '{"action":"proposal_draft","opportunityName":"Shell"}'` → HTTP 200. Response: full client-ready proposal outline for the Shell opportunity (₦32M, EVENT_PRODUCTION) with Project Overview / Scope / Deliverables / Timeline (5 weeks phased) / 3 investment tiers (Standard ₦28M / Professional ₦32M / Premium ₦38M) / Terms (40-30-30 payment, cancellation, IP, force majeure covering Lagos power outages).
- `curl /` → HTTP 200, page renders (dev log shows `GET / 200 in 190ms`).
- `bun run lint` → **EXIT 0**, zero errors/warnings.

## Stage Summary
- API route returns the exact spec shape for GET, and dispatches the 4 actions correctly for POST.
- z-ai-web-dev-sdk is invoked server-side only (never imported in the client component). All SDK calls are wrapped in try/catch with graceful cached fallback (HTTP 200, `error: true` flag).
- UI is responsive (mobile-first), uses shadcn/ui components + shared DOZ primitives, manual markdown styling, animated loading states, transparent Live Context panel.
- Color discipline: emerald primary, amber warning, rose/red danger, teal info — NO indigo, NO blue.
- Module 9 is fully functional and is the AI layer that ties together the operating data from all other modules (CRM, Projects, Finance, Procurement, Tasks).
- Files touched: `src/app/api/doz/ai/route.ts` (new, ~280 lines), `src/components/modules/ai-chief-of-staff.tsx` (overwrote 1-line stub → ~570 lines).
