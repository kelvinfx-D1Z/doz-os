# Task 9 — Financial Intelligence Module (Agent: Finance Builder)

## Task
Build the Financial Intelligence module (API + UI) giving the founder profit visibility by project, client, and service.

## Work Log
- Read existing worklog, schema (Invoice/Expense/Budget/Project/Account), seed data (5 invoices, 17 expenses, 30 budgets across 5 projects), and shared primitives (StatCard, StatusBadge, MiniBar, formatNGN, etc.).
- **API route** `/api/doz/finance/route.ts`:
  - Single `Promise.all` fetch: invoices (with account+project), expenses (with project+vendor), projects (with account), budgets (with project), accounts.
  - Computes 13 stats: totalRevenue (sum of amountPaid), totalExpenses, grossProfit, marginPct, outstandingAmount (SENT/PARTIAL/OVERDUE), overdueAmount, overdueCount, cashPosition, collectedThisMonth (paidDate >= monthStart), paidOutThisMonth, avgProjectMargin, profitableProjects, lossProjects.
  - projectPnl: aggregates invoice.amount (billed) + expenses per project, sorted by profit desc.
  - clientPnl: groups by account via invoice.accountId + expense.project.accountId, includes isStrategic flag and project count.
  - servicePnl: groups by project.serviceType, includes projectCount (only projects with activity).
  - expenseByCategory: groups by Expense.category with pct of total.
  - monthlyCashFlow: last 6 months (YYYY-MM buckets) — revenue from amountPaid (using paidDate or issuedDate fallback), expenses by expenseDate.
  - budgets: per project+category, spent computed from expenses, utilization = spent/amount × 100, sorted by utilization desc.
- **UI component** `src/components/modules/financial.tsx` (overwrote stub, "use client"):
  - 6 StatCards (KPI row): Total Revenue, Total Expenses, Gross Profit (+ margin sub), Outstanding (overdue sub), Cash Position, Avg Project Margin.
  - 7 tabs: Overview, Project P&L, Client P&L, Service P&L, Invoices, Expenses, Budgets.
  - Overview: recharts `ComposedChart` (bars for revenue+expenses, line for net, 6-month), custom dark tooltip with chart colors emerald/rose/amber; Outstanding summary card with overdue list (red highlight); Expense breakdown with MiniBar per category.
  - Project P&L: sortable table (profit/revenue/margin/name), loss rows red-highlighted, ServiceBadge per row, sticky header, scrollable.
  - Client P&L: table with strategic star badge, profit/margin cells colored.
  - Service P&L: revenue mix MiniBar at top (80/15/4/1 view) + cards per serviceType.
  - Invoices: table with code, project/account, amount, paid (emerald), balance (rose if overdue), StatusBadge, issued/due/paid dates; OVERDUE rows red, near-due amber.
  - Expenses: table with category filter pills, project/vendor, amount, date, verified (CheckCircle2 emerald / AlertTriangle amber "Pending").
  - Budgets: table with budget/spent/utilization MiniBar (emerald < 80%, amber 80-100%, rose > 100%).
- Fixed ESLint `react-hooks/static-components` error by converting SortHead from a component declared in render to a `renderSortHead()` function returning JSX.
- Verified: API returns HTTP 200 in ~52ms with 13.9KB JSON; all aggregations computed correctly (4 projectPnl, 3 clientPnl, 4 servicePnl, 5 invoices, 17 expenses, 30 budgets, 5 over-budget items flagged). Lint clean for financial.tsx (1 unrelated error remains in projects-events.tsx, another agent's file).

## Stage Summary
- File: `src/app/api/doz/finance/route.ts` (≈300 lines)
- File: `src/components/modules/financial.tsx` (≈820 lines, full module)
- Stack verified: Next.js 16 App Router, Prisma, recharts (ComposedChart+Bar+Line), shadcn/ui (Table, Tabs, Card, Badge, Skeleton), lucide-react icons.
- Color discipline maintained: emerald primary/positive, rose danger/negative, amber warning — NO indigo/blue.
- All shared primitives from `@/components/doz/ui-primitives` and formatters from `@/lib/format` reused.
- Founder can now see: total ₦31.5M collected, ₦9.52M gross profit (30.2% margin), ₦9.9M outstanding (₦4.5M overdue), per-project profitability (MTN at 90.4% margin is the star), per-client P&L (Shell is biggest revenue but lowest margin), per-service mix, and 5 over-budget line items needing review.
