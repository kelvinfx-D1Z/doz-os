import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Marketing & Growth API (DOZ OS — Task G3)
// Turns lead generation from passive (waiting for referrals) into
// an active engine: campaigns, content calendar, referral nurturing.
//
// GET  -> { stats, leadSourceBreakdown, campaigns, contentCalendar,
//           referralSources, growthMetrics }
// POST -> { action: "create_campaign" | "create_content" |
//           "create_referral" | "update_content" | "log_nurture" }
// ============================================================

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  // Week starts on Monday
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

// ---------------------------------------------------------------
// GET — full marketing dashboard payload
// ---------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);

    const [campaigns, contentItems, referralSources, opportunities] = await Promise.all([
      db.marketingCampaign.findMany({ orderBy: { createdAt: "desc" } }),
      db.contentCalendarItem.findMany({ orderBy: { scheduledDate: "asc" } }),
      db.referralSource.findMany({ orderBy: { nextNurtureDate: "asc" } }),
      db.opportunity.findMany({ select: { stage: true, value: true, source: true, createdAt: true } }),
    ]);

    // Look up assignee names for content items (assigneeId is a plain String, no relation)
    const assigneeIds = Array.from(
      new Set(contentItems.map((c) => c.assigneeId).filter((id): id is string => !!id))
    );
    const assignees = assigneeIds.length
      ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
      : [];
    const assigneeNameMap = new Map(assignees.map((a) => [a.id, a.name]));

    // ---------- Lead Source Breakdown ----------
    // Group existing opportunities by source: REFERRAL, EXISTING_CLIENT, NETWORKING, COLD, SOCIAL
    const SOURCE_ORDER = ["REFERRAL", "EXISTING_CLIENT", "NETWORKING", "COLD", "SOCIAL"];
    const sourceMap = new Map<string, { count: number; value: number; won: number }>();
    for (const s of SOURCE_ORDER) sourceMap.set(s, { count: 0, value: 0, won: 0 });
    for (const o of opportunities) {
      const key = (o.source || "REFERRAL").toUpperCase();
      if (!sourceMap.has(key)) sourceMap.set(key, { count: 0, value: 0, won: 0 });
      const bucket = sourceMap.get(key)!;
      bucket.count += 1;
      bucket.value += o.value;
      if (o.stage === "WON") bucket.won += 1;
    }
    const leadSourceBreakdown = SOURCE_ORDER.filter((s) => sourceMap.get(s)!.count > 0)
      .concat(SOURCE_ORDER.filter((s) => sourceMap.get(s)!.count === 0))
      .map((s) => {
        const b = sourceMap.get(s)!;
        return {
          source: s,
          count: b.count,
          value: b.value,
          conversionRate: b.count > 0 ? Math.round((b.won / b.count) * 1000) / 10 : 0,
          won: b.won,
        };
      });

    // ---------- Campaign stats ----------
    const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
    const totalLeadsGenerated = campaigns.reduce((sum, c) => sum + (c.leadsGenerated ?? 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions ?? 0), 0);
    const avgConversionRate =
      totalLeadsGenerated > 0
        ? Math.round((totalConversions / totalLeadsGenerated) * 1000) / 10
        : 0;
    const totalCampaignRevenue = campaigns.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const totalCampaignSpent = campaigns.reduce((sum, c) => sum + (c.spent ?? 0), 0);
    const totalCampaignROI =
      totalCampaignSpent > 0
        ? Math.round(((totalCampaignRevenue - totalCampaignSpent) / totalCampaignSpent) * 1000) / 10
        : 0;

    // Content this week = items with scheduledDate in [weekStart, weekEnd)
    const contentThisWeek = contentItems.filter((c) => {
      if (!c.scheduledDate) return false;
      const d = c.scheduledDate;
      return d >= weekStart && d < weekEnd;
    }).length;

    // Posts this month = published content items this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const postsThisMonth = contentItems.filter((c) => {
      if (!c.publishedDate) return false;
      return c.publishedDate >= monthStart;
    }).length;

    // Overdue nurtures = referral sources past their nextNurtureDate
    const overdueNurtureList = referralSources.filter(
      (r) => r.nextNurtureDate && r.nextNurtureDate < todayStart
    );
    const overdueNurtures = overdueNurtureList.length;

    // ---------- Growth metrics ----------
    // Pipeline = sum of value of open opportunities (not WON/LOST)
    const openOpps = opportunities.filter((o) => o.stage !== "WON" && o.stage !== "LOST");
    const wonOpps = opportunities.filter((o) => o.stage === "WON");
    const currentPipeline = openOpps.reduce((s, o) => s + o.value, 0);
    const wonValue = wonOpps.reduce((s, o) => s + o.value, 0);

    // Baseline pipeline = pipeline value of opportunities created 30+ days ago that are still open
    // (a rough proxy for "previous period" pipeline)
    const thirtyDaysAgo = addDays(now, -30);
    const baselineOpenOpps = openOpps.filter((o) => o.createdAt < thirtyDaysAgo);
    const baselinePipeline = baselineOpenOpps.reduce((s, o) => s + o.value, 0);
    const pipelineGrowthPct =
      baselinePipeline > 0
        ? Math.round(((currentPipeline - baselinePipeline) / baselinePipeline) * 1000) / 10
        : 0;
    const pipelineGrowth = `${pipelineGrowthPct > 0 ? "+" : ""}${pipelineGrowthPct}% vs last 30d`;

    const leadConversionRate =
      opportunities.length > 0
        ? Math.round((wonOpps.length / opportunities.length) * 1000) / 10
        : 0;
    const avgDealSize = wonOpps.length > 0 ? Math.round(wonValue / wonOpps.length) : 0;

    // Referral dependency = % of pipeline value from REFERRAL source
    const referralValue = opportunities
      .filter((o) => (o.source || "").toUpperCase() === "REFERRAL")
      .reduce((s, o) => s + o.value, 0);
    const totalOppValue = opportunities.reduce((s, o) => s + o.value, 0);
    const referralDependency =
      totalOppValue > 0 ? Math.round((referralValue / totalOppValue) * 1000) / 10 : 0;

    // Top performing source = highest conversion rate (with ≥1 opp)
    let topPerformingSource = "—";
    let topRate = -1;
    for (const b of leadSourceBreakdown) {
      if (b.count > 0 && b.conversionRate > topRate) {
        topRate = b.conversionRate;
        topPerformingSource = b.source.replace(/_/g, " ");
      }
    }

    // ---------- Campaigns with computed ROI ----------
    const campaignsShaped = campaigns.map((c) => {
      const roi =
        c.spent > 0 ? Math.round(((c.revenue - c.spent) / c.spent) * 1000) / 10 : null;
      const convRate =
        c.leadsGenerated > 0
          ? Math.round((c.conversions / c.leadsGenerated) * 1000) / 10
          : 0;
      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        budget: c.budget,
        spent: c.spent,
        leadsGenerated: c.leadsGenerated,
        conversions: c.conversions,
        revenue: c.revenue,
        roi,
        convRate,
        startDate: c.startDate?.toISOString() ?? null,
        endDate: c.endDate?.toISOString() ?? null,
        notes: c.notes,
      };
    });

    // ---------- Content calendar shaped ----------
    const contentShaped = contentItems.map((c) => ({
      id: c.id,
      title: c.title,
      platform: c.platform,
      type: c.type,
      status: c.status,
      scheduledDate: c.scheduledDate?.toISOString() ?? null,
      publishedDate: c.publishedDate?.toISOString() ?? null,
      topic: c.topic,
      assigneeId: c.assigneeId,
      assigneeName: c.assigneeId ? assigneeNameMap.get(c.assigneeId) ?? null : null,
      notes: c.notes,
    }));

    // ---------- Referral sources shaped ----------
    const referralShaped = referralSources.map((r) => {
      const overdue = r.nextNurtureDate ? r.nextNurtureDate < todayStart : false;
      return {
        id: r.id,
        name: r.name,
        contact: r.contact,
        relationship: r.relationship,
        totalValue: r.totalValue,
        referralCount: r.referralCount,
        lastContactAt: r.lastContactAt?.toISOString() ?? null,
        nextNurtureDate: r.nextNurtureDate?.toISOString() ?? null,
        overdue,
        notes: r.notes,
      };
    });

    return NextResponse.json({
      stats: {
        activeCampaigns,
        totalLeadsGenerated,
        totalConversions,
        avgConversionRate,
        totalCampaignRevenue,
        totalCampaignROI,
        contentThisWeek,
        referralSourcesActive: referralSources.length,
        overdueNurtures,
        postsThisMonth,
        contentGoalMonthly: 12,
      },
      leadSourceBreakdown,
      campaigns: campaignsShaped,
      contentCalendar: contentShaped,
      referralSources: referralShaped,
      growthMetrics: {
        pipelineGrowth,
        pipelineGrowthPct,
        currentPipeline,
        leadConversionRate,
        avgDealSize,
        referralDependency,
        topPerformingSource,
      },
    });
  } catch (err: any) {
    console.error("[marketing] GET error", err);
    return NextResponse.json(
      { error: "failed_to_load_marketing", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST — write actions
// ---------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action: string | undefined = body?.action;

  // =====================================================
  // create_campaign
  // =====================================================
  if (action === "create_campaign") {
    const name: string | undefined = body?.name?.trim();
    const channel: string | undefined = body?.channel;
    const budget: number | undefined = Number(body?.budget);
    const startDate: string | undefined = body?.startDate;
    const endDate: string | undefined = body?.endDate;

    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    if (!channel) return NextResponse.json({ error: "channel_required" }, { status: 400 });

    try {
      const c = await db.marketingCampaign.create({
        data: {
          name,
          channel,
          budget: isNaN(budget) ? 0 : budget,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });
      return NextResponse.json({ campaign: c }, { status: 201 });
    } catch (err: any) {
      console.error("[marketing] create_campaign error", err);
      return NextResponse.json(
        { error: "create_campaign_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // create_content
  // =====================================================
  if (action === "create_content") {
    const title: string | undefined = body?.title?.trim();
    const platform: string | undefined = body?.platform;
    const type: string | undefined = body?.type;
    const scheduledDate: string | undefined = body?.scheduledDate;
    const topic: string | undefined = body?.topic?.trim() || undefined;
    const assigneeId: string | undefined = body?.assigneeId || undefined;

    if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
    if (!platform) return NextResponse.json({ error: "platform_required" }, { status: 400 });
    if (!type) return NextResponse.json({ error: "type_required" }, { status: 400 });

    try {
      const c = await db.contentCalendarItem.create({
        data: {
          title,
          platform,
          type,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
          topic,
          assigneeId,
        },
      });
      return NextResponse.json({ content: c }, { status: 201 });
    } catch (err: any) {
      console.error("[marketing] create_content error", err);
      return NextResponse.json(
        { error: "create_content_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // create_referral
  // =====================================================
  if (action === "create_referral") {
    const name: string | undefined = body?.name?.trim();
    const contact: string | undefined = body?.contact?.trim() || undefined;
    const relationship: string | undefined = body?.relationship;
    const notes: string | undefined = body?.notes?.trim() || undefined;

    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

    try {
      const r = await db.referralSource.create({
        data: { name, contact, relationship, notes },
      });
      return NextResponse.json({ referral: r }, { status: 201 });
    } catch (err: any) {
      console.error("[marketing] create_referral error", err);
      return NextResponse.json(
        { error: "create_referral_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // update_content — advance status IDEA → DRAFTING → SCHEDULED → PUBLISHED
  // =====================================================
  if (action === "update_content") {
    const contentId: string | undefined = body?.contentId;
    const status: string | undefined = body?.status;

    if (!contentId) return NextResponse.json({ error: "contentId_required" }, { status: 400 });
    if (!status) return NextResponse.json({ error: "status_required" }, { status: 400 });

    const VALID = ["IDEA", "DRAFTING", "SCHEDULED", "PUBLISHED"];
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    try {
      const data: any = { status };
      if (status === "PUBLISHED") {
        data.publishedDate = new Date();
      }
      const updated = await db.contentCalendarItem.update({
        where: { id: contentId },
        data,
      });
      return NextResponse.json({ content: updated });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return NextResponse.json({ error: "content_not_found" }, { status: 404 });
      }
      console.error("[marketing] update_content error", err);
      return NextResponse.json(
        { error: "update_content_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // log_nurture — update lastContactAt=now, set nextNurtureDate
  // =====================================================
  if (action === "log_nurture") {
    const referralSourceId: string | undefined = body?.referralSourceId;
    const nextNurtureDate: string | undefined = body?.nextNurtureDate;

    if (!referralSourceId) {
      return NextResponse.json({ error: "referralSourceId_required" }, { status: 400 });
    }
    if (!nextNurtureDate) {
      return NextResponse.json({ error: "nextNurtureDate_required" }, { status: 400 });
    }

    try {
      const updated = await db.referralSource.update({
        where: { id: referralSourceId },
        data: {
          lastContactAt: new Date(),
          nextNurtureDate: new Date(nextNurtureDate),
        },
      });
      return NextResponse.json({ referral: updated });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return NextResponse.json({ error: "referral_not_found" }, { status: 404 });
      }
      console.error("[marketing] log_nurture error", err);
      return NextResponse.json(
        { error: "log_nurture_failed", detail: err?.message ?? String(err) },
        { status: 500 }
      );
    }
  }

  // =====================================================
  // add_seo_gap
  // =====================================================
  if (action === "add_seo_gap") {
    const keyword = body?.keyword?.trim();
    if (!keyword) return NextResponse.json({ error: "keyword_required" }, { status: 400 });
    const gap = await db.sEOGap.create({ data: { keyword, searchIntent: body.searchIntent || "informational", difficulty: body.difficulty || "MEDIUM" } });
    return NextResponse.json({ seoGap: gap }, { status: 201 });
  }

  // add_email_subscriber
  if (action === "add_email_subscriber") {
    const email = body?.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
    const existing = await db.emailSubscriber.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
    const sub = await db.emailSubscriber.create({ data: { email, name: body.name || null, source: body.source || "WEBSITE" } });
    return NextResponse.json({ subscriber: sub }, { status: 201 });
  }

  // add_partnership
  if (action === "add_partnership") {
    const partnerName = body?.partnerName?.trim();
    if (!partnerName) return NextResponse.json({ error: "partnerName_required" }, { status: 400 });
    const p = await db.partnership.create({ data: { partnerName, partnerType: body.partnerType || "CREATIVE_AGENCY", contactPerson: body.contactPerson || null, email: body.email || null, phone: body.phone || null, mutualBenefit: body.mutualBenefit || null, notes: body.notes || null } });
    return NextResponse.json({ partnership: p }, { status: 201 });
  }

  // update_partnership
  if (action === "update_partnership") {
    const partnershipId = body?.partnershipId;
    if (!partnershipId) return NextResponse.json({ error: "partnershipId_required" }, { status: 400 });
    const updated = await db.partnership.update({ where: { id: partnershipId }, data: { status: body.status, notes: body.notes } });
    return NextResponse.json({ partnership: updated });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
