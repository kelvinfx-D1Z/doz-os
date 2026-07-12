import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — 90-day cash flow forecast
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Cash flow forecast is FOUNDER-only — exposes cash position + forecast.
  if (user.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const day90 = new Date(now.getTime() + 90 * 86400000);

  // Fetch known inflows: outstanding invoices expected to be paid
  const outstandingInvoices = await db.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
    include: { account: true },
  });

  // Fetch known outflows: unpaid vendor costs, pending payment requests, recurring expenses
  const [unpaidVendorCosts, pendingPayments, recentExpenses] = await Promise.all([
    db.projectVendorCost.findMany({ where: { status: { in: ["UNPAID", "PARTIAL"] } } }),
    db.paymentRequest.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    db.expense.findMany({ take: 50, orderBy: { expenseDate: "desc" } }),
  ]);

  // Build forecast items
  const items: any[] = [];

  // Inflows: invoice payments (probability based on age)
  for (const inv of outstandingInvoices) {
    const balance = inv.amount - inv.amountPaid;
    if (balance <= 0) continue;
    const daysSinceIssued = Math.floor((now.getTime() - new Date(inv.issuedDate).getTime()) / 86400000);
    const probability = inv.status === "OVERDUE" ? 60 : inv.status === "PARTIAL" ? 80 : 70;
    items.push({
      date: inv.dueDate || new Date(now.getTime() + 14 * 86400000),
      description: `Invoice ${inv.code} — ${inv.account?.name || "Client"}`,
      type: "INFLOW",
      amount: balance,
      probability,
      category: "INVOICE_PAYMENT",
      source: "AUTO_INVOICE",
    });
  }

  // Outflows: unpaid vendor costs
  for (const vc of unpaidVendorCosts) {
    if (vc.balance <= 0) continue;
    items.push({
      date: new Date(now.getTime() + 7 * 86400000),
      description: `Vendor payment — ${vc.vendorName} (${vc.item})`,
      type: "OUTFLOW",
      amount: vc.balance,
      probability: 90,
      category: "VENDOR_PAYMENT",
      source: "AUTO_VENDOR",
    });
  }

  // Outflows: pending payment requests
  for (const pr of pendingPayments) {
    items.push({
      date: new Date(now.getTime() + 3 * 86400000),
      description: `Payment request ${pr.code} — ${pr.description || "Vendor"}`,
      type: "OUTFLOW",
      amount: pr.amount,
      probability: pr.status === "APPROVED" ? 95 : 70,
      category: "VENDOR_PAYMENT",
      source: "AUTO_PAYMENT_REQUEST",
    });
  }

  // Recurring expenses (estimate from recent patterns)
  const monthlyRecurring = recentExpenses
    .filter(e => ["ADMIN", "MARKETING"].includes(e.category))
    .reduce((s, e) => s + e.amount, 0) / 3; // average monthly

  if (monthlyRecurring > 0) {
    for (let i = 0; i < 3; i++) {
      items.push({
        date: new Date(now.getFullYear(), now.getMonth() + i + 1, 1),
        description: `Monthly recurring expenses (rent, subscriptions, admin)`,
        type: "OUTFLOW",
        amount: monthlyRecurring,
        probability: 100,
        category: "RECURRING",
        source: "AUTO_RECURRING",
      });
    }
  }

  // Sort by date
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute running balance
  const invoiceSum = (await db.invoice.aggregate({ _sum: { amountPaid: true } }))._sum;
  const expenseSum = (await db.expense.aggregate({ _sum: { amount: true } }))._sum;
  const currentCash = (invoiceSum.amountPaid ?? 0) - (expenseSum.amount ?? 0);

  let runningBalance = currentCash;
  const forecast = items.map(item => {
    const weighted = item.type === "INFLOW"
      ? item.amount * (item.probability / 100)
      : -item.amount * (item.probability / 100);
    runningBalance += weighted;
    return {
      ...item,
      weightedAmount: Math.round(weighted),
      runningBalance: Math.round(runningBalance),
    };
  });

  // Find shortfall points
  const shortfalls = forecast.filter(f => f.runningBalance < 0);

  // DIDI warning
  let didiWarning: { severity: string; message: string; recommendation: string } | null = null;
  if (shortfalls.length > 0) {
    const first = shortfalls[0];
    const daysUntil = Math.ceil((new Date(first.date).getTime() - now.getTime()) / 86400000);
    didiWarning = {
      severity: "CRITICAL",
      message: `Based on current projections, you'll have a cash shortfall in ${daysUntil} days (around ${first.date.toLocaleDateString()}). Running balance will be ₦${first.runningBalance.toLocaleString()}.`,
      recommendation: "Collect outstanding invoices immediately. Consider deferring non-essential payments.",
    };
  } else if (runningBalance < 5000000) {
    didiWarning = {
      severity: "WARNING",
      message: `Your projected cash position in 90 days is ₦${runningBalance.toLocaleString()}. This is below your ₦5M safety threshold.`,
      recommendation: "Monitor closely. Ensure all invoices are collected on time.",
    };
  }

  return NextResponse.json({
    currentCash,
    forecast,
    shortfalls,
    didiWarning,
    summary: {
      totalInflow: forecast.filter(f => f.type === "INFLOW").reduce((s, f) => s + f.weightedAmount, 0),
      totalOutflow: Math.abs(forecast.filter(f => f.type === "OUTFLOW").reduce((s, f) => s + f.weightedAmount, 0)),
      projectedEnd: runningBalance,
      itemCount: items.length,
    },
  });
}
