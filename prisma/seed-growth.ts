import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  console.log("Seeding growth framework...");
  const kpis = [
    { name: "Annual Revenue", category: "REVENUE", current: 38000000, target: 120000000, yearOneTarget: 120000000, yearThreeTarget: 500000000, unit: "NGN", weeklyPace: 2300000, isKeyMetric: true },
    { name: "Net Profit Margin", category: "REVENUE", current: 22, target: 25, yearOneTarget: 25, yearThreeTarget: 30, unit: "PERCENT", isKeyMetric: true },
    { name: "Average Contract Value", category: "REVENUE", current: 8500000, target: 15000000, yearOneTarget: 12000000, yearThreeTarget: 15000000, unit: "NGN", isKeyMetric: true },
    { name: "Gross Margin Per Project", category: "REVENUE", current: 25, target: 30, yearOneTarget: 30, yearThreeTarget: 35, unit: "PERCENT", isKeyMetric: true },
    { name: "Outstanding Receivables (days)", category: "REVENUE", current: 45, target: 30, yearOneTarget: 30, yearThreeTarget: 20, unit: "DAYS", isKeyMetric: false },
    { name: "Corporate Clients", category: "SALES", current: 8, target: 15, yearOneTarget: 15, yearThreeTarget: 40, unit: "COUNT", isKeyMetric: true },
    { name: "Strategic Enterprise Clients", category: "SALES", current: 3, target: 5, yearOneTarget: 5, yearThreeTarget: 10, unit: "COUNT", isKeyMetric: false },
    { name: "Monthly Qualified Leads", category: "SALES", current: 6, target: 20, yearOneTarget: 20, yearThreeTarget: 40, unit: "COUNT", weeklyPace: 5, isKeyMetric: true },
    { name: "Proposal Win Rate", category: "SALES", current: 20, target: 25, yearOneTarget: 25, yearThreeTarget: 35, unit: "PERCENT", isKeyMetric: true },
    { name: "Repeat Client Rate", category: "SALES", current: 40, target: 55, yearOneTarget: 55, yearThreeTarget: 70, unit: "PERCENT", isKeyMetric: true },
    { name: "Large Events Delivered", category: "SALES", current: 5, target: 20, yearOneTarget: 20, yearThreeTarget: 50, unit: "COUNT", isKeyMetric: false },
    { name: "Documentaries Delivered", category: "SALES", current: 1, target: 6, yearOneTarget: 6, yearThreeTarget: 15, unit: "COUNT", isKeyMetric: false },
    { name: "Corporate Videos Delivered", category: "SALES", current: 4, target: 15, yearOneTarget: 15, yearThreeTarget: 40, unit: "COUNT", isKeyMetric: false },
    { name: "Referral Dependency", category: "MARKETING", current: 70, target: 40, yearOneTarget: 55, yearThreeTarget: 40, unit: "PERCENT", isKeyMetric: true },
    { name: "Marketing Generated Leads", category: "MARKETING", current: 8, target: 35, yearOneTarget: 20, yearThreeTarget: 35, unit: "PERCENT", isKeyMetric: true },
    { name: "Content Published (per week)", category: "MARKETING", current: 1, target: 3, yearOneTarget: 3, yearThreeTarget: 5, unit: "COUNT", weeklyPace: 3, isKeyMetric: false },
    { name: "Campaign ROI", category: "MARKETING", current: 0, target: 3, yearOneTarget: 2, yearThreeTarget: 4, unit: "COUNT", isKeyMetric: false },
    { name: "Cash Position", category: "FINANCE", current: 12000000, target: 30000000, yearOneTarget: 20000000, yearThreeTarget: 80000000, unit: "NGN", isKeyMetric: true },
    { name: "Outstanding Invoices", category: "FINANCE", current: 4500000, target: 0, yearOneTarget: 2000000, yearThreeTarget: 0, unit: "NGN", isKeyMetric: false },
    { name: "Projects On Time", category: "OPERATIONS", current: 75, target: 90, yearOneTarget: 85, yearThreeTarget: 95, unit: "PERCENT", isKeyMetric: false },
    { name: "Budget Variance", category: "OPERATIONS", current: 12, target: 5, yearOneTarget: 8, yearThreeTarget: 5, unit: "PERCENT", isKeyMetric: false },
    { name: "Procurement Compliance", category: "OPERATIONS", current: 60, target: 100, yearOneTarget: 100, yearThreeTarget: 100, unit: "PERCENT", isKeyMetric: false },
    { name: "Interns", category: "PEOPLE", current: 3, target: 4, yearOneTarget: 4, yearThreeTarget: 8, unit: "COUNT", isKeyMetric: false },
    { name: "Permanent Staff", category: "PEOPLE", current: 1, target: 3, yearOneTarget: 3, yearThreeTarget: 10, unit: "COUNT", isKeyMetric: true },
    { name: "Core Freelancers", category: "PEOPLE", current: 7, target: 20, yearOneTarget: 15, yearThreeTarget: 30, unit: "COUNT", isKeyMetric: false },
    { name: "SOP Completion", category: "PEOPLE", current: 40, target: 100, yearOneTarget: 100, yearThreeTarget: 100, unit: "PERCENT", isKeyMetric: false },
    { name: "Intern Task Completion", category: "PEOPLE", current: 75, target: 90, yearOneTarget: 85, yearThreeTarget: 95, unit: "PERCENT", isKeyMetric: false },
    { name: "Founder Operational Time", category: "FOUNDER", current: 90, target: 50, yearOneTarget: 50, yearThreeTarget: 30, unit: "PERCENT", isKeyMetric: true },
    { name: "Founder Freedom Score", category: "FOUNDER", current: 15, target: 50, yearOneTarget: 50, yearThreeTarget: 80, unit: "PERCENT", isKeyMetric: true },
    { name: "Delegation Score", category: "FOUNDER", current: 20, target: 60, yearOneTarget: 60, yearThreeTarget: 85, unit: "PERCENT", isKeyMetric: false },
    { name: "Focus Score", category: "FOUNDER", current: 36, target: 75, yearOneTarget: 75, yearThreeTarget: 85, unit: "PERCENT", isKeyMetric: false },
    { name: "EventCo Platform Progress", category: "EVENTCO", current: 5, target: 100, yearOneTarget: 30, yearThreeTarget: 100, unit: "PERCENT", isKeyMetric: true },
    { name: "EventCo Beta Users", category: "EVENTCO", current: 0, target: 50, yearOneTarget: 20, yearThreeTarget: 500, unit: "COUNT", isKeyMetric: false },
  ];
  for (const k of kpis) { const ex = await db.growthKPI.findFirst({ where: { name: k.name } }); if (!ex) await db.growthKPI.create({ data: k }); }
  console.log(`Seeded ${kpis.length} KPIs`);

  const hiring = [
    { stage: 1, role: "Business Development Executive", reason: "Generate predictable revenue", successMetric: "20 qualified leads per month", status: "OPEN", salaryBudget: 250000, targetDate: new Date(Date.now()+30*86400000) },
    { stage: 2, role: "Finance & Operations Officer", reason: "Separate financial control from operations", successMetric: "100% procurement compliance", status: "FORECASTED", salaryBudget: 300000, targetDate: new Date(Date.now()+90*86400000) },
    { stage: 3, role: "Project Coordinator", reason: "Reduce founder involvement in delivery", successMetric: "Founder ops below 30%", status: "FORECASTED", salaryBudget: 250000, targetDate: new Date(Date.now()+150*86400000) },
    { stage: 4, role: "Marketing & Content Executive", reason: "Reduce referral dependence", successMetric: "35% leads from marketing", status: "FORECASTED", salaryBudget: 200000, targetDate: new Date(Date.now()+210*86400000) },
    { stage: 5, role: "Senior Producer", reason: "Manage simultaneous large productions", successMetric: "5 concurrent projects without founder", status: "FORECASTED", salaryBudget: 400000, targetDate: new Date(Date.now()+270*86400000) },
    { stage: 6, role: "Technology/Product Manager", reason: "Lead EventCo/Fiestivo", successMetric: "SaaS growth independent of production", status: "FORECASTED", salaryBudget: 350000, targetDate: new Date(Date.now()+365*86400000) },
  ];
  for (const h of hiring) { const ex = await db.hiringStage.findFirst({ where: { stage: h.stage } }); if (!ex) await db.hiringStage.create({ data: h }); }
  console.log(`Seeded ${hiring.length} hiring stages`);

  const founder = await db.user.findFirst({ where: { role: "FOUNDER" } });
  if (founder) {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const logs = [
      { category: "OPERATIONS", hours: 3.5, date: today, notes: "MTN shoot prep" },
      { category: "ADMINISTRATION", hours: 2, date: today, notes: "Invoice review" },
      { category: "SALES", hours: 1.5, date: today, notes: "GTBank follow-up" },
      { category: "OPERATIONS", hours: 4, date: new Date(today.getTime()-86400000), notes: "LCC event" },
      { category: "ADMINISTRATION", hours: 3, date: new Date(today.getTime()-86400000), notes: "Expenses" },
      { category: "STRATEGY", hours: 1, date: new Date(today.getTime()-86400000), notes: "EventCo planning" },
      { category: "SALES", hours: 2, date: new Date(today.getTime()-2*86400000), notes: "Shell meeting" },
      { category: "DELIVERY", hours: 5, date: new Date(today.getTime()-2*86400000), notes: "Title sequence review" },
    ];
    for (const t of logs) { await db.founderTimeLog.create({ data: { ...t, userId: founder.id } }); }
    console.log(`Seeded ${logs.length} time logs`);
  }

  const nudges = [
    { category: "FOUNDER_TIME", message: "Kelvin, you've spent 9 hours this week on administration. Target is below 4 hours. Recommend delegating invoice verification.", severity: "WARNING" },
    { category: "BD_ACTIVITY", message: "You attended six client meetings this week. Only one generated a proposal. Meeting-to-proposal conversion is 17%. Recommend improving qualification.", severity: "ACTION" },
    { category: "REFERRAL_DEP", message: "Referral dependence remains at 50%. Target is below 40%. Publish two LinkedIn case studies this week.", severity: "WARNING" },
    { category: "DELEGATION", message: "You completed only one business development activity. Target is five.", severity: "ACTION" },
  ];
  for (const n of nudges) { const ex = await db.aICoachingNudge.findFirst({ where: { message: n.message } }); if (!ex) await db.aICoachingNudge.create({ data: n }); }
  console.log(`Seeded ${nudges.length} coaching nudges`);
  console.log("Growth framework seed complete.");
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(async()=>{await db.$disconnect();});
