import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Financial Intelligence — profit visibility by project, client & service.
// All aggregations computed in JS from fetched invoices + expenses + projects + budgets + accounts.
export async function GET() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [invoices, expenses, projects, budgets, accounts] = await Promise.all([
    db.invoice.findMany({ include: { account: true, project: true } }),
    db.expense.findMany({ include: { project: true, vendor: true } }),
    db.project.findMany({ include: { account: true } }),
    db.budget.findMany({ include: { project: true } }),
    db.account.findMany(),
  ]);

  // =====================================================
  // STATS
  // =====================================================
  const totalRevenue = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = totalRevenue - totalExpenses;
  const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const outstandingInvoices = invoices.filter((i) =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(i.status)
  );
  const outstandingAmount = outstandingInvoices.reduce(
    (s, i) => s + (i.amount - i.amountPaid),
    0
  );
  const overdueInvoices = invoices.filter((i) => i.status === "OVERDUE");
  const overdueAmount = overdueInvoices.reduce(
    (s, i) => s + (i.amount - i.amountPaid),
    0
  );
  const overdueCount = overdueInvoices.length;

  const cashPosition = totalRevenue - totalExpenses;

  const collectedThisMonth = invoices
    .filter((i) => i.paidDate && new Date(i.paidDate) >= monthStart)
    .reduce((s, i) => s + i.amountPaid, 0);
  const paidOutThisMonth = expenses
    .filter((e) => new Date(e.expenseDate) >= monthStart)
    .reduce((s, e) => s + e.amount, 0);

  // =====================================================
  // PROJECT P&L (group invoices + expenses by project)
  // =====================================================
  const projectAgg = new Map<string, { revenue: number; expenses: number }>();
  for (const inv of invoices) {
    if (!inv.projectId) continue;
    const cur = projectAgg.get(inv.projectId) ?? { revenue: 0, expenses: 0 };
    cur.revenue += inv.amount;
    projectAgg.set(inv.projectId, cur);
  }
  for (const exp of expenses) {
    if (!exp.projectId) continue;
    const cur = projectAgg.get(exp.projectId) ?? { revenue: 0, expenses: 0 };
    cur.expenses += exp.amount;
    projectAgg.set(exp.projectId, cur);
  }

  const projectPnl = projects
    .map((p) => {
      const agg = projectAgg.get(p.id) ?? { revenue: 0, expenses: 0 };
      const profit = agg.revenue - agg.expenses;
      const margin = agg.revenue > 0 ? (profit / agg.revenue) * 100 : 0;
      return {
        projectId: p.id,
        name: p.name,
        code: p.code ?? "—",
        serviceType: p.serviceType,
        revenue: agg.revenue,
        expenses: agg.expenses,
        profit,
        margin,
      };
    })
    .filter((p) => p.revenue > 0 || p.expenses > 0)
    .sort((a, b) => b.profit - a.profit);

  const profitableProjects = projectPnl.filter((p) => p.profit > 0).length;
  const lossProjects = projectPnl.filter((p) => p.profit < 0).length;
  const avgProjectMargin =
    projectPnl.length > 0
      ? projectPnl.reduce((s, p) => s + p.margin, 0) / projectPnl.length
      : 0;

  // =====================================================
  // CLIENT P&L (group by account)
  // =====================================================
  const clientAgg = new Map<
    string,
    { name: string; isStrategic: boolean; revenue: number; expenses: number }
  >();
  for (const inv of invoices) {
    if (!inv.accountId) continue;
    const acct = inv.account ?? accounts.find((a) => a.id === inv.accountId);
    if (!acct) continue;
    const cur =
      clientAgg.get(inv.accountId) ?? {
        name: acct.name,
        isStrategic: acct.isStrategic,
        revenue: 0,
        expenses: 0,
      };
    cur.revenue += inv.amount;
    clientAgg.set(inv.accountId, cur);
  }
  for (const exp of expenses) {
    const acctId = exp.project?.accountId;
    if (!acctId) continue;
    const acct = accounts.find((a) => a.id === acctId);
    if (!acct) continue;
    const cur =
      clientAgg.get(acctId) ?? {
        name: acct.name,
        isStrategic: acct.isStrategic,
        revenue: 0,
        expenses: 0,
      };
    cur.expenses += exp.amount;
    clientAgg.set(acctId, cur);
  }

  const clientPnl = Array.from(clientAgg.entries())
    .map(([accountId, agg]) => {
      const profit = agg.revenue - agg.expenses;
      const margin = agg.revenue > 0 ? (profit / agg.revenue) * 100 : 0;
      const projectCount = projects.filter(
        (p) =>
          p.accountId === accountId &&
          projectAgg.get(p.id) &&
          (projectAgg.get(p.id)!.revenue > 0 ||
            projectAgg.get(p.id)!.expenses > 0)
      ).length;
      return {
        accountId,
        name: agg.name,
        isStrategic: agg.isStrategic,
        revenue: agg.revenue,
        expenses: agg.expenses,
        profit,
        margin,
        projectCount,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  // =====================================================
  // SERVICE P&L (group by serviceType)
  // =====================================================
  const serviceMap = new Map<
    string,
    { revenue: number; expenses: number; projectCount: number }
  >();
  for (const p of projects) {
    const agg = projectAgg.get(p.id);
    if (!agg || (agg.revenue === 0 && agg.expenses === 0)) continue;
    const cur =
      serviceMap.get(p.serviceType) ?? {
        revenue: 0,
        expenses: 0,
        projectCount: 0,
      };
    cur.revenue += agg.revenue;
    cur.expenses += agg.expenses;
    cur.projectCount += 1;
    serviceMap.set(p.serviceType, cur);
  }
  const servicePnl = Array.from(serviceMap.entries())
    .map(([serviceType, agg]) => {
      const profit = agg.revenue - agg.expenses;
      const margin = agg.revenue > 0 ? (profit / agg.revenue) * 100 : 0;
      return {
        serviceType,
        revenue: agg.revenue,
        expenses: agg.expenses,
        profit,
        margin,
        projectCount: agg.projectCount,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // =====================================================
  // EXPENSE BY CATEGORY
  // =====================================================
  const expByCat = new Map<string, number>();
  for (const e of expenses) {
    expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + e.amount);
  }
  const expenseByCategory = Array.from(expByCat.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      pct: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // =====================================================
  // MONTHLY CASH FLOW (last 6 months, YYYY-MM)
  // =====================================================
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short" });
    months.push({ key, label, start, end });
  }
  const monthlyCashFlow = months.map((m) => {
    const rev = invoices
      .filter((i) => {
        const d = i.paidDate ?? (i.amountPaid > 0 ? i.issuedDate : null);
        return d && new Date(d) >= m.start && new Date(d) < m.end;
      })
      .reduce((s, i) => s + i.amountPaid, 0);
    const exp = expenses
      .filter((e) => new Date(e.expenseDate) >= m.start && new Date(e.expenseDate) < m.end)
      .reduce((s, e) => s + e.amount, 0);
    return { month: m.label, revenue: rev, expenses: exp, net: rev - exp };
  });

  // =====================================================
  // BUDGETS (budget vs spent, by project + category)
  // =====================================================
  const expenseByProjectCat = new Map<string, number>();
  for (const e of expenses) {
    if (!e.projectId) continue;
    const k = `${e.projectId}|${e.category}`;
    expenseByProjectCat.set(k, (expenseByProjectCat.get(k) ?? 0) + e.amount);
  }
  const budgetsOut = budgets
    .map((b) => {
      const spent = expenseByProjectCat.get(`${b.projectId}|${b.category}`) ?? 0;
      return {
        projectId: b.projectId,
        project: { name: b.project?.name ?? "—" },
        category: b.category,
        amount: b.amount,
        spent,
        utilization: b.amount > 0 ? (spent / b.amount) * 100 : 0,
      };
    })
    .sort((a, b) => b.utilization - a.utilization);

  // =====================================================
  // INVOICES + EXPENSES (formatted output)
  // =====================================================
  const invoicesOut = invoices
    .map((i) => ({
      id: i.id,
      code: i.code ?? "—",
      amount: i.amount,
      tax: i.tax,
      amountPaid: i.amountPaid,
      status: i.status,
      issuedDate: i.issuedDate,
      dueDate: i.dueDate,
      paidDate: i.paidDate,
      account: { name: i.account?.name ?? "—" },
      project: { name: i.project?.name ?? "—" },
    }))
    .sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime());

  const expensesOut = expenses
    .map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      expenseDate: e.expenseDate,
      isVerified: e.isVerified,
      project: { name: e.project?.name ?? "—" },
      vendor: { name: e.vendor?.name ?? "—" },
    }))
    .sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());

  return NextResponse.json({
    stats: {
      totalRevenue,
      totalExpenses,
      grossProfit,
      marginPct,
      outstandingAmount,
      overdueAmount,
      overdueCount,
      cashPosition,
      collectedThisMonth,
      paidOutThisMonth,
      avgProjectMargin,
      profitableProjects,
      lossProjects,
    },
    invoices: invoicesOut,
    expenses: expensesOut,
    projectPnl,
    clientPnl,
    servicePnl,
    expenseByCategory,
    monthlyCashFlow,
    budgets: budgetsOut,
  });
}
