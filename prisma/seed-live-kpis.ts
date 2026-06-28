import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  console.log("Seeding live KPI targets + content logs...");
  const newKpis = [
    { name: "Proposal Conversion Rate", category: "SALES", current: 0, target: 25, yearOneTarget: 25, yearThreeTarget: 35, unit: "PERCENT", isKeyMetric: true },
    { name: "Pipeline Coverage", category: "FINANCE", current: 0, target: 300, yearOneTarget: 300, yearThreeTarget: 400, unit: "PERCENT", isKeyMetric: true },
    { name: "Warm Prospects", category: "SALES", current: 0, target: 20, yearOneTarget: 20, yearThreeTarget: 40, unit: "COUNT", isKeyMetric: false },
    { name: "Social Posts This Month", category: "MARKETING", current: 0, target: 12, yearOneTarget: 12, yearThreeTarget: 20, unit: "COUNT", weeklyPace: 3, isKeyMetric: true },
    { name: "Case Studies Published", category: "MARKETING", current: 0, target: 6, yearOneTarget: 6, yearThreeTarget: 15, unit: "COUNT", isKeyMetric: false },
    { name: "SOPs Documented", category: "OPERATIONS", current: 0, target: 10, yearOneTarget: 10, yearThreeTarget: 25, unit: "COUNT", isKeyMetric: false },
  ];
  for (const k of newKpis) { const ex = await db.growthKPI.findFirst({ where: { name: k.name } }); if (!ex) { await db.growthKPI.create({ data: k }); console.log(`  + ${k.name}`); } }
  const interns = await db.user.findMany({ where: { role: "INTERN" } });
  const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  if ((await db.contentLog.count()) === 0) {
    const posts = [
      { platform: "INSTAGRAM", title: "Behind the scenes: GTBank Annual Conference setup", date: new Date(ms.getTime()+2*86400000), internId: interns[0]?.id },
      { platform: "LINKEDIN", title: "5 lessons from producing 20 corporate events in Lagos", date: new Date(ms.getTime()+5*86400000), internId: interns[1]?.id },
      { platform: "INSTAGRAM", title: "MTN brand film — on-set photo dump", date: new Date(ms.getTime()+8*86400000), internId: interns[0]?.id },
      { platform: "LINKEDIN", title: "Why event production margins matter", date: new Date(ms.getTime()+10*86400000), internId: interns[2]?.id },
      { platform: "INSTAGRAM", title: "Lagos Chamber Annual Lecture — highlights", date: new Date(ms.getTime()+12*86400000), internId: interns[0]?.id },
      { platform: "YOUTUBE", title: "DOZ OS: How we run our production company", date: new Date(ms.getTime()+15*86400000), internId: interns[1]?.id },
    ];
    for (const p of posts) if (p.internId) await db.contentLog.create({ data: p });
    console.log(`  + ${posts.length} content logs`);
  }
  if ((await db.sop.count({ where: { category: "CASE_STUDY" } })) === 0) {
    await db.sop.create({ data: { title: "Case Study: Lagos Chamber Annual Lecture", category: "CASE_STUDY", content: "# Case Study\n\nClient: Lagos Chamber of Commerce\n\nResults: Event delivered on time, 200+ photos in 48h, margin 29%", tags: "case study" } });
    console.log("  + 1 case study");
  }
  console.log("Live KPI seed complete.");
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(async()=>{await db.$disconnect();});
