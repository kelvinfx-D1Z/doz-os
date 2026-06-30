import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — return cached monthly report or generate a rule-based one
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const cached = await db.monthlyReport.findFirst({
    where: { month: monthKey },
    orderBy: { generatedAt: "desc" },
  });

  if (cached) {
    return NextResponse.json({
      content: cached.content,
      month: cached.month,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  }

  // Generate rule-based monthly report
  const [invoices, expenses, opportunities, projects] = await Promise.all([
    db.invoice.findMany(),
    db.expense.aggregate({ _sum: { amount: true } }),
    db.opportunity.findMany(),
    db.project.findMany({ include: { expenses: true } }),
  ]);

  const revenue = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const costs = expenses._sum.amount ?? 0;
  const profit = revenue - costs;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
  const wonOpps = opportunities.filter(o => o.stage === "WON");
  const openPipeline = opportunities.filter(o => !["WON", "LOST"].includes(o.stage)).reduce((s, o) => s + o.value, 0);
  const projectMargins = projects.map(p => {
    const pcosts = p.expenses.reduce((s, e) => s + e.amount, 0);
    return { name: p.name, revenue: p.revenue, costs: pcosts, profit: p.revenue - pcosts, margin: p.revenue > 0 ? ((p.revenue - pcosts) / p.revenue * 100).toFixed(0) : 0 };
  });

  const content = `## Monthly Board Report — ${monthKey}

### Revenue
₦${revenue.toLocaleString()} collected this period

### Profit
₦${profit.toLocaleString()} (${margin}% margin)

### Cash Flow
- Inflows: ₦${revenue.toLocaleString()}
- Outflows: ₦${costs.toLocaleString()}
- Net: ₦${profit.toLocaleString()}

### Pipeline
- Open pipeline: ₦${openPipeline.toLocaleString()}
- Won opportunities: ${wonOpps.length}
- Total opportunities: ${opportunities.length}

### Project Margins
${projectMargins.map(p => `- ${p.name}: ₦${p.revenue.toLocaleString()} revenue, ${p.margin}% margin`).join("\n")}

### Recommendations
1. Focus on collecting overdue invoices
2. Increase marketing-generated leads to reduce referral dependency
3. Review project margins — identify loss-making projects
4. Accelerate pipeline follow-ups
5. Invest in content marketing for lead diversification`;

  const report = await db.monthlyReport.create({
    data: { month: monthKey, content },
  });

  return NextResponse.json({
    content,
    month: monthKey,
    generatedAt: report.generatedAt,
    cached: false,
  });
}
