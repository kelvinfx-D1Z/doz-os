"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Star,
  Phone,
  Mail,
  Calendar,
  MessageCircle,
  TrendingUp,
  Users,
  FileText,
  Handshake,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Briefcase,
  Building2,
} from "lucide-react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  StatCard,
  StatusBadge,
  SectionHeader,
  EmptyState,
  MiniBar,
} from "@/components/doz/ui-primitives";
import { formatNGN, relativeTime, formatDate, avatarColor } from "@/lib/format";

// ---------- types (mirroring API response shape) ----------
type Stats = {
  totalPipeline: number;
  weightedPipeline: number;
  openOpps: number;
  wonOpps: number;
  lostOpps: number;
  proposalsSent: number;
  proposalsAccepted: number;
  conversionRate: number;
  openFollowUps: number;
  overdueFollowUps: number;
  strategicAccounts: number;
  totalReferralValue: number;
};

type Opportunity = {
  id: string;
  name: string;
  stage: string;
  value: number;
  probability: number;
  expectedClose: string | null;
  source: string;
  serviceType: string | null;
  account: { name: string; isStrategic: boolean } | null;
  contact: { name: string } | null;
  proposals: { id: string; title: string; amount: number; status: string }[];
  followUps: {
    id: string;
    subject: string;
    dueDate: string;
    completed: boolean;
  }[];
};

type Account = {
  id: string;
  name: string;
  industry: string | null;
  isStrategic: boolean;
  lifetimeValue: number;
  _count: { opportunities: number; projects: number };
};

type Contact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isDecisionMaker: boolean;
  account: { name: string } | null;
};

type Lead = {
  id: string;
  contactName: string;
  company: string | null;
  source: string;
  sourceDetail: string | null;
  status: string;
  value: number;
  serviceInterest: string | null;
  createdAt: string;
};

type Proposal = {
  id: string;
  title: string;
  amount: number;
  status: string;
  sentDate: string | null;
  responseDate: string | null;
  validUntil: string | null;
  opportunity: { name: string; account: { name: string } | null } | null;
};

type FollowUp = {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  dueDate: string;
  completed: boolean;
  contact: { name: string } | null;
  opportunity: { name: string; account: { name: string } | null } | null;
};

type Referral = {
  id: string;
  referrerName: string;
  value: number;
  note: string | null;
  toAccount: { name: string } | null;
  createdAt: string;
};

type CrmData = {
  stats: Stats;
  opportunities: Opportunity[];
  accounts: Account[];
  contacts: Contact[];
  leads: Lead[];
  proposals: Proposal[];
  followUps: FollowUp[];
  referrals: Referral[];
  pipelineByStage: { stage: string; count: number; value: number }[];
};

// ---------- helpers ----------
const STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"] as const;

function sourceBadgeVariant(source: string): "default" | "secondary" | "outline" {
  switch (source) {
    case "REFERRAL":
      return "default";
    case "EXISTING_CLIENT":
      return "secondary";
    case "NETWORKING":
      return "outline";
    default:
      return "outline";
  }
}

function followUpIcon(type: string) {
  switch (type) {
    case "CALL":
      return <Phone className="h-3.5 w-3.5" />;
    case "EMAIL":
      return <Mail className="h-3.5 w-3.5" />;
    case "MEETING":
      return <Calendar className="h-3.5 w-3.5" />;
    case "WHATSAPP":
      return <MessageCircle className="h-3.5 w-3.5" />;
    default:
      return <MessageCircle className="h-3.5 w-3.5" />;
  }
}

function isExpiredProposal(p: Proposal): boolean {
  if (p.status !== "SENT" || !p.validUntil) return false;
  return new Date(p.validUntil).getTime() < Date.now();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------- loading skeleton ----------
function CrmSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-80 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

// ---------- main component ----------
export function CrmSales() {
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/doz/crm", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CrmData;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load CRM data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <CrmSkeleton />;
  if (error || !data)
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Could not load CRM data"
        hint={error ?? "Please try again."}
      />
    );

  const { stats, opportunities, accounts, proposals, followUps, referrals, pipelineByStage } = data;
  const openOpps = opportunities.filter((o) => !["WON", "LOST"].includes(o.stage));
  const referralPctOfPipeline =
    stats.totalPipeline > 0 ? (stats.totalReferralValue / stats.totalPipeline) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* ---------- TOP KPI ROW ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Pipeline Value"
          value={formatNGN(stats.totalPipeline, true)}
          sub={`${stats.openOpps} open opps`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Weighted Pipeline"
          value={formatNGN(stats.weightedPipeline, true)}
          sub="Probability-adjusted"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Open Opportunities"
          value={stats.openOpps}
          sub={`${stats.wonOpps} won · ${stats.lostOpps} lost`}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Conversion Rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          sub={`${stats.proposalsAccepted} of ${stats.proposalsSent + stats.proposalsAccepted} proposals`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent={stats.conversionRate >= 25 ? "primary" : "warning"}
        />
        <StatCard
          label="Open Follow-ups"
          value={stats.openFollowUps}
          sub={stats.overdueFollowUps > 0 ? `${stats.overdueFollowUps} overdue` : "On track"}
          icon={<Clock className="h-4 w-4" />}
          accent={stats.overdueFollowUps > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Strategic Accounts"
          value={stats.strategicAccounts}
          sub={`${accounts.length} total accounts`}
          icon={<Star className="h-4 w-4" />}
          accent="warning"
        />
      </div>

      {/* ---------- TABS ---------- */}
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>

        {/* ---------- PIPELINE TAB ---------- */}
        <TabsContent value="pipeline" className="space-y-5">
          <PipelineBoard
            opportunities={opportunities}
            pipelineByStage={pipelineByStage}
          />

          {/* Open opportunities table */}
          <Card className="p-5">
            <SectionHeader
              icon={<Briefcase className="h-4 w-4" />}
              title="Open Opportunities"
              description={`${openOpps.length} active deals in the pipeline`}
            />
            <div className="mt-4 max-h-96 overflow-y-auto scroll-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Opportunity</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="w-24">Probability</TableHead>
                    <TableHead>Expected Close</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openOpps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No open opportunities" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    openOpps.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {o.account?.isStrategic && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            )}
                            {o.account?.name ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {o.name}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatNGN(o.value, true)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={o.stage} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MiniBar
                              value={o.probability}
                              max={100}
                              color={
                                o.probability >= 60
                                  ? "bg-primary"
                                  : o.probability >= 35
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground"
                              }
                            />
                            <span className="w-8 text-[11px] text-muted-foreground">{o.probability}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(o.expectedClose)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sourceBadgeVariant(o.source)} className="text-[10px]">
                            {o.source.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ---------- ACCOUNTS TAB ---------- */}
        <TabsContent value="accounts">
          <Card className="p-5">
            <SectionHeader
              icon={<Building2 className="h-4 w-4" />}
              title="Accounts"
              description={`${accounts.length} accounts · ${stats.strategicAccounts} strategic`}
            />
            <div className="mt-4 max-h-96 overflow-y-auto scroll-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead className="text-right">Lifetime Value</TableHead>
                    <TableHead className="text-center">Opportunities</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState icon={<Building2 className="h-6 w-6" />} title="No accounts yet" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${avatarColor(
                                a.name
                              )}`}
                            >
                              {a.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {a.isStrategic && (
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              )}
                              {a.name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.industry ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatNGN(a.lifetimeValue)}
                        </TableCell>
                        <TableCell className="text-center">{a._count.opportunities}</TableCell>
                        <TableCell className="text-center">{a._count.projects}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ---------- PROPOSALS TAB ---------- */}
        <TabsContent value="proposals">
          <Card className="p-5">
            <SectionHeader
              icon={<FileText className="h-4 w-4" />}
              title="Proposals"
              description={`${proposals.length} proposals · ${stats.proposalsSent} sent · ${stats.proposalsAccepted} accepted`}
            />
            <div className="mt-4 max-h-96 overflow-y-auto scroll-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState icon={<FileText className="h-6 w-6" />} title="No proposals yet" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    proposals.map((p) => {
                      const expired = isExpiredProposal(p);
                      return (
                        <TableRow
                          key={p.id}
                          className={expired ? "bg-amber-500/5" : undefined}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {expired && <AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
                              <span className="max-w-[260px] truncate">{p.title}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {p.opportunity?.account?.name ?? p.opportunity?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatNGN(p.amount)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                            {expired && (
                              <Badge variant="outline" className="ml-1 border-amber-500/40 text-[10px] text-amber-400">
                                EXPIRED
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.sentDate)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.validUntil)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.responseDate)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ---------- FOLLOW-UPS TAB ---------- */}
        <TabsContent value="followups">
          <FollowUpsList followUps={followUps} />
        </TabsContent>

        {/* ---------- REFERRALS TAB ---------- */}
        <TabsContent value="referrals">
          <ReferralsPanel
            referrals={referrals}
            totalValue={stats.totalReferralValue}
            pctOfPipeline={referralPctOfPipeline}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// PIPELINE BOARD (Kanban)
// ============================================================
function PipelineBoard({
  opportunities,
  pipelineByStage,
}: {
  opportunities: Opportunity[];
  pipelineByStage: { stage: string; count: number; value: number }[];
}) {
  return (
    <Card className="p-5">
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Pipeline Board"
        description="Drag stages are conceptual — opportunities grouped by stage"
      />
      <ScrollArea className="mt-4 w-full whitespace-nowrap">
        <div className="flex gap-3 pb-2">
          {STAGES.map((stage) => {
            const stageData = pipelineByStage.find((p) => p.stage === stage);
            const items = opportunities.filter((o) => o.stage === stage);
            const count = stageData?.count ?? items.length;
            const value = stageData?.value ?? items.reduce((s, o) => s + o.value, 0);
            return (
              <div
                key={stage}
                className="flex min-w-[260px] flex-col rounded-lg bg-muted/30 p-3"
              >
                {/* column header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={stage} />
                    <span className="text-xs text-muted-foreground">{count} deals</span>
                  </div>
                  <span className="text-sm font-semibold">{formatNGN(value, true)}</span>
                </div>
                {/* column body */}
                <div className="flex-1 space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground/60">
                      No deals
                    </div>
                  ) : (
                    items.map((o) => (
                      <OppCard key={o.id} opp={o} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}

function OppCard({ opp }: { opp: Opportunity }) {
  // next incomplete follow-up
  const nextFollowUp = opp.followUps
    .filter((f) => !f.completed)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const overdue = nextFollowUp && new Date(nextFollowUp.dueDate).getTime() < Date.now();

  return (
    <div className="group rounded-md border border-border bg-card p-3 transition-all hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-tight">{opp.name}</p>
        {opp.account?.isStrategic && (
          <Star className="mt-0.5 h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {opp.account?.name ?? "—"}
        {opp.contact?.name ? ` · ${opp.contact.name}` : ""}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{formatNGN(opp.value, true)}</span>
        <Badge variant={sourceBadgeVariant(opp.source)} className="text-[9px]">
          {opp.source.replace(/_/g, " ")}
        </Badge>
      </div>
      {/* probability bar */}
      <div className="mt-2 flex items-center gap-2">
        <MiniBar
          value={opp.probability}
          max={100}
          color={
            opp.probability >= 60
              ? "bg-primary"
              : opp.probability >= 35
              ? "bg-amber-500"
              : "bg-muted-foreground"
          }
        />
        <span className="w-8 text-[10px] text-muted-foreground">{opp.probability}%</span>
      </div>
      {/* next follow-up */}
      {nextFollowUp && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-[10px] ${
            overdue ? "text-rose-400" : "text-muted-foreground"
          }`}
        >
          <Clock className="h-3 w-3" />
          <span className="truncate">{nextFollowUp.subject}</span>
          <span className="ml-auto shrink-0">· {relativeTime(nextFollowUp.dueDate)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FOLLOW-UPS LIST (grouped by overdue / today / upcoming)
// ============================================================
function FollowUpsList({ followUps }: { followUps: FollowUp[] }) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today.getTime() + 86400000);

  const groups = useMemo(() => {
    const open = followUps.filter((f) => !f.completed);
    const completed = followUps.filter((f) => f.completed);

    const overdue = open
      .filter((f) => new Date(f.dueDate) < today)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const dueToday = open
      .filter((f) => {
        const d = new Date(f.dueDate);
        return d >= today && d < tomorrow;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const upcoming = open
      .filter((f) => new Date(f.dueDate) >= tomorrow)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    return { overdue, dueToday, upcoming, completed };
  }, [followUps, today, tomorrow]);

  return (
    <div className="space-y-5">
      <FollowUpGroup
        title="Overdue"
        count={groups.overdue.length}
        items={groups.overdue}
        accent="danger"
        icon={<AlertCircle className="h-4 w-4" />}
      />
      <FollowUpGroup
        title="Due Today"
        count={groups.dueToday.length}
        items={groups.dueToday}
        accent="warning"
        icon={<Clock className="h-4 w-4" />}
      />
      <FollowUpGroup
        title="Upcoming"
        count={groups.upcoming.length}
        items={groups.upcoming}
        accent="default"
        icon={<Calendar className="h-4 w-4" />}
      />
      <FollowUpGroup
        title="Completed"
        count={groups.completed.length}
        items={groups.completed}
        accent="default"
        icon={<CheckCircle2 className="h-4 w-4" />}
      />
    </div>
  );
}

function FollowUpGroup({
  title,
  count,
  items,
  accent,
  icon,
}: {
  title: string;
  count: number;
  items: FollowUp[];
  accent: "default" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const accentText =
    accent === "danger" ? "text-rose-400" : accent === "warning" ? "text-amber-400" : "text-muted-foreground";
  return (
    <Card className="p-5">
      <SectionHeader
        icon={<span className={accentText}>{icon}</span>}
        title={title}
        description={`${count} item${count === 1 ? "" : "s"}`}
      />
      <div className="mt-4 max-h-96 overflow-y-auto scroll-thin space-y-2">
        {items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={`Nothing ${title.toLowerCase()}`}
            hint="You're all caught up here."
          />
        ) : (
          items.map((f) => (
            <FollowUpItem key={f.id} f={f} />
          ))
        )}
      </div>
    </Card>
  );
}

function FollowUpItem({ f }: { f: FollowUp }) {
  const overdue = !f.completed && new Date(f.dueDate) < startOfDay(new Date());
  const dueToday =
    !f.completed &&
    new Date(f.dueDate) >= startOfDay(new Date()) &&
    new Date(f.dueDate) < new Date(startOfDay(new Date()).getTime() + 86400000);
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card/50 p-3 transition-colors hover:bg-accent/30">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          f.completed
            ? "bg-primary/15 text-primary"
            : overdue
            ? "bg-rose-500/15 text-rose-400"
            : dueToday
            ? "bg-amber-500/15 text-amber-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {followUpIcon(f.type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-tight ${f.completed ? "line-through text-muted-foreground" : ""}`}>
            {f.subject}
          </p>
          {!f.completed && (
            <span
              className={`shrink-0 text-[11px] font-medium ${
                overdue ? "text-rose-400" : dueToday ? "text-amber-400" : "text-muted-foreground"
              }`}
            >
              {relativeTime(f.dueDate)}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {f.contact?.name && <span>{f.contact.name}</span>}
          {f.opportunity && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="truncate">{f.opportunity.name}</span>
              {f.opportunity.account && (
                <>
                  <span>·</span>
                  <span className="truncate">{f.opportunity.account.name}</span>
                </>
              )}
            </>
          )}
          {f.completed && (
            <>
              <span>·</span>
              <span className="text-primary">Completed</span>
            </>
          )}
        </div>
        {f.notes && <p className="mt-1 text-[11px] text-muted-foreground/80">{f.notes}</p>}
      </div>
    </div>
  );
}

// ============================================================
// REFERRALS PANEL
// ============================================================
function ReferralsPanel({
  referrals,
  totalValue,
  pctOfPipeline,
}: {
  referrals: Referral[];
  totalValue: number;
  pctOfPipeline: number;
}) {
  return (
    <div className="space-y-5">
      {/* referral stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total Referral Value"
          value={formatNGN(totalValue, true)}
          sub={`${referrals.length} referrals generated`}
          icon={<Handshake className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Share of Pipeline"
          value={`${pctOfPipeline.toFixed(1)}%`}
          sub="Referrals vs. total open pipeline"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Active Referrers"
          value={new Set(referrals.map((r) => r.referrerName)).size}
          sub="People who sent business"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <Card className="p-5">
        <SectionHeader
          icon={<Handshake className="h-4 w-4" />}
          title="Referrals"
          description="Business introduced by your network"
        />
        <div className="mt-4 max-h-96 overflow-y-auto scroll-thin space-y-2">
          {referrals.length === 0 ? (
            <EmptyState
              icon={<Handshake className="h-6 w-6" />}
              title="No referrals recorded"
              hint="Track referrals here to measure word-of-mouth ROI."
            />
          ) : (
            referrals.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-card/50 p-3 transition-colors hover:bg-accent/30"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(
                    r.referrerName
                  )}`}
                >
                  {r.referrerName
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{r.referrerName}</p>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatNGN(r.value, true)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <ChevronRight className="h-3 w-3" />
                    <span className="truncate">{r.toAccount?.name ?? "—"}</span>
                    <span>·</span>
                    <span>{formatDate(r.createdAt)}</span>
                  </div>
                  {r.note && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground/80">{r.note}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
