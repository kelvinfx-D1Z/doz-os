// KPI Computation Engine — calculates live values from real DB data
import { db } from "@/lib/db";

const cache = new Map<string, { value: number; ts: number }>();
const TTL = 5 * 60 * 1000;

async function cached(key: string, fn: () => Promise<number>): Promise<number> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.value;
  const value = await fn();
  cache.set(key, { value, ts: Date.now() });
  return value;
}

function monthStart() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }
function weekStart() { const n = new Date(); const d = n.getDay(); const diff = n.getDate() - d + (d === 0 ? -6 : 1); return new Date(n.getFullYear(), n.getMonth(), diff); }

export const KPI_COMPUTATIONS: Record<string, () => Promise<number>> = {
  "Annual Revenue": () => cached("kpi_rev", async () => { const r = await db.invoice.aggregate({ _sum: { amountPaid: true } }); return r._sum.amountPaid ?? 0; }),
  "Net Profit Margin": () => cached("kpi_pm", async () => { const [i,e] = await Promise.all([db.invoice.aggregate({ _sum: { amountPaid: true } }), db.expense.aggregate({ _sum: { amount: true } })]); const r=i._sum.amountPaid??0,c=e._sum.amount??0; return r===0?0:((r-c)/r)*100; }),
  "Average Contract Value": () => cached("kpi_acv", async () => { const p = await db.project.findMany({ where: { revenue: { gt: 0 } } }); return p.length? p.reduce((s,x)=>s+x.revenue,0)/p.length :0; }),
  "Gross Margin Per Project": () => cached("kpi_gm", async () => { const p = await db.project.findMany({ where: { revenue: { gt: 0 } }, include: { expenses: true } }); if(!p.length) return 0; return p.map(x=>{const c=x.expenses.reduce((s,e)=>s+e.amount,0); return x.revenue>0?((x.revenue-c)/x.revenue)*100:0;}).reduce((s,m)=>s+m,0)/p.length; }),
  "Outstanding Receivables (days)": () => cached("kpi_rd", async () => { const inv = await db.invoice.findMany({ where: { status: { in: ["SENT","PARTIAL","OVERDUE"] } } }); if(!inv.length) return 0; return Math.round(inv.reduce((s,i)=>s+(Date.now()-new Date(i.issuedDate).getTime())/86400000,0)/inv.length); }),
  "Corporate Clients": () => cached("kpi_cc", () => db.account.count()),
  "Strategic Enterprise Clients": () => cached("kpi_sc", () => db.account.count({ where: { isStrategic: true } })),
  "Monthly Qualified Leads": () => cached("kpi_mql", () => db.lead.count({ where: { createdAt: { gte: monthStart() } } })),
  "Proposal Win Rate": () => cached("kpi_wr", async () => { const [w,t] = await Promise.all([db.opportunity.count({ where: { stage: "WON" } }), db.opportunity.count({ where: { stage: { in: ["WON","LOST"] } } })]); return t===0?0:(w/t)*100; }),
  "Repeat Client Rate": () => cached("kpi_rcr", async () => { const a = await db.account.findMany({ include: { _count: { select: { projects: true } } } }); return a.length? (a.filter(x=>x._count.projects>=2).length/a.length)*100 :0; }),
  "Large Events Delivered": () => cached("kpi_led", () => db.project.count({ where: { status: "COMPLETED", serviceType: { in: ["EVENT_PRODUCTION","CONFERENCE_PRODUCTION","EVENT_MANAGEMENT"] } } })),
  "Documentaries Delivered": () => cached("kpi_dd", () => db.project.count({ where: { status: "COMPLETED", serviceType: "DOCUMENTARY" } })),
  "Corporate Videos Delivered": () => cached("kpi_cvd", () => db.project.count({ where: { status: "COMPLETED", serviceType: { in: ["CORPORATE_VIDEO","VIDEO_PRODUCTION"] } } })),
  "Referral Dependency": () => cached("kpi_rfd", async () => { const [r,t] = await Promise.all([db.opportunity.count({ where: { source: "REFERRAL" } }), db.opportunity.count()]); return t===0?0:(r/t)*100; }),
  "Marketing Generated Leads": () => cached("kpi_mgl", async () => { const [m,t] = await Promise.all([db.opportunity.count({ where: { source: { in: ["SOCIAL","COLD"] } } }), db.opportunity.count()]); return t===0?0:(m/t)*100; }),
  "Content Published (per week)": () => cached("kpi_cpw", () => db.contentLog.count({ where: { date: { gte: weekStart() } } })),
  "Campaign ROI": () => cached("kpi_croi", async () => { const c = await db.marketingCampaign.findMany(); return c.length? c.map(x=>x.spent>0?x.revenue/x.spent:0).reduce((s,r)=>s+r,0)/c.length :0; }),
  "Cash Position": () => cached("kpi_cash", async () => { const [r,e] = await Promise.all([db.invoice.aggregate({ _sum: { amountPaid: true } }), db.expense.aggregate({ _sum: { amount: true } })]); return (r._sum.amountPaid??0)-(e._sum.amount??0); }),
  "Outstanding Invoices": () => cached("kpi_oi", async () => { const inv = await db.invoice.findMany({ where: { status: { in: ["SENT","PARTIAL","OVERDUE"] } } }); return inv.reduce((s,i)=>s+(i.amount-i.amountPaid),0); }),
  "Projects On Time": () => cached("kpi_pot", async () => { const [d,t] = await Promise.all([db.project.count({ where: { status: "COMPLETED" } }), db.project.count({ where: { status: { in: ["COMPLETED","IN_PROGRESS"] } } })]); return t===0?0:(d/t)*100; }),
  "Budget Variance": () => cached("kpi_bv", async () => { const p = await db.project.findMany({ include: { expenses: true } }); return p.length? p.map(x=>{const s=x.expenses.reduce((a,e)=>a+e.amount,0); return x.budget>0?Math.abs((s-x.budget)/x.budget)*100:0;}).reduce((s,v)=>s+v,0)/p.length :0; }),
  "Procurement Compliance": () => cached("kpi_pc", async () => { const [t,w] = await Promise.all([db.paymentRequest.count(), db.paymentRequest.count({ where: { approverId: { not: null } } })]); return t===0?0:(w/t)*100; }),
  "Interns": () => cached("kpi_int", () => db.user.count({ where: { role: "INTERN", isActive: true } })),
  "Permanent Staff": () => cached("kpi_ps", () => db.user.count({ where: { role: { in: ["FOUNDER","STAFF"] }, isActive: true } })),
  "Core Freelancers": () => cached("kpi_cf", () => db.user.count({ where: { role: "FREELANCER", isActive: true } })),
  "SOP Completion": () => cached("kpi_sopc", async () => { const c = await db.sop.count(); return Math.min(100,(c/10)*100); }),
  "Intern Task Completion": () => cached("kpi_itc", async () => { const [d,t] = await Promise.all([db.task.count({ where: { status: "DONE", assignee: { role: "INTERN" } } }), db.task.count({ where: { assignee: { role: "INTERN" } } })]); return t===0?0:(d/t)*100; }),
  "Founder Operational Time": () => cached("kpi_fot", async () => { const l = await db.founderTimeLog.findMany({ where: { date: { gte: weekStart() } } }); const t=l.reduce((s,x)=>s+x.hours,0); const o=l.filter(x=>["OPERATIONS","DELIVERY","ADMINISTRATION"].includes(x.category)).reduce((s,x)=>s+x.hours,0); return t===0?90:(o/t)*100; }),
  "Founder Freedom Score": () => cached("kpi_ffs", async () => { const f = await db.user.findFirst({ where: { role: "FOUNDER" } }); if(!f) return 0; const [tp,wp,ap,dp,tk,st] = await Promise.all([db.project.count(),db.project.count({ where: { NOT: { managerId: f.id } } }),db.approval.count(),db.approval.count({ where: { NOT: { approverId: f.id } } }),db.task.count(),db.task.count({ where: { NOT: { assigneeId: f.id }, status: "DONE" } })]); const pp=tp>0?(wp/tp)*100:0,dp2=ap>0?(dp/ap)*100:0,sp=tk>0?(st/tk)*100:0; return Math.round(pp*0.25+dp2*0.20+sp*0.15+20); }),
  "Delegation Score": () => cached("kpi_ds", async () => { const f = await db.user.findFirst({ where: { role: "FOUNDER" } }); if(!f) return 0; const [t,d] = await Promise.all([db.task.count(),db.task.count({ where: { NOT: { assigneeId: f.id } } })]); return t===0?0:(d/t)*100; }),
  "Focus Score": () => cached("kpi_fs", async () => { const [t,s,d,l] = await Promise.all([db.task.count({ where: { status: { not: "DONE" } } }),db.task.count({ where: { status: { not: "DONE" }, category: "STRATEGIC" } }),db.task.count({ where: { status: { not: "DONE" }, isDistraction: true } }),db.task.count({ where: { status: { not: "DONE" }, goalId: { not: null } } })]); if(t===0) return 50; return Math.round((l/t)*40+(s/t)*30+Math.max(0,20-d*5)+10); }),
  "EventCo Platform Progress": () => cached("kpi_eco", () => Promise.resolve(5)),
  "EventCo Beta Users": () => cached("kpi_ecu", () => Promise.resolve(0)),
  "Proposal Conversion Rate": () => cached("kpi_pcr", async () => { const [s,w] = await Promise.all([db.proposal.count(),db.proposal.count({ where: { status: "ACCEPTED" } })]); return s===0?0:(w/s)*100; }),
  "Pipeline Coverage": () => cached("kpi_pco", async () => { const o = await db.opportunity.findMany({ where: { stage: { notIn: ["WON","LOST"] } } }); return (o.reduce((s,x)=>s+x.value,0)/120000000)*100; }),
  "Warm Prospects": () => cached("kpi_wp", () => db.opportunity.count({ where: { stage: { in: ["QUALIFIED","PROPOSAL","NEGOTIATION"] } } })),
  "Social Posts This Month": () => cached("kpi_spm", () => db.contentLog.count({ where: { date: { gte: monthStart() } } })),
  "Case Studies Published": () => cached("kpi_cs", () => db.sop.count({ where: { category: "CASE_STUDY" } })),
  "SOPs Documented": () => cached("kpi_sopd", () => db.sop.count()),
};

export async function computeAllKPIActuals(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  const entries = Object.entries(KPI_COMPUTATIONS);
  const settled = await Promise.allSettled(entries.map(async ([n,fn]) => { try { return [n, await fn()] as const; } catch { return [n, null] as const; } }));
  for (let i = 0; i < entries.length; i++) { const r = settled[i]; if (r.status === "fulfilled" && r.value[1] !== null) results[entries[i][0]] = r.value[1] as number; }
  return results;
}

export function clearKPICache() { cache.clear(); }
