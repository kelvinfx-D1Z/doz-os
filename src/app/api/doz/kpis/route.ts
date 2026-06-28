import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computeAllKPIActuals } from "@/lib/kpi-engine";

function formatVal(v: number, unit: string): string {
  if (unit === "NGN") return "₦" + (v >= 1_000_000 ? (v/1_000_000).toFixed(1)+"M" : v >= 1000 ? (v/1000).toFixed(0)+"K" : v.toFixed(0));
  if (unit === "PERCENT") return v.toFixed(0)+"%";
  if (unit === "DAYS") return Math.round(v)+" days";
  return String(Math.round(v));
}

const LOWER_IS_BETTER = new Set(["referral dependency","outstanding receivables (days)","budget variance","founder operational time","outstanding invoices"]);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kpis = await db.growthKPI.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const actuals = await computeAllKPIActuals();

  const liveKpis = kpis.map(k => {
    const computed = actuals[k.name];
    return computed !== undefined ? { ...k, current: computed } : k;
  });

  const computed = liveKpis.map(k => {
    const lower = LOWER_IS_BETTER.has(k.name.toLowerCase());
    let progressPct: number, status: string;
    if (lower) {
      if (k.current <= k.target) { progressPct = 100; status = "AHEAD"; }
      else { progressPct = k.target > 0 ? (k.target/k.current)*100 : 0; status = k.current > k.target * 1.2 ? "AT_RISK" : "BEHIND"; }
    } else {
      progressPct = k.target > 0 ? (k.current/k.target)*100 : 0;
      status = progressPct > 110 ? "AHEAD" : progressPct >= 90 ? "ON_TRACK" : progressPct >= 50 ? "BEHIND" : "AT_RISK";
    }
    return { ...k, progressPct: Math.round(progressPct), status, displayCurrent: formatVal(k.current, k.unit), displayTarget: formatVal(k.target, k.unit), lowerIsBetter: lower };
  });

  const byCategory: Record<string, any[]> = {};
  for (const k of computed) {
    if (!byCategory[k.category]) byCategory[k.category] = [];
    byCategory[k.category].push(k);
  }

  const keyMetrics = computed.filter(k => k.isKeyMetric);
  const summary = {
    ahead: computed.filter(k => k.status === "AHEAD").length,
    onTrack: computed.filter(k => k.status === "ON_TRACK").length,
    behind: computed.filter(k => k.status === "BEHIND").length,
    atRisk: computed.filter(k => k.status === "AT_RISK").length,
    total: computed.length,
  };

  return NextResponse.json({ kpis: computed, byCategory, keyMetrics, summary });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER" && user.role !== "STAFF") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.kpiId) return NextResponse.json({ error: "kpiId required" }, { status: 400 });

  const updated = await db.growthKPI.update({
    where: { id: body.kpiId },
    data: { current: Number(body.current) || 0 },
  });

  return NextResponse.json({ ok: true, kpi: updated });
}
