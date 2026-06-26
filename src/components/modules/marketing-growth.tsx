"use client";

// ============================================================
// Marketing & Growth Module (DOZ OS — Task G3)
// Turns lead generation from passive (70% referrals) into an
// active engine: campaigns, content calendar, referral nurturing,
// and the growth metrics that make referral dependency visible.
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import {
  formatNGN,
  formatDate,
  relativeTime,
  avatarColor,
} from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  TrendingUp,
  Calendar,
  Users,
  Gift,
  Mail,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Sparkles,
  Target,
  ArrowRight,
  Newspaper,
  Send,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface Stats {
  activeCampaigns: number;
  totalLeadsGenerated: number;
  totalConversions: number;
  avgConversionRate: number;
  totalCampaignRevenue: number;
  totalCampaignROI: number;
  contentThisWeek: number;
  referralSourcesActive: number;
  overdueNurtures: number;
}

interface LeadSourceRow {
  source: string;
  count: number;
  value: number;
  conversionRate: number;
  won: number;
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  budget: number;
  spent: number;
  leadsGenerated: number;
  conversions: number;
  revenue: number;
  roi: number | null;
  convRate: number;
  startDate: string | null;
  endDate: string | null;
  notes?: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  platform: string;
  type: string;
  status: string;
  scheduledDate: string | null;
  publishedDate: string | null;
  topic?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  notes?: string | null;
}

interface ReferralSource {
  id: string;
  name: string;
  contact?: string | null;
  relationship?: string | null;
  totalValue: number;
  referralCount: number;
  lastContactAt: string | null;
  nextNurtureDate: string | null;
  overdue: boolean;
  notes?: string | null;
}

interface GrowthMetrics {
  pipelineGrowth: string;
  pipelineGrowthPct: number;
  currentPipeline: number;
  leadConversionRate: number;
  avgDealSize: number;
  referralDependency: number;
  topPerformingSource: string;
}

interface MarketingPayload {
  stats: Stats;
  leadSourceBreakdown: LeadSourceRow[];
  campaigns: Campaign[];
  contentCalendar: ContentItem[];
  referralSources: ReferralSource[];
  growthMetrics: GrowthMetrics;
}

// ============================================================
// Constants — channel/platform/status metadata
// ============================================================
const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode; tile: string }> = {
  SOCIAL: { label: "Social", icon: <Instagram className="h-3 w-3" />, tile: "bg-pink-500/15 text-pink-400" },
  EMAIL: { label: "Email", icon: <Mail className="h-3 w-3" />, tile: "bg-amber-500/15 text-amber-400" },
  WHATSAPP: { label: "WhatsApp", icon: <Send className="h-3 w-3" />, tile: "bg-emerald-500/15 text-emerald-400" },
  REFERRAL: { label: "Referral", icon: <Gift className="h-3 w-3" />, tile: "bg-violet-500/15 text-violet-400" },
  NETWORKING: { label: "Networking", icon: <Users className="h-3 w-3" />, tile: "bg-teal-500/15 text-teal-400" },
  PAID_ADS: { label: "Paid Ads", icon: <Target className="h-3 w-3" />, tile: "bg-rose-500/15 text-rose-400" },
};

const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; tile: string }> = {
  INSTAGRAM: { label: "Instagram", icon: <Instagram className="h-3 w-3" />, tile: "bg-pink-500/15 text-pink-400" },
  LINKEDIN: { label: "LinkedIn", icon: <Linkedin className="h-3 w-3" />, tile: "bg-blue-500/15 text-blue-400" },
  YOUTUBE: { label: "YouTube", icon: <Youtube className="h-3 w-3" />, tile: "bg-red-500/15 text-red-400" },
  TWITTER: { label: "Twitter", icon: <Twitter className="h-3 w-3" />, tile: "bg-sky-500/15 text-sky-400" },
  BLOG: { label: "Blog", icon: <FileText className="h-3 w-3" />, tile: "bg-amber-500/15 text-amber-400" },
  EMAIL_NEWSLETTER: { label: "Newsletter", icon: <Newspaper className="h-3 w-3" />, tile: "bg-emerald-500/15 text-emerald-400" },
};

const CONTENT_STATUS_FLOW = ["IDEA", "DRAFTING", "SCHEDULED", "PUBLISHED"];

const CAMPAIGN_STATUSES = ["PLANNING", "ACTIVE", "COMPLETED", "PAUSED"];

const RELATIONSHIPS: Record<string, string> = {
  CLIENT: "bg-emerald-500/15 text-emerald-400",
  PARTNER: "bg-teal-500/15 text-teal-400",
  INDUSTRY_CONTACT: "bg-amber-500/15 text-amber-400",
  FRIEND: "bg-fuchsia-500/15 text-fuchsia-400",
};

// ============================================================
// Main Component
// ============================================================
export function MarketingGrowth() {
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [tab, setTab] = useState("overview");

  // Dialog state
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [contentDialog, setContentDialog] = useState(false);
  const [referralDialog, setReferralDialog] = useState(false);
  const [nurtureDialog, setNurtureDialog] = useState<ReferralSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/doz/marketing", { cache: "no-store" });
      if (!res.ok) throw new Error(`status_${res.status}`);
      const json = await res.json();
      if (!cancelled) setData(json);
    } catch (e: any) {
      toast.error("Failed to load marketing data", { description: e?.message });
    } finally {
      if (!cancelled) setLoading(false);
    }
  }, [cancelled]);

  useEffect(() => {
    setCancelled(false);
    load();
    return () => setCancelled(true);
  }, [load]);

  async function postAction(body: any, successMsg: string) {
    try {
      const res = await fetch("/api/doz/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `status_${res.status}`);
      }
      toast.success(successMsg);
      await load();
      return true;
    } catch (e: any) {
      toast.error("Action failed", { description: e?.message });
      return false;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Marketing & Growth</h1>
            <p className="text-sm text-muted-foreground">
              Turn referrals into a predictable lead engine
            </p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      {loading || !data ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Active Campaigns"
            value={data.stats.activeCampaigns}
            sub={`${data.campaigns.length} total`}
            icon={<Megaphone className="h-4 w-4" />}
            accent="primary"
          />
          <StatCard
            label="Leads Generated"
            value={data.stats.totalLeadsGenerated}
            sub={`${data.stats.totalConversions} converted`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Conversion Rate"
            value={`${data.stats.avgConversionRate}%`}
            sub="across all campaigns"
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            label="Campaign Revenue"
            value={formatNGN(data.stats.totalCampaignRevenue, true)}
            sub={`ROI ${data.stats.totalCampaignROI}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            accent={data.stats.totalCampaignROI >= 0 ? "primary" : "danger"}
          />
          <StatCard
            label="Content This Week"
            value={data.stats.contentThisWeek}
            sub={`${data.contentCalendar.length} scheduled`}
            icon={<Calendar className="h-4 w-4" />}
          />
          <StatCard
            label="Referral Sources"
            value={data.stats.referralSourcesActive}
            sub={
              data.stats.overdueNurtures > 0
                ? `${data.stats.overdueNurtures} need nurturing`
                : "all nurtured"
            }
            icon={<Gift className="h-4 w-4" />}
            accent={data.stats.overdueNurtures > 0 ? "warning" : "primary"}
            onClick={() => setTab("referrals")}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="content">Content Calendar</TabsTrigger>
          <TabsTrigger value="referrals">Referral Sources</TabsTrigger>
        </TabsList>

        {/* ============================== Overview ============================== */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {loading || !data ? (
            <OverviewSkeleton />
          ) : (
            <>
              {/* Lead Source Breakdown */}
              <Card className="p-5">
                <SectionHeader
                  title="Lead Source Breakdown"
                  description="Where your opportunities come from — and which convert best"
                  icon={<Users className="h-5 w-5" />}
                />
                <div className="mt-4 space-y-3">
                  <LeadSourceBars rows={data.leadSourceBreakdown} />
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Growth Metrics */}
                <Card className="p-5">
                  <SectionHeader
                    title="Growth Metrics"
                    description="Health of the lead engine"
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <GrowthMetric
                      label="Pipeline Growth"
                      value={data.growthMetrics.pipelineGrowth}
                      hint={`Current pipeline: ${formatNGN(data.growthMetrics.currentPipeline, true)}`}
                      positive={data.growthMetrics.pipelineGrowthPct >= 0}
                    />
                    <GrowthMetric
                      label="Lead Conversion Rate"
                      value={`${data.growthMetrics.leadConversionRate}%`}
                      hint="won / total opportunities"
                    />
                    <GrowthMetric
                      label="Avg Deal Size"
                      value={formatNGN(data.growthMetrics.avgDealSize, true)}
                      hint="average won opportunity"
                    />
                    <GrowthMetric
                      label="Referral Dependency"
                      value={`${data.growthMetrics.referralDependency}%`}
                      hint={
                        data.growthMetrics.referralDependency >= 60
                          ? "High — diversify to reduce risk"
                          : data.growthMetrics.referralDependency >= 40
                            ? "Moderate — keep nurturing + diversify"
                            : "Healthy mix of sources"
                      }
                      danger={data.growthMetrics.referralDependency >= 60}
                    />
                    <GrowthMetric
                      label="Top Performing Source"
                      value={data.growthMetrics.topPerformingSource}
                      hint="highest conversion rate"
                    />
                  </div>
                </Card>

                {/* Overdue Nurtures */}
                <Card
                  className={cn(
                    "p-5",
                    data.referralSources.filter((r) => r.overdue).length > 0 &&
                      "border-amber-500/40 bg-amber-500/[0.03]"
                  )}
                >
                  <SectionHeader
                    title="Overdue Nurtures"
                    description="Referrers past their next-contact date"
                    icon={<AlertTriangle className="h-5 w-5" />}
                    action={
                      data.referralSources.filter((r) => r.overdue).length > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-400">
                          {data.referralSources.filter((r) => r.overdue).length} overdue
                        </Badge>
                      ) : undefined
                    }
                  />
                  <div className="mt-4">
                    {data.referralSources.filter((r) => r.overdue).length === 0 ? (
                      <EmptyState
                        icon={<CheckCircle2 className="h-6 w-6" />}
                        title="All referrers nurtured"
                        hint="No overdue contacts. You're staying top of mind."
                      />
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          These referrers haven't been contacted — nurture them this week.
                        </p>
                        {data.referralSources
                          .filter((r) => r.overdue)
                          .map((r) => (
                            <OverdueNurtureCard
                              key={r.id}
                              referral={r}
                              onLogContact={() => setNurtureDialog(r)}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ============================== Campaigns ============================== */}
        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCampaignDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Campaign
            </Button>
          </div>
          {loading || !data ? (
            <CardsSkeleton count={3} />
          ) : data.campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-6 w-6" />}
              title="No campaigns yet"
              hint="Plan your first campaign — Instagram showcase, LinkedIn thought leadership, or a referral reward program."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onStatusChange={async (status) => {
                    // We don't have a direct update_campaign action; reuse create_campaign flow is wrong.
                    // For now, we only display status changes via a toast (no PATCH yet).
                    toast.info(`Status update to ${status} — coming next iteration`);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================== Content Calendar ============================== */}
        <TabsContent value="content" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setContentDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Content
            </Button>
          </div>
          {loading || !data ? (
            <CardsSkeleton count={3} />
          ) : (
            <ContentGroups
              items={data.contentCalendar}
              onAdvance={async (item) => {
                const idx = CONTENT_STATUS_FLOW.indexOf(item.status);
                if (idx < 0 || idx >= CONTENT_STATUS_FLOW.length - 1) return;
                const next = CONTENT_STATUS_FLOW[idx + 1];
                await postAction(
                  { action: "update_content", contentId: item.id, status: next },
                  `Marked as ${next}`
                );
              }}
            />
          )}
        </TabsContent>

        {/* ============================== Referral Sources ============================== */}
        <TabsContent value="referrals" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setReferralDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Referral Source
            </Button>
          </div>
          {loading || !data ? (
            <CardsSkeleton count={3} />
          ) : data.referralSources.length === 0 ? (
            <EmptyState
              icon={<Gift className="h-6 w-6" />}
              title="No referral sources yet"
              hint="Add the people who send you business — clients, partners, industry contacts — and schedule nurture touchpoints."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.referralSources
                .slice()
                .sort((a, b) => {
                  // overdue first, then by nextNurtureDate asc
                  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
                  const ad = a.nextNurtureDate ? new Date(a.nextNurtureDate).getTime() : Infinity;
                  const bd = b.nextNurtureDate ? new Date(b.nextNurtureDate).getTime() : Infinity;
                  return ad - bd;
                })
                .map((r) => (
                  <ReferralCard
                    key={r.id}
                    referral={r}
                    onLogContact={() => setNurtureDialog(r)}
                  />
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============================== Dialogs ============================== */}
      <NewCampaignDialog
        open={campaignDialog}
        onOpenChange={setCampaignDialog}
        onSubmit={async (payload) => {
          const ok = await postAction(
            { action: "create_campaign", ...payload },
            "Campaign created"
          );
          if (ok) setCampaignDialog(false);
        }}
      />
      <NewContentDialog
        open={contentDialog}
        onOpenChange={setContentDialog}
        onSubmit={async (payload) => {
          const ok = await postAction(
            { action: "create_content", ...payload },
            "Content added to calendar"
          );
          if (ok) setContentDialog(false);
        }}
      />
      <NewReferralDialog
        open={referralDialog}
        onOpenChange={setReferralDialog}
        onSubmit={async (payload) => {
          const ok = await postAction(
            { action: "create_referral", ...payload },
            "Referral source added"
          );
          if (ok) setReferralDialog(false);
        }}
      />
      <LogNurtureDialog
        referral={nurtureDialog}
        onOpenChange={(open) => !open && setNurtureDialog(null)}
        onSubmit={async (nextDate) => {
          if (!nurtureDialog) return;
          const ok = await postAction(
            {
              action: "log_nurture",
              referralSourceId: nurtureDialog.id,
              nextNurtureDate: nextDate,
            },
            "Nurture logged"
          );
          if (ok) setNurtureDialog(null);
        }}
      />
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function LeadSourceBars({ rows }: { rows: LeadSourceRow[] }) {
  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  const topSource = useMemo(() => {
    let best: LeadSourceRow | null = null;
    for (const r of rows) {
      if (r.count > 0 && (!best || r.conversionRate > best.conversionRate)) best = r;
    }
    return best?.source ?? null;
  }, [rows]);

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const isTop = r.source === topSource;
        return (
          <div
            key={r.source}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              isTop ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card/50"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{r.source.replace(/_/g, " ")}</span>
                {isTop && (
                  <Badge className="bg-primary/15 text-primary">
                    <Sparkles className="mr-1 h-3 w-3" /> Top
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{r.count} opps</span>
                <span>{formatNGN(r.value, true)}</span>
                <span className={cn("font-semibold", r.conversionRate > 0 ? "text-primary" : "")}>
                  {r.conversionRate}%
                </span>
              </div>
            </div>
            <div className="mt-2">
              <MiniBar
                value={r.value}
                max={maxValue}
                color={isTop ? "bg-primary" : "bg-muted-foreground/40"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GrowthMetric({
  label,
  value,
  hint,
  positive,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tracking-tight",
          danger && "text-amber-400",
          positive === true && "text-primary",
          positive === false && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OverdueNurtureCard({
  referral,
  onLogContact,
}: {
  referral: ReferralSource;
  onLogContact: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{referral.name}</span>
          <span className="text-xs text-amber-400">
            {referral.nextNurtureDate ? relativeTime(referral.nextNurtureDate) : "no schedule"}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {referral.contact || "No contact info"} · {formatNGN(referral.totalValue, true)} referred
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onLogContact} className="gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Log Contact
      </Button>
    </div>
  );
}

function CampaignCard({
  campaign,
  onStatusChange,
}: {
  campaign: Campaign;
  onStatusChange: (status: string) => void;
}) {
  const ch = CHANNEL_META[campaign.channel] ?? CHANNEL_META.SOCIAL;
  const roi = campaign.roi;
  const roiColor = roi === null ? "text-muted-foreground" : roi >= 1 ? "text-emerald-400" : "text-rose-400";

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{campaign.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", ch.tile)}>
              {ch.icon} {ch.label}
            </span>
            <StatusBadge status={campaign.status} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Budget / Spent</p>
          <p className="mt-0.5 font-semibold">
            {formatNGN(campaign.budget, true)} <span className="text-muted-foreground">/ {formatNGN(campaign.spent, true)}</span>
          </p>
          <div className="mt-1.5">
            <MiniBar value={campaign.spent} max={Math.max(campaign.budget, 1)} color="bg-amber-500" />
          </div>
        </div>
        <div>
          <p className="text-muted-foreground">Leads / Conversions</p>
          <p className="mt-0.5 font-semibold">
            {campaign.leadsGenerated} <span className="text-muted-foreground">/ {campaign.conversions}</span>
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Conv rate: <span className="font-semibold text-foreground">{campaign.convRate}%</span>
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Revenue</p>
          <p className="mt-0.5 font-semibold">{formatNGN(campaign.revenue, true)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">ROI</p>
          <p className={cn("mt-0.5 font-semibold", roiColor)}>
            {roi === null ? "—" : `${roi}%`}
          </p>
        </div>
      </div>

      {campaign.startDate && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {formatDate(campaign.startDate)}
          {campaign.endDate ? ` → ${formatDate(campaign.endDate)}` : ""}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
        {CAMPAIGN_STATUSES.filter((s) => s !== campaign.status).map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={() => onStatusChange(s)}
          >
            Set {s.toLowerCase()}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ContentGroups({
  items,
  onAdvance,
}: {
  items: ContentItem[];
  onAdvance: (item: ContentItem) => void;
}) {
  const now = new Date();
  const startOfWeek = useMemo(() => {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }, []);
  const endOfNextWeek = new Date(startOfWeek.getTime() + 14 * 86400000);

  const groups = useMemo(() => {
    const thisWeek: ContentItem[] = [];
    const nextWeek: ContentItem[] = [];
    const backlog: ContentItem[] = [];
    const published: ContentItem[] = [];
    for (const i of items) {
      if (i.status === "PUBLISHED") {
        published.push(i);
        continue;
      }
      if (!i.scheduledDate) {
        backlog.push(i);
        continue;
      }
      const d = new Date(i.scheduledDate);
      if (d < startOfWeek) {
        backlog.push(i);
      } else if (d < endOfNextWeek) {
        if (d < new Date(startOfWeek.getTime() + 7 * 86400000)) {
          thisWeek.push(i);
        } else {
          nextWeek.push(i);
        }
      } else {
        backlog.push(i);
      }
    }
    return { thisWeek, nextWeek, backlog, published };
  }, [items, startOfWeek, endOfNextWeek]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-6 w-6" />}
        title="No content yet"
        hint="Plan your Instagram reels, LinkedIn posts, and email newsletters — keep the engine running."
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.thisWeek.length > 0 && (
        <ContentGroup
          title="This Week"
          icon={<Clock className="h-4 w-4 text-amber-400" />}
          items={groups.thisWeek}
          onAdvance={onAdvance}
        />
      )}
      {groups.nextWeek.length > 0 && (
        <ContentGroup
          title="Next Week"
          icon={<Calendar className="h-4 w-4 text-teal-400" />}
          items={groups.nextWeek}
          onAdvance={onAdvance}
        />
      )}
      {groups.backlog.length > 0 && (
        <ContentGroup
          title="Backlog"
          icon={<Plus className="h-4 w-4 text-muted-foreground" />}
          items={groups.backlog}
          onAdvance={onAdvance}
        />
      )}
      {groups.published.length > 0 && (
        <ContentGroup
          title="Recently Published"
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          items={groups.published}
          onAdvance={onAdvance}
        />
      )}
    </div>
  );
}

function ContentGroup({
  title,
  icon,
  items,
  onAdvance,
}: {
  title: string;
  icon: React.ReactNode;
  items: ContentItem[];
  onAdvance: (item: ContentItem) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} onAdvance={() => onAdvance(item)} />
        ))}
      </div>
    </div>
  );
}

function ContentCard({ item, onAdvance }: { item: ContentItem; onAdvance: () => void }) {
  const p = PLATFORM_META[item.platform] ?? PLATFORM_META.BLOG;
  const idx = CONTENT_STATUS_FLOW.indexOf(item.status);
  const canAdvance = idx >= 0 && idx < CONTENT_STATUS_FLOW.length - 1;
  const nextStatus = canAdvance ? CONTENT_STATUS_FLOW[idx + 1] : null;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{item.title}</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", p.tile)}>
          {p.icon} {p.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} />
        <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
        {item.topic && (
          <span className="text-[11px] text-muted-foreground">{item.topic}</span>
        )}
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        {item.scheduledDate ? (
          <>
            <Clock className="mr-1 inline h-3 w-3" />
            {formatDate(item.scheduledDate)}
            {item.publishedDate && (
              <span className="ml-2 text-primary">
                · published {formatDate(item.publishedDate)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/70">No date</span>
        )}
      </div>

      {item.assigneeName && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          <Users className="mr-1 inline h-3 w-3" />
          {item.assigneeName}
        </p>
      )}

      {canAdvance && (
        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={onAdvance} className="gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" /> Mark as {nextStatus?.toLowerCase()}
          </Button>
        </div>
      )}
      {!canAdvance && item.status === "PUBLISHED" && (
        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
            <CheckCircle2 className="h-3 w-3" /> Published
          </span>
        </div>
      )}
    </Card>
  );
}

function ReferralCard({
  referral,
  onLogContact,
}: {
  referral: ReferralSource;
  onLogContact: () => void;
}) {
  const relColor = referral.relationship
    ? RELATIONSHIPS[referral.relationship] ?? "bg-muted text-muted-foreground"
    : "bg-muted text-muted-foreground";

  return (
    <Card
      className={cn(
        "flex flex-col p-4",
        referral.overdue && "border-amber-500/40 bg-amber-500/[0.03]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
              avatarColor(referral.name)
            )}
          >
            {referral.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{referral.name}</p>
            {referral.relationship && (
              <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", relColor)}>
                {referral.relationship.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        {referral.overdue && (
          <Badge className="bg-amber-500/15 text-amber-400">
            <AlertTriangle className="mr-1 h-3 w-3" /> Overdue
          </Badge>
        )}
      </div>

      {referral.contact && (
        <p className="mt-2 truncate text-xs text-muted-foreground">{referral.contact}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Total Referred</p>
          <p className="mt-0.5 font-semibold">{formatNGN(referral.totalValue, true)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Referrals</p>
          <p className="mt-0.5 font-semibold">{referral.referralCount}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <p>
          Last contact:{" "}
          <span className={referral.overdue ? "text-amber-400" : "text-foreground"}>
            {referral.lastContactAt ? formatDate(referral.lastContactAt) : "never"}
          </span>
        </p>
        <p>
          Next nurture:{" "}
          <span className={referral.overdue ? "text-amber-400" : "text-foreground"}>
            {referral.nextNurtureDate ? relativeTime(referral.nextNurtureDate) : "unscheduled"}
          </span>
        </p>
      </div>

      {referral.notes && (
        <p className="mt-2 line-clamp-2 text-[11px] italic text-muted-foreground/80">
          “{referral.notes}”
        </p>
      )}

      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={onLogContact} className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Log Contact
        </Button>
      </div>
    </Card>
  );
}

// ============================================================
// Dialogs
// ============================================================

function NewCampaignDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    name: string;
    channel: string;
    budget: number;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("SOCIAL");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      name: name.trim(),
      channel,
      budget: Number(budget) || 0,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    setSubmitting(false);
    setName("");
    setBudget("");
    setStartDate("");
    setEndDate("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Campaign name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Instagram Showcase Q4"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Budget (₦)</Label>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">End date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewContentDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    title: string;
    platform: string;
    type: string;
    scheduledDate?: string;
    topic?: string;
    assigneeId?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [type, setType] = useState("REEL");
  const [scheduledDate, setScheduledDate] = useState("");
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      title: title.trim(),
      platform,
      type,
      scheduledDate: scheduledDate || undefined,
      topic: topic.trim() || undefined,
    });
    setSubmitting(false);
    setTitle("");
    setTopic("");
    setScheduledDate("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Content</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Behind the scenes — MTN shoot"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["POST", "REEL", "VIDEO", "ARTICLE", "STORY", "NEWSLETTER"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Scheduled date</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Topic (optional)</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Behind the scenes"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add to Calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewReferralDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    name: string;
    contact?: string;
    relationship?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [relationship, setRelationship] = useState("CLIENT");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      name: name.trim(),
      contact: contact.trim() || undefined,
      relationship,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    setName("");
    setContact("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Referral Source</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lai Mohammed"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Contact (phone / email)</Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="+234 ... · name@email.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RELATIONSHIPS).map(([k]) => (
                  <SelectItem key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What kind of referrals? Best way to stay in touch?"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogNurtureDialog({
  referral,
  onOpenChange,
  onSubmit,
}: {
  referral: ReferralSource | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (nextDate: string) => Promise<void>;
}) {
  const defaultDate = useMemo(() => {
    // default to 14 days from now
    const d = new Date(Date.now() + 14 * 86400000);
    return d.toISOString().split("T")[0];
  }, []);
  const [nextDate, setNextDate] = useState(defaultDate);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNextDate(defaultDate);
  }, [referral?.id, defaultDate]);

  async function handleSubmit() {
    if (!nextDate) {
      toast.error("Pick a next nurture date");
      return;
    }
    setSubmitting(true);
    await onSubmit(nextDate);
    setSubmitting(false);
  }

  return (
    <Dialog open={!!referral} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Contact — {referral?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Marking this as contacted today ({formatDate(new Date())}). When should you reach out
            again?
          </p>
          <div>
            <Label className="text-xs">Next nurture date</Label>
            <Input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="mt-1"
            />
          </div>
          {referral?.notes && (
            <div className="rounded-md border border-border bg-card/50 p-2 text-[11px] italic text-muted-foreground">
              “{referral.notes}”
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Skeletons
// ============================================================
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-full" />
        </Card>
      ))}
    </div>
  );
}
