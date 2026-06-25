"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import { formatNGN, formatDate, formatPct, isOverdue } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Receipt,
  Star,
  ArrowUpDown,
} from "lucide-react";

// ---------- Types ----------
interface Stats {
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  marginPct: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  cashPosition: number;
  collectedThisMonth: number;
  paidOutThisMonth: number;
  avgProjectMargin: number;
  profitableProjects: number;
  lossProjects: number;
}
interface Invoice {
  id: string;
  code: string;
  amount: number;
  tax: number;
  amountPaid: number;
  status: string;
  issuedDate: string;
  dueDate: string | null;
  paidDate: string | null;
  account: { name: string };
  project: { name: string };
}
interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  isVerified: boolean;
  project: { name: string };
  vendor: { name: string };
}
interface ProjectPnl {
  projectId: string;
  name: string;
  code: string;
  serviceType: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}
interface ClientPnl {
  accountId: string;
  name: string;
  isStrategic: boolean;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  projectCount: number;
}
interface ServicePnl {
  serviceType: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  projectCount: number;
}
interface ExpenseByCategory {
  category: string;
  amount: number;
  pct: number;
}
interface MonthlyCashFlow {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}
interface Budget {
  projectId: string;
  project: { name: string };
  category: string;
  amount: number;
  spent: number;
  utilization: number;
}
interface FinanceData {
  stats: Stats;
  invoices: Invoice[];
  expenses: Expense[];
  projectPnl: ProjectPnl[];
  clientPnl: ClientPnl[];
  servicePnl: ServicePnl[];
  expenseByCategory: ExpenseByCategory[];
  monthlyCashFlow: MonthlyCashFlow[];
  budgets: Budget[];
}

// ---------- Chart colors ----------
const CHART = {
  revenue: "#10b981", // emerald-500
  expenses: "#f43f5e", // rose-500
  net: "#f59e0b", // amber-500
};

const SERVICE_TONE: Record<string, string> = {
  EVENT_PRODUCTION: "bg-emerald-500/15 text-emerald-300",
  VIDEO_PRODUCTION: "bg-amber-500/15 text-amber-300",
  CONFERENCE_PRODUCTION: "bg-rose-500/15 text-rose-300",
  EVENT_MANAGEMENT: "bg-teal-500/15 text-teal-300",
  TITLE_SEQUENCE: "bg-violet-500/15 text-violet-300",
  COLOR_GRADING: "bg-fuchsia-500/15 text-fuchsia-300",
};

function ServiceBadge({ type }: { type: string }) {
  const tone = SERVICE_TONE[type] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ProfitCell({ value }: { value: number }) {
  return (
    <span
      className={
        value > 0
          ? "font-semibold text-emerald-400"
          : value < 0
            ? "font-semibold text-rose-400"
            : "text-muted-foreground"
      }
    >
      {formatNGN(value)}
    </span>
  );
}

function MarginCell({ value }: { value: number }) {
  const color =
    value >= 30
      ? "text-emerald-400"
      : value >= 10
        ? "text-amber-400"
        : value < 0
          ? "text-rose-400"
          : "text-muted-foreground";
  return <span className={`font-medium ${color}`}>{formatPct(value)}</span>;
}

function CashflowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold">{label}</p>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: CHART.revenue }} />
            Revenue
          </span>
          <span className="font-medium">{formatNGN(payload[0]?.payload.revenue ?? 0, true)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: CHART.expenses }} />
            Expenses
          </span>
          <span className="font-medium">{formatNGN(payload[0]?.payload.expenses ?? 0, true)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: CHART.net }} />
            Net
          </span>
          <span
            className={`font-medium ${(payload[0]?.payload.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}
          >
            {formatNGN(payload[0]?.payload.net ?? 0, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Skeleton ----------
function FinanceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

// ---------- Main ----------
export function Financial() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let alive = true;
    fetch("/api/doz/finance")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading || !data) return <FinanceSkeleton />;

  const { stats } = data;

  return (
    <div className="space-y-5">
      {/* KPI ROW */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Revenue"
          value={formatNGN(stats.totalRevenue, true)}
          icon={<Banknote className="h-4 w-4" />}
          sub="Collected (cash-in)"
          trend={{ value: formatPct(stats.marginPct) + " margin", positive: stats.marginPct >= 0 }}
          accent="primary"
        />
        <StatCard
          label="Total Expenses"
          value={formatNGN(stats.totalExpenses, true)}
          icon={<Receipt className="h-4 w-4" />}
          sub="All logged costs"
          trend={{ value: formatNGN(stats.paidOutThisMonth, true) + " this month", positive: false }}
          accent="default"
        />
        <StatCard
          label="Gross Profit"
          value={formatNGN(stats.grossProfit, true)}
          icon={<TrendingUp className="h-4 w-4" />}
          sub={`Margin ${formatPct(stats.marginPct)}`}
          accent={stats.grossProfit >= 0 ? "primary" : "danger"}
        />
        <StatCard
          label="Outstanding"
          value={formatNGN(stats.outstandingAmount, true)}
          icon={<AlertTriangle className="h-4 w-4" />}
          sub={`${stats.overdueCount} overdue · ${formatNGN(stats.overdueAmount, true)}`}
          accent={stats.overdueCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Cash Position"
          value={formatNGN(stats.cashPosition, true)}
          icon={<Wallet className="h-4 w-4" />}
          sub={stats.cashPosition >= 0 ? "Healthy" : "Negative — review"}
          accent={stats.cashPosition >= 0 ? "primary" : "danger"}
        />
        <StatCard
          label="Avg Project Margin"
          value={formatPct(stats.avgProjectMargin)}
          icon={<TrendingUp className="h-4 w-4" />}
          sub={`${stats.profitableProjects} profitable · ${stats.lossProjects} loss`}
          accent={stats.avgProjectMargin >= 20 ? "primary" : stats.avgProjectMargin >= 0 ? "warning" : "danger"}
        />
      </div>

      {/* TABS */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="scroll-thin h-auto w-full max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="project">Project P&L</TabsTrigger>
          <TabsTrigger value="client">Client P&L</TabsTrigger>
          <TabsTrigger value="service">Service P&L</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Cash flow chart */}
            <Card className="p-5 lg:col-span-2">
              <SectionHeader
                title="Cash Flow — Last 6 Months"
                description="Revenue (collected) vs Expenses, with net trend"
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.monthlyCashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatNGN(v, true)}
                      width={56}
                    />
                    <Tooltip content={<CashflowTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      iconType="circle"
                    />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART.revenue} radius={[3, 3, 0, 0]} barSize={18} />
                    <Bar dataKey="expenses" name="Expenses" fill={CHART.expenses} radius={[3, 3, 0, 0]} barSize={18} />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke={CHART.net}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART.net, strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Outstanding summary */}
            <Card className="p-5">
              <SectionHeader
                title="Outstanding Invoices"
                description="What clients still owe"
                icon={<AlertTriangle className="h-4 w-4" />}
              />
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Outstanding
                    </p>
                    <p className="mt-0.5 text-lg font-semibold">{formatNGN(stats.outstandingAmount, true)}</p>
                  </div>
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                      Overdue
                    </p>
                    <p className="mt-0.5 text-lg font-semibold text-rose-300">
                      {formatNGN(stats.overdueAmount, true)}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Overdue invoices</p>
                  {data.invoices.filter((i) => i.status === "OVERDUE").length === 0 ? (
                    <p className="text-xs text-emerald-400">No overdue invoices — all clear.</p>
                  ) : (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {data.invoices
                        .filter((i) => i.status === "OVERDUE")
                        .map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-rose-200">{inv.code}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {inv.account.name} · {inv.project.name}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-rose-300">
                                {formatNGN(inv.amount - inv.amountPaid, true)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">due {formatDate(inv.dueDate)}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Expense breakdown */}
          <Card className="p-5">
            <SectionHeader
              title="Expense Breakdown by Category"
              description="Where the money went"
              icon={<Receipt className="h-4 w-4" />}
            />
            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
              {data.expenseByCategory.length === 0 ? (
                <EmptyState icon={<Receipt className="h-5 w-5" />} title="No expenses logged" />
              ) : (
                data.expenseByCategory.map((c) => (
                  <div key={c.category} className="flex items-center gap-3 py-1.5">
                    <div className="w-28 shrink-0">
                      <p className="truncate text-xs font-medium">{c.category}</p>
                      <p className="text-[10px] text-muted-foreground">{formatPct(c.pct)}</p>
                    </div>
                    <div className="flex-1">
                      <MiniBar value={c.amount} max={data.expenseByCategory[0].amount} color="bg-amber-500" />
                    </div>
                    <div className="w-24 shrink-0 text-right text-xs font-medium">
                      {formatNGN(c.amount, true)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        {/* PROJECT P&L */}
        <TabsContent value="project" className="mt-4">
          <ProjectPnlTable rows={data.projectPnl} />
        </TabsContent>

        {/* CLIENT P&L */}
        <TabsContent value="client" className="mt-4">
          <ClientPnlTable rows={data.clientPnl} />
        </TabsContent>

        {/* SERVICE P&L */}
        <TabsContent value="service" className="mt-4">
          <ServicePnlView rows={data.servicePnl} />
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTable rows={data.invoices} />
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTable rows={data.expenses} />
        </TabsContent>

        {/* BUDGETS */}
        <TabsContent value="budgets" className="mt-4">
          <BudgetsView rows={data.budgets} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Project P&L ----------
function ProjectPnlTable({ rows }: { rows: ProjectPnl[] }) {
  const [sortKey, setSortKey] = useState<"profit" | "revenue" | "margin" | "name">("profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      let av: number | string = a[sortKey];
      let bv: number | string = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const toggle = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const renderSortHead = (k: typeof sortKey, label: string, className?: string) => (
    <TableHead key={k} className={className}>
      <button
        onClick={() => toggle(k)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground"
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "text-muted-foreground/50"}`} />
      </button>
    </TableHead>
  );

  return (
    <Card className="p-0">
      <div className="border-b border-border p-4">
        <SectionHeader
          title="Project Profit & Loss"
          description="Where you make — and lose — money. Sorted by profit by default."
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>
      {sorted.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No project P&L data" hint="No projects with invoices or expenses yet." />
        </div>
      ) : (
        <div className="scroll-thin max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[200px] text-xs font-semibold uppercase tracking-wider">Project</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Service</TableHead>
                {renderSortHead("revenue", "Revenue", "text-right")}
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Expenses</TableHead>
                {renderSortHead("profit", "Profit", "text-right")}
                {renderSortHead("margin", "Margin", "text-right")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => {
                const isLoss = p.profit < 0;
                return (
                  <TableRow
                    key={p.projectId}
                    className={isLoss ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-accent/30"}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ServiceBadge type={p.serviceType} />
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatNGN(p.revenue)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatNGN(p.expenses)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <ProfitCell value={p.profit} />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <MarginCell value={p.margin} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ---------- Client P&L ----------
function ClientPnlTable({ rows }: { rows: ClientPnl[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border p-4">
        <SectionHeader
          title="Client Profit & Loss"
          description="Revenue, cost & margin by account — see who pays the bills"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No client P&L data" />
        </div>
      ) : (
        <div className="scroll-thin max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Client</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Projects</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Revenue</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Expenses</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Profit</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.accountId} className="hover:bg-accent/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.isStrategic && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                          <Star className="h-2.5 w-2.5 fill-amber-300" />
                          Strategic
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{c.projectCount}</TableCell>
                  <TableCell className="text-right text-sm">{formatNGN(c.revenue)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatNGN(c.expenses)}</TableCell>
                  <TableCell className="text-right text-sm">
                    <ProfitCell value={c.profit} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <MarginCell value={c.margin} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ---------- Service P&L ----------
function ServicePnlView({ rows }: { rows: ServicePnl[] }) {
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader
          title="Service Mix — Revenue by Service Type"
          description="The 80/15/4/1 view of where revenue comes from"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div key={r.serviceType} className="flex items-center gap-3 py-1">
              <div className="w-44 shrink-0">
                <ServiceBadge type={r.serviceType} />
              </div>
              <div className="flex-1">
                <MiniBar
                  value={r.revenue}
                  max={totalRev}
                  color={r.profit >= 0 ? "bg-emerald-500" : "bg-rose-500"}
                />
              </div>
              <div className="w-28 shrink-0 text-right text-xs font-medium">
                {formatPct(totalRev > 0 ? (r.revenue / totalRev) * 100 : 0)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const isLoss = r.profit < 0;
          return (
            <Card
              key={r.serviceType}
              className={`p-5 ${isLoss ? "ring-1 ring-rose-500/30" : "ring-1 ring-emerald-500/20"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <ServiceBadge type={r.serviceType} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.projectCount} project{r.projectCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Revenue</span>
                  <span className="text-sm font-medium">{formatNGN(r.revenue, true)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Expenses</span>
                  <span className="text-sm font-medium text-muted-foreground">{formatNGN(r.expenses, true)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs font-medium">Profit</span>
                  <ProfitCell value={r.profit} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Margin</span>
                  <MarginCell value={r.margin} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {rows.length === 0 && (
        <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No service P&L yet" />
      )}
    </div>
  );
}

// ---------- Invoices ----------
function InvoicesTable({ rows }: { rows: Invoice[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border p-4">
        <SectionHeader
          title="Invoices"
          description="All invoices — overdue rows highlighted"
          icon={<FileText className="h-4 w-4" />}
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No invoices" />
        </div>
      ) : (
        <div className="scroll-thin max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Code</TableHead>
                <TableHead className="min-w-[180px] text-xs font-semibold uppercase tracking-wider">Project / Account</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Paid</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Balance</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Issued</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Due</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Paid On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => {
                const overdue = inv.status === "OVERDUE" || (inv.status !== "PAID" && inv.dueDate && isOverdue(inv.dueDate));
                const balance = inv.amount - inv.amountPaid;
                return (
                  <TableRow
                    key={inv.id}
                    className={
                      inv.status === "OVERDUE"
                        ? "bg-rose-500/5 hover:bg-rose-500/10"
                        : overdue
                          ? "bg-amber-500/5 hover:bg-amber-500/10"
                          : "hover:bg-accent/30"
                    }
                  >
                    <TableCell>
                      <span className="font-mono text-xs font-medium">{inv.code}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="truncate text-sm font-medium">{inv.project.name}</span>
                        <span className="text-[11px] text-muted-foreground">{inv.account.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatNGN(inv.amount)}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-400">
                      {inv.amountPaid > 0 ? formatNGN(inv.amountPaid) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {balance > 0 ? (
                        <span className={overdue ? "font-semibold text-rose-400" : "font-medium text-amber-400"}>
                          {formatNGN(balance)}
                        </span>
                      ) : (
                        <span className="text-emerald-400">₦0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(inv.issuedDate)}</TableCell>
                    <TableCell className="text-xs">
                      <span className={overdue ? "font-medium text-rose-400" : "text-muted-foreground"}>
                        {formatDate(inv.dueDate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-emerald-400">{formatDate(inv.paidDate)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ---------- Expenses ----------
function ExpensesTable({ rows }: { rows: Expense[] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const cats = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.category));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);

  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.category === filter);

  const CAT_TONE: Record<string, string> = {
    CREW: "bg-emerald-500/15 text-emerald-300",
    EQUIPMENT: "bg-amber-500/15 text-amber-300",
    VENDOR: "bg-rose-500/15 text-rose-300",
    LOGISTICS: "bg-teal-500/15 text-teal-300",
    MARKETING: "bg-fuchsia-500/15 text-fuchsia-300",
    ADMIN: "bg-violet-500/15 text-violet-300",
    OTHER: "bg-muted text-muted-foreground",
  };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
        <SectionHeader
          title="Expenses"
          description="All logged expenses with verification status"
          icon={<Receipt className="h-4 w-4" />}
        />
        <div className="scroll-thin flex max-w-full gap-1 overflow-x-auto">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === c
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<Receipt className="h-5 w-5" />} title="No expenses" />
        </div>
      ) : (
        <div className="scroll-thin max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[200px] text-xs font-semibold uppercase tracking-wider">Description</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
                <TableHead className="min-w-[160px] text-xs font-semibold uppercase tracking-wider">Project / Vendor</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Date</TableHead>
                <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className="hover:bg-accent/30">
                  <TableCell className="text-sm font-medium">{e.description}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        CAT_TONE[e.category] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="truncate text-xs">{e.project.name}</span>
                      <span className="text-[11px] text-muted-foreground">{e.vendor.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatNGN(e.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(e.expenseDate)}</TableCell>
                  <TableCell className="text-center">
                    {e.isVerified ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-400" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ---------- Budgets ----------
function BudgetsView({ rows }: { rows: Budget[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border p-4">
        <SectionHeader
          title="Budgets vs Spent"
          description="Per project, per category — over 100% utilization flagged red"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No budgets set" />
        </div>
      ) : (
        <div className="scroll-thin max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[180px] text-xs font-semibold uppercase tracking-wider">Project</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Budget</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Spent</TableHead>
                <TableHead className="min-w-[160px] text-xs font-semibold uppercase tracking-wider">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b, i) => {
                const over = b.utilization > 100;
                const danger = b.utilization > 100;
                const warn = b.utilization >= 80 && b.utilization <= 100;
                const color = danger ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <TableRow key={`${b.projectId}-${b.category}-${i}`} className="hover:bg-accent/30">
                    <TableCell className="text-sm font-medium">{b.project.name}</TableCell>
                    <TableCell>
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {b.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatNGN(b.amount)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={over ? "font-semibold text-rose-400" : ""}>{formatNGN(b.spent)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <MiniBar
                            value={Math.min(b.utilization, 100)}
                            max={100}
                            color={color}
                          />
                        </div>
                        <span
                          className={`w-14 shrink-0 text-right text-xs font-medium ${
                            danger ? "text-rose-400" : warn ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {formatPct(b.utilization)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
