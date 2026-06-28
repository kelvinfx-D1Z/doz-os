"use client";

import { useEffect, useState, useRef } from "react";
import {
  Sparkles,
  Target,
  AlertTriangle,
  FileText,
  MessageSquare,
  Send,
  Bot,
  Zap,
  TrendingUp,
  Shield,
  Circle,
  CornerDownRight,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  MessageCircle,
  Briefcase,
  TrendingUp as OppIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatCard, SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { formatNGN, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

// ============================================================
// Types
// ============================================================

type Action = "daily_plan" | "risk_check" | "proposal_draft" | "chat";

interface Insight {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
}

interface ContextSummary {
  pipelineValue: number;
  outstandingAmount: number;
  overdueAmount: number;
  pendingApprovals: number;
  openTasks: number;
  overdueTasks: number;
  activeProjects: number;
  distractions: number;
  cashPosition: number;
  topPriorities: string[];
  upcomingDeadlines: string[];
}

interface AiData {
  insights: Insight[];
  stats: { critical: number; warnings: number; info: number; unread: number };
  contextSummary: ContextSummary | null;
}

// A single DIDI action that the LLM requested + the server-executed result.
interface ActionResult {
  type: string;
  ok: boolean;
  error?: string;
  title?: string;
  id?: string;
  name?: string;
  subject?: string;
  dueDate?: string;
  value?: number;
  taskTitle?: string;
}

interface ChatExchange {
  role: "user" | "assistant";
  content: string;
  action?: Action;
  // For assistant messages with chat_with_actions, store the executed action results
  actionResults?: ActionResult[];
}

// ============================================================
// Severity + type styling
// ============================================================

function severityDot(sev: string): string {
  switch (sev) {
    case "CRITICAL":
      return "bg-red-500";
    case "WARNING":
      return "bg-amber-500";
    case "INFO":
      return "bg-teal-500";
    default:
      return "bg-zinc-500";
  }
}

function severityBorder(sev: string): string {
  switch (sev) {
    case "CRITICAL":
      return "border-l-red-500";
    case "WARNING":
      return "border-l-amber-500";
    case "INFO":
      return "border-l-teal-500";
    default:
      return "border-l-zinc-500";
  }
}

function typeBadgeColor(t: string): string {
  switch (t) {
    case "OVERDUE":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "BUDGET_OVERRUN":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "RISK":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "DISTRACTION":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "OPPORTUNITY":
      return "bg-primary/15 text-primary border-primary/30";
    case "DAILY_PLAN":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ============================================================
// Quick prompts
// ============================================================

const QUICK_PROMPTS = [
  "Create a task to follow up with GTBank tomorrow",
  "Schedule a follow-up call with Shell next week",
  "Add an account for Dangote",
  "What should I delegate today?",
];

// ============================================================
// Component
// ============================================================

export function AiChiefOfStaff() {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI console state
  const [busy, setBusy] = useState<Action | null>(null);
  const [history, setHistory] = useState<ChatExchange[]>([]);
  const [chatMode, setChatMode] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // fetch insights + context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doz/ai");
        if (!res.ok) throw new Error("Failed to load AI insights");
        const json = (await res.json()) as AiData;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(action: Action, msg?: string, oppName?: string) {
    if (busy) return;
    setBusy(action);
    const userMessage =
      msg ?? (action === "chat" ? chatInput.trim() : undefined);

    if (action === "chat") {
      if (!userMessage) {
        toast.error("Please enter a question first");
        setBusy(null);
        return;
      }
      setHistory((h) => [...h, { role: "user", content: userMessage, action }]);
      setChatInput("");
    }

    try {
      // For chat, use the new chat_with_actions endpoint so DIDI can take actions.
      const endpointAction = action === "chat" ? "chat_with_actions" : action;
      const res = await fetch("/api/doz/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: endpointAction,
          message: action === "chat" ? userMessage : undefined,
          opportunityName: oppName,
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const json = (await res.json()) as {
        response?: string;
        reply?: string;
        actionResults?: ActionResult[];
        error?: boolean;
        offline?: boolean;
        rawNotJson?: boolean;
      };

      // chat_with_actions returns { reply, actionResults }; others return { response }.
      const text =
        typeof json.reply === "string" && json.reply.length > 0
          ? json.reply
          : json.response ?? "No response.";
      const actionResults = json.actionResults ?? [];
      setLastResponse(text);
      setHistory((h) => [
        ...h,
        { role: "assistant", content: text, action, actionResults },
      ]);
      // keep only last 3 exchanges (1 exchange = user + assistant = 2 messages)
      if (history.length > 4) {
        setHistory((h) => h.slice(-4));
      }
      if (json.offline) {
        toast.warning("DIDI offline — showing cached guidance");
      } else if (actionResults.length > 0) {
        const okCount = actionResults.filter((a) => a.ok).length;
        if (okCount > 0) {
          toast.success(`DIDI took ${okCount} action${okCount === 1 ? "" : "s"}`);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy(null);
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
  }

  function handleQuickPrompt(prompt: string) {
    setChatMode(true);
    setChatInput(prompt);
    void runAction("chat", prompt);
  }

  // ---------- loading ----------
  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't load AI Chief of Staff"
          hint={error ?? "Unknown error"}
        />
      </div>
    );
  }

  const { insights, stats, contextSummary } = data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ---------- Hero banner ---------- */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">AI Chief of Staff</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/30">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Online
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Your digital Operations Director — daily plans, risk checks, proposals & chat.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-mono">ops-director · v1</span>
          </div>
        </div>
      </Card>

      {/* ---------- KPI row ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Critical Alerts"
          value={stats.critical}
          sub={`${stats.critical} critical insight${stats.critical === 1 ? "" : "s"}`}
          icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
          accent="danger"
        />
        <StatCard
          label="Warnings"
          value={stats.warnings}
          sub="items needing attention"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          accent="warning"
        />
        <StatCard
          label="Open Tasks"
          value={contextSummary?.openTasks ?? 0}
          sub={`${contextSummary?.overdueTasks ?? 0} overdue`}
          icon={<Target className="h-5 w-5 text-primary" />}
          accent="primary"
        />
        <StatCard
          label="Unread Insights"
          value={stats.unread}
          sub="new from the AI"
          icon={<Sparkles className="h-5 w-5 text-teal-400" />}
        />
      </div>

      {/* ---------- Main layout ---------- */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* ----- LEFT COLUMN ----- */}
        <div className="lg:col-span-2 space-y-6">
          {/* === AI Console === */}
          <Card className="p-5">
            <SectionHeader
              title="AI Console"
              description="Generate a plan, scan for risk, draft a proposal, or ask a question."
              icon={<Sparkles className="h-5 w-5" />}
            />

            {/* action buttons */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ActionButton
                label="Daily Plan"
                icon={<Target className="h-4 w-4" />}
                onClick={() => {
                  setChatMode(false);
                  void runAction("daily_plan");
                }}
                active={busy === "daily_plan"}
                disabled={!!busy}
              />
              <ActionButton
                label="Risk Check"
                icon={<AlertTriangle className="h-4 w-4" />}
                onClick={() => {
                  setChatMode(false);
                  void runAction("risk_check");
                }}
                active={busy === "risk_check"}
                disabled={!!busy}
              />
              <ActionButton
                label="Draft Proposal"
                icon={<FileText className="h-4 w-4" />}
                onClick={() => {
                  setChatMode(false);
                  void runAction("proposal_draft", undefined, undefined);
                }}
                active={busy === "proposal_draft"}
                disabled={!!busy}
              />
              <ActionButton
                label="Ask Question"
                icon={<MessageSquare className="h-4 w-4" />}
                onClick={() => setChatMode((v) => !v)}
                active={chatMode}
                disabled={!!busy}
              />
            </div>

            {/* chat input */}
            {chatMode && (
              <div className="mt-3">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runAction("chat");
                  }}
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask DIDI to create tasks, follow-ups, accounts…"
                    disabled={!!busy}
                    autoFocus
                  />
                  <Button type="submit" disabled={!!busy || !chatInput.trim()} size="sm">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  DIDI can create tasks, follow-ups, and accounts for you — just ask.
                </p>
              </div>
            )}

            {/* response area */}
            <div ref={responseRef} className="mt-4">
              {busy ? (
                <ThinkingIndicator action={busy} />
              ) : lastResponse ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-primary/15">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      DIDI · Operations Director
                    </span>
                  </div>
                  <MarkdownRender content={lastResponse} />
                  {/* Show actions taken on the most recent response */}
                  {(() => {
                    const last = history[history.length - 1];
                    if (!last || last.role !== "assistant" || !last.actionResults || last.actionResults.length === 0) {
                      return null;
                    }
                    return (
                      <div className="mt-3 border-t border-primary/15 pt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Actions taken
                        </p>
                        <ActionBadges results={last.actionResults} />
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">No output yet</p>
                  <p className="text-xs text-muted-foreground">
                    Ask DIDI to plan your day, scan risks, draft a proposal — or to create tasks & follow-ups.
                  </p>
                </div>
              )}

              {/* history */}
              {history.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Recent exchanges
                  </p>
                  <ScrollArea className="max-h-72">
                    <div className="space-y-2 pr-2">
                      {history
                        .slice()
                        .reverse()
                        .slice(0, 6)
                        .map((m, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-md border p-2 text-sm",
                              m.role === "user"
                                ? "border-border bg-muted/30"
                                : "border-primary/15 bg-primary/5"
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className={cn(
                                  "text-[10px] font-semibold uppercase tracking-wider",
                                  m.role === "user" ? "text-muted-foreground" : "text-primary"
                                )}
                              >
                                {m.role === "user" ? "You" : "DIDI"}
                              </span>
                              {m.action && (
                                <Badge
                                  variant="outline"
                                  className="ml-auto text-[9px] px-1 py-0 font-mono"
                                >
                                  {m.action.replace("_", " ")}
                                </Badge>
                              )}
                            </div>
                            {m.role === "user" ? (
                              <p className="text-sm">{m.content}</p>
                            ) : (
                              <>
                                <MarkdownRender content={m.content} compact />
                                {m.actionResults && m.actionResults.length > 0 && (
                                  <div className="mt-2">
                                    <ActionBadges results={m.actionResults} compact />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </Card>

          {/* === Active Insights === */}
          <Card className="p-5">
            <SectionHeader
              title="Active Insights"
              description={`${insights.length} stored insights — generated by the AI from your operating data.`}
              icon={<Zap className="h-5 w-5" />}
              action={
                <Badge variant="outline" className="text-[10px]">
                  {stats.unread} unread
                </Badge>
              }
            />
            <div className="mt-4 max-h-[28rem] overflow-y-auto pr-1 scroll-thin">
              {insights.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-8 w-8" />}
                  title="No insights yet"
                  hint="Run a daily plan or risk check to generate insights."
                />
              ) : (
                <ul className="space-y-2">
                  {insights.map((ins) => (
                    <li
                      key={ins.id}
                      className={cn(
                        "rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-accent/20",
                        severityBorder(ins.severity),
                        !ins.isRead && "ring-1 ring-primary/20 bg-primary/5"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                            severityDot(ins.severity)
                          )}
                          aria-label={ins.severity}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-sm">{ins.title}</p>
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                                typeBadgeColor(ins.type)
                              )}
                            >
                              {ins.type.replace(/_/g, " ")}
                            </span>
                            {!ins.isRead && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{ins.message}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                            {relativeTime(ins.createdAt)}
                            {ins.entityType ? ` · ${ins.entityType}` : ""}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* ----- RIGHT COLUMN ----- */}
        <div className="space-y-6">
          {/* === Live Context === */}
          <Card className="p-5">
            <SectionHeader
              title="Live Context"
              description="What the AI sees right now."
              icon={<TrendingUp className="h-5 w-5" />}
            />
            {!contextSummary ? (
              <EmptyState
                icon={<TrendingUp className="h-6 w-6" />}
                title="Context unavailable"
                hint="Could not build the AI context summary."
              />
            ) : (
              <ul className="mt-4 space-y-2">
                <ContextRow
                  label="Pipeline value"
                  value={formatNGN(contextSummary.pipelineValue, true)}
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  tone="primary"
                />
                <ContextRow
                  label="Outstanding invoices"
                  value={formatNGN(contextSummary.outstandingAmount, true)}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  tone={contextSummary.outstandingAmount > 0 ? "warning" : "default"}
                />
                <ContextRow
                  label="Overdue invoices"
                  value={formatNGN(contextSummary.overdueAmount, true)}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  tone={contextSummary.overdueAmount > 0 ? "danger" : "default"}
                />
                <ContextRow
                  label="Cash position"
                  value={formatNGN(contextSummary.cashPosition, true)}
                  icon={<Shield className="h-3.5 w-3.5" />}
                  tone={contextSummary.cashPosition < 0 ? "danger" : "primary"}
                />
                <ContextRow
                  label="Pending approvals"
                  value={String(contextSummary.pendingApprovals)}
                  icon={<Shield className="h-3.5 w-3.5" />}
                  tone={contextSummary.pendingApprovals > 0 ? "warning" : "default"}
                />
                <ContextRow
                  label="Open tasks"
                  value={`${contextSummary.openTasks} (${contextSummary.overdueTasks} overdue)`}
                  icon={<Target className="h-3.5 w-3.5" />}
                  tone={contextSummary.overdueTasks > 0 ? "warning" : "default"}
                />
                <ContextRow
                  label="Active projects"
                  value={String(contextSummary.activeProjects)}
                  icon={<Zap className="h-3.5 w-3.5" />}
                  tone="default"
                />
                <ContextRow
                  label="Distractions"
                  value={String(contextSummary.distractions)}
                  icon={<Circle className="h-3.5 w-3.5" />}
                  tone={contextSummary.distractions > 0 ? "warning" : "default"}
                />
              </ul>
            )}

            {/* top priorities list */}
            {contextSummary && contextSummary.topPriorities.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Top priorities
                </p>
                <ul className="space-y-1">
                  {contextSummary.topPriorities.slice(0, 5).map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* upcoming deadlines list */}
            {contextSummary && contextSummary.upcomingDeadlines.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Upcoming deadlines
                </p>
                <ul className="space-y-1">
                  {contextSummary.upcomingDeadlines.slice(0, 6).map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* === Quick Prompts === */}
          <Card className="p-5">
            <SectionHeader
              title="Quick Prompts"
              description="Click to send a question to the AI."
              icon={<MessageSquare className="h-5 w-5" />}
            />
            <div className="mt-4 flex flex-col gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={!!busy}
                  onClick={() => handleQuickPrompt(q)}
                  className={cn(
                    "group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-all",
                    "hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary opacity-70 group-hover:opacity-100" />
                    <span>{q}</span>
                  </span>
                  <Send className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Prompts run via the chat action — your response appears in the AI Console.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ActionButton({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      disabled={disabled}
      className="h-auto flex-col gap-1.5 py-3"
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </Button>
  );
}

function ThinkingIndicator({ action }: { action: Action }) {
  const label =
    action === "daily_plan"
      ? "Building your daily plan"
      : action === "risk_check"
      ? "Scanning for risks"
      : action === "proposal_draft"
      ? "Drafting proposal"
      : "DIDI is thinking";
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          <span className="absolute -inset-1.5 animate-ping rounded-full bg-primary/20" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-primary">{label}…</p>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Action confirmation badges — shows what DIDI did
// ============================================================
function actionIcon(type: string): React.ReactNode {
  switch (type) {
    case "create_task":
      return <CheckCircle2 className="h-3 w-3" />;
    case "complete_task":
      return <CheckCircle2 className="h-3 w-3" />;
    case "create_followup":
      return <Phone className="h-3 w-3" />;
    case "create_account":
      return <Briefcase className="h-3 w-3" />;
    case "create_opportunity":
      return <OppIcon className="h-3 w-3" />;
    default:
      return <CheckCircle2 className="h-3 w-3" />;
  }
}

function actionLabel(r: ActionResult): string {
  switch (r.type) {
    case "create_task":
      return r.ok ? `Task created: ${r.title ?? "—"}` : `Failed to create task${r.error ? ` — ${r.error}` : ""}`;
    case "complete_task":
      return r.ok ? `Task completed: ${r.title ?? "—"}` : `Couldn't complete task${r.taskTitle ? ` "${r.taskTitle}"` : ""}${r.error ? ` — ${r.error}` : ""}`;
    case "create_followup":
      return r.ok ? `Follow-up scheduled: ${r.subject ?? "—"}` : `Failed to schedule follow-up${r.error ? ` — ${r.error}` : ""}`;
    case "create_account":
      return r.ok ? `Account created: ${r.name ?? "—"}` : `Couldn't create account${r.error === "account_exists" ? " — already exists" : r.error ? ` — ${r.error}` : ""}`;
    case "create_opportunity":
      return r.ok
        ? `Opportunity created: ${r.name ?? "—"}${typeof r.value === "number" ? ` (${formatNGN(r.value, true)})` : ""}`
        : `Failed to create opportunity${r.error ? ` — ${r.error}` : ""}`;
    default:
      return r.ok ? `Action: ${r.type}` : `Failed action${r.error ? ` — ${r.error}` : ""}`;
  }
}

function ActionBadges({
  results,
  compact = false,
}: {
  results: ActionResult[];
  compact?: boolean;
}) {
  if (results.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", compact && "gap-1")}>
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
            compact && "text-[10px] py-0.5",
            r.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          )}
        >
          <span className={r.ok ? "text-emerald-400" : "text-rose-400"}>
            {actionIcon(r.type)}
          </span>
          <span className="truncate">{actionLabel(r)}</span>
        </span>
      ))}
    </div>
  );
}

function ContextRow({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-amber-400",
    danger: "text-red-400",
  }[tone];
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </span>
      <span className={cn("text-sm font-semibold tabular-nums", toneClass)}>{value}</span>
    </li>
  );
}

// Lightweight markdown renderer (no typography plugin) with manual prose-like styling
function MarkdownRender({ content, compact = false }: { content: string; compact?: boolean }) {
  return (
    <div className={cn("text-sm leading-relaxed text-foreground/90", compact && "text-xs")}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className={cn("font-semibold tracking-tight mt-3 mb-2", compact ? "text-sm" : "text-base")}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={cn("font-semibold tracking-tight mt-3 mb-2", compact ? "text-sm" : "text-base")}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={cn("font-semibold mt-2 mb-1.5", compact ? "text-xs" : "text-sm")}>{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 ml-1 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-1 space-y-1 list-decimal pl-4">{children}</ol>,
          li: ({ children }) => (
            <li className="relative pl-4 before:absolute before:left-0 before:content-['•'] before:text-primary/70">
              {children}
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono text-foreground">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold bg-muted/40">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
