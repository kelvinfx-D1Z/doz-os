"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Link2,
  AlertTriangle,
  UserPlus,
  FileSignature,
  Plus,
  Trash2,
} from "lucide-react";

import { QuickCapture } from "@/components/modules/crm/quick-capture";
import { ContactDialog } from "@/components/modules/crm/contact-dialog";
import { ContractDialog } from "@/components/modules/crm/contract-dialog";
import { ClientDialog } from "@/components/modules/crm/client-dialog";
import { EnquiriesPanel } from "@/components/modules/crm/enquiries-panel";
import { useCurrentUser } from "@/hooks/use-current-user";
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
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
  openOpps: number;
  wonOpps: number;
  lostOpps: number;
  proposalsSent: number;
  proposalsAccepted: number;
  openFollowUps: number;
  overdueFollowUps: number;
  strategicAccounts: number;
  totalReferralValue: number;
  contractedRevenuePct: number;
  multiThreadedAccountsPct: number;
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
  portalToken: string | null;
  portalActive: boolean;
  _count: { opportunities: number; projects: number };
  revenue: number;
  contactCount: number;
  isSingleThreaded: boolean;
  contract: {
    id: string;
    title: string;
    status: string;
    isRecurring: boolean;
    renewalDate: string | null;
    value: number;
  } | null;
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
  direction?: string;
  accountId?: string | null;
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

type ReferralSource = {
  id: string;
  name: string;
  relationship: string | null;
  totalValue: number;
  referralCount: number;
};

type CrmData = {
  stats: Stats;
  referralSources?: ReferralSource[];
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

async function fetchCrmData(): Promise<CrmData> {
  const res = await fetch("/api/doz/crm", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CrmData;
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
  const [contactFor, setContactFor] = useState<Account | null>(null);
  const [contractFor, setContractFor] = useState<Account | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const isFounder = user?.role === "FOUNDER";

  // Reusable reload used after a QuickCapture write. Kept separate from the
  // mount effect below (which uses an inline IIFE + cancellation guard) so
  // that calling this from a manual trigger doesn't run afoul of
  // react-hooks/set-state-in-effect, which flags setState reachable from a
  // named function invoked directly in an effect body.
  //
  // Deliberately does NOT touch `loading` (or flip into the full-page error
  // state on failure): this runs after every successful capture, and toggling
  // `loading` here would unmount the whole page — KPIs, tabs, and
  // QuickCapture itself — back to <CrmSkeleton /> and remount it once the
  // refetch resolves, which both flashes and drops input focus on every
  // single log. The first-mount skeleton (below) is unaffected by this.
  const load = useCallback(async () => {
    try {
      const json = await fetchCrmData();
      setData(json);
    } catch (e: unknown) {
      toast.error("Couldn't refresh CRM data", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, []);

  // Delete a client. The API refuses (409) when the client has projects,
  // invoices, deals, contracts or enquiries attached, and returns a message
  // naming what is in the way — surface that verbatim rather than a generic
  // failure, because it tells the founder exactly what to clear first.
  const handleDeleteClient = useCallback(
    async (account: Account) => {
      if (
        !window.confirm(
          `Delete "${account.name}"?\n\n` +
            `Only possible if this client has no projects, invoices, deals, ` +
            `contracts or enquiries. Any contacts stored against them are removed too.\n\n` +
            `This cannot be undone.`,
        )
      )
        return;
      setDeletingId(account.id);
      try {
        const res = await fetch("/api/doz/crm/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_account", accountId: account.id }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
        toast.success(`${account.name} deleted`);
        await load();
      } catch (err) {
        // Show the reason as the headline, not a sub-line. The API's 409 names
        // exactly what is blocking the delete, which is the actionable part —
        // burying it under a generic "Couldn't delete" reads as nothing
        // happening at all.
        toast.error(
          err instanceof Error ? err.message : `Couldn't delete ${account.name}`,
          { duration: 9000 },
        );
      } finally {
        setDeletingId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const json = await fetchCrmData();
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

  const { stats, opportunities, accounts, leads, proposals, followUps, referrals, pipelineByStage } = data;
  const referralSources = data.referralSources ?? [];
  const openOpps = opportunities.filter((o) => !["WON", "LOST"].includes(o.stage));
  const referralPctOfPipeline =
    stats.totalPipeline > 0 ? (stats.totalReferralValue / stats.totalPipeline) * 100 : 0;

  return (
    <div className="space-y-5">
      <QuickCapture onCreated={load} />

      {/* ---------- TOP KPI ROW ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Contracted revenue"
          value={`${stats.contractedRevenuePct.toFixed(0)}%`}
          sub="Revenue under an active recurring agreement"
          icon={<FileText className="h-4 w-4" />}
          accent={stats.contractedRevenuePct > 0 ? "primary" : "warning"}
        />
        <StatCard
          label="Accounts with 2+ contacts"
          value={`${stats.multiThreadedAccountsPct.toFixed(0)}%`}
          sub="Accounts that survive a contact changing job"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* ---------- TABS ---------- */}
      <Tabs defaultValue="enquiries" className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          <TabsTrigger value="accounts">Clients</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="pipeline">Deals</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
        </TabsList>

        {/* ---------- ENQUIRIES TAB ---------- */}
        <TabsContent value="enquiries">
          <EnquiriesPanel
            enquiries={leads}
            onChanged={load}
            canEdit={isFounder || user?.role === "STAFF"}
          />
        </TabsContent>

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
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                icon={<Building2 className="h-4 w-4" />}
                title="Accounts"
                description={`${accounts.length} accounts · ${stats.strategicAccounts} strategic`}
              />
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setAddClientOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add client
              </Button>
            </div>
            <div className="mt-4 max-h-96 overflow-y-auto scroll-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead className="text-right">Lifetime Value</TableHead>
                    <TableHead className="text-center">Opportunities</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead>Retainer</TableHead>
                    <TableHead className="text-center">Client Portal</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
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
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{a.contactCount}</span>
                            {a.isSingleThreaded && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-amber-500/40 text-[10px] text-amber-400"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Single contact
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.contract ? (
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={a.contract.status} />
                              {a.contract.renewalDate && (
                                <span className="text-[10px] text-muted-foreground">
                                  Renews {formatDate(a.contract.renewalDate)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">No retainer</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {a.portalActive && a.portalToken ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => {
                                const url = `${window.location.origin}/?portal=${a.portalToken}`;
                                navigator.clipboard?.writeText(url);
                                toast.success(`Portal link copied for ${a.name}`);
                              }}
                            >
                              <Link2 className="h-3 w-3" />
                              Copy Link
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not enabled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => setContactFor(a)}
                            >
                              <UserPlus className="h-3 w-3" />
                              Add contact
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => setContractFor(a)}
                            >
                              <FileSignature className="h-3 w-3" />
                              Retainer
                            </Button>
                            {isFounder && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                                disabled={deletingId === a.id}
                                onClick={() => handleDeleteClient(a)}
                                aria-label={`Delete ${a.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
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
            sources={referralSources}
            referrals={referrals}
            totalValue={stats.totalReferralValue}
            pctOfPipeline={referralPctOfPipeline}
          />
        </TabsContent>
      </Tabs>

      <ClientDialog
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onSaved={load}
      />
      <ContactDialog
        accountId={contactFor?.id ?? null}
        accountName={contactFor?.name ?? ""}
        open={contactFor !== null}
        onOpenChange={(v) => {
          if (!v) setContactFor(null);
        }}
        onSaved={load}
      />
      <ContractDialog
        account={contractFor}
        open={contractFor !== null}
        onOpenChange={(v) => {
          if (!v) setContractFor(null);
        }}
        onSaved={load}
      />
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
  sources,
  totalValue,
  pctOfPipeline,
}: {
  referrals: Referral[];
  sources: ReferralSource[];
  totalValue: number;
  pctOfPipeline: number;
}) {
  return (
    <div className="space-y-5">
      {/* Who refers us — moved here from Marketing so referrals have ONE home.
          For a business that is ~99% referral, having this split across two
          pages and two tables was the app's biggest source of confusion. */}
      {sources.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            icon={<Handshake className="h-4 w-4" />}
            title="Who refers us"
            description={`${sources.length} people and organisations have sent us work`}
          />
          <div className="scroll-thin mt-4 max-h-72 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead className="text-center">Referrals</TableHead>
                  <TableHead className="text-right">Value sent our way</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {r.relationship?.toLowerCase().replace("_", " ") ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">{r.referralCount}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNGN(r.totalValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

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
