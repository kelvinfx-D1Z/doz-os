"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Send, X, Loader2, AlertTriangle, CheckCircle2,
  TrendingUp, Lightbulb, Bell, Zap, ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";

// ============================================================
// DIDI PAGE CONTEXT — knows what each page is about and
// suggests relevant actions
// ============================================================
const PAGE_CONTEXT: Record<string, {
  premise: string;
  suggestions: string[];
  dataHints: string;
}> = {
  command: {
    premise: "Your daily command center — priorities, approvals, cash position, and team activity at a glance.",
    suggestions: [
      "What should I focus on today?",
      "Approve pending payments",
      "What's our cash position?",
      "Any risks I should know about?",
    ],
    dataHints: "dashboard data: KPIs, top priorities, pending approvals, overdue items, pipeline, cash, team activity, AI insights",
  },
  growth: {
    premise: "Growth Dashboard — 39 live KPIs tracking the ₦500M vision. Company Health Score and 9 sections.",
    suggestions: [
      "Which KPIs are most behind?",
      "How do we reduce referral dependency?",
      "What's our revenue vs target?",
      "Which area needs the most attention?",
    ],
    dataHints: "growth KPIs, health score, revenue vs target, referral dependency, pipeline coverage, marketing leads %",
  },
  founder: {
    premise: "Founder's Roadmap — your 12-month journey from Operator to CEO. Daily activities, quarterly milestones, ecosystem vision.",
    suggestions: [
      "What should I do this week?",
      "Am I on track for Q1?",
      "What can I delegate?",
      "Review my monthly scorecard",
    ],
    dataHints: "founder milestones, quarterly progress, weekly schedule, monthly commitments, ecosystem pillars",
  },
  crm: {
    premise: "CRM & Sales — real customers vs potentials, pipeline, proposals, and follow-ups with team assignment.",
    suggestions: [
      "Which proposals need follow-up?",
      "How many real customers do we have?",
      "What's our pipeline value?",
      "Which opportunities are stalled?",
    ],
    dataHints: "CRM data: real customers, potential customers, open opportunities, pipeline value, proposals sent/accepted, follow-ups, referrals",
  },
  marketing: {
    premise: "Marketing & Growth — 12 posts/month tracker, content ideas, SEO, email list, and strategic partnerships.",
    suggestions: [
      "Are we on track for 12 posts this month?",
      "What content should we create this week?",
      "How's our referral dependency?",
      "What partnerships should we pursue?",
    ],
    dataHints: "marketing data: posts this month, content calendar, referral sources, campaigns, SEO gaps, email subscribers, partnerships",
  },
  projects: {
    premise: "Projects & Events — manage every production with financials, crew, equipment, vendor costs, and contracts.",
    suggestions: [
      "Which projects are at risk?",
      "What's our most profitable project?",
      "Which projects have overdue deliverables?",
      "Show me project financials summary",
    ],
    dataHints: "project data: active projects, revenue, expenses, profit, margins, crew, equipment, vendor costs, milestones, deliverables",
  },
  procurement: {
    premise: "Procurement & Payments — vendors, expenses, payments with 3-way segregation (Requester ≠ Approver ≠ Payer).",
    suggestions: [
      "What payments are pending approval?",
      "How much have we paid vendors this month?",
      "Are there any segregation violations?",
      "Which vendors do we use most?",
    ],
    dataHints: "procurement data: pending approvals, payment requests, vendors, expenses, purchase orders, segregation status",
  },
  finance: {
    premise: "Financial Intelligence — profit by project/client/service, invoices, expenses, cash flow, and budgets.",
    suggestions: [
      "What's our cash position?",
      "Which invoices are overdue?",
      "What's our profit margin?",
      "Show me the 90-day cash flow forecast",
    ],
    dataHints: "financial data: revenue, expenses, profit, margin, outstanding invoices, overdue invoices, cash position, cash flow forecast, budgets",
  },
  "staff-hub": {
    premise: "Staff Hub — manage your team, assign tasks, track responsibilities across DOZ Studios, Fiestivo, and FounderOS pillars.",
    suggestions: [
      "Who has the most overdue tasks?",
      "What should I delegate today?",
      "How are the interns doing?",
      "Create tasks for Akpala from a description",
    ],
    dataHints: "staff data: team members, roles, pillar allocations, tasks per person, overdue tasks, intern progress",
  },
  calendar: {
    premise: "Calendar — all projects, tasks, invoices, and follow-ups in a month grid view.",
    suggestions: [
      "What's coming up this week?",
      "Are there any scheduling conflicts?",
      "What events do we have this month?",
      "Any deadlines I should worry about?",
    ],
    dataHints: "calendar data: upcoming events, project dates, task due dates, invoice due dates, follow-up dates",
  },
  internship: {
    premise: "NJFP Internship Programme — 12-month structured development for Akpala Arome (Operations) and Esther Joseph (Brand & Content).",
    suggestions: [
      "How are the interns progressing?",
      "What milestones are due this month?",
      "What should Akpala focus on?",
      "What should Esther focus on?",
    ],
    dataHints: "internship data: milestone progress per intern, current quarter, weekly structure, monthly learning goals, standups",
  },
  planning: {
    premise: "Strategic Planning — connect daily tasks to annual goals. Annual → Quarterly → Monthly → Weekly → Daily cascade.",
    suggestions: [
      "Are my tasks aligned with my goals?",
      "What's my focus score?",
      "What distractions should I eliminate?",
      "Plan tasks with DIDI based on goals",
    ],
    dataHints: "planning data: goals cascade, tasks by priority, focus score, alignment %, distractions, weekly objective progress",
  },
  routines: {
    premise: "Business routines — run the same playbook every time. Morning briefings, weekly reviews, event day checklists.",
    suggestions: [
      "What routine should I run today?",
      "Start the morning briefing",
      "What's my routine streak?",
      "Start the weekly business review",
    ],
    dataHints: "routines data: 6 routine templates, completion stats, streak, recent completions",
  },
  field: {
    premise: "Field Mode — file daily reports and run event day checklists from your phone, even offline.",
    suggestions: [
      "File my daily report",
      "Start an event run-sheet",
      "What events are coming up?",
      "Show me my crew assignments",
    ],
    dataHints: "field data: daily report status, crew assignments, project event dates, offline run-sheets",
  },
  sop: {
    premise: "SOP & Knowledge Base — proposal templates, event checklists, procurement policies, training materials.",
    suggestions: [
      "What SOPs do we have?",
      "Show me the event checklist",
      "What training materials are available?",
      "Find the procurement policy",
    ],
    dataHints: "SOP data: categories, document count, recent updates, case studies",
  },
  help: {
    premise: "Help & Guide — personalized guidance for your role and each module in DOZ OS.",
    suggestions: [
      "How do I add a new project?",
      "How do I assign tasks to interns?",
      "How do I use DIDI effectively?",
      "What's the best workflow for event day?",
    ],
    dataHints: "help data: role-specific guides, module descriptions, quick tips",
  },
  team: {
    premise: "Team Management — manage interns, freelancers, staff. Daily reports, weekly tasks, hiring plan.",
    suggestions: [
      "Who hasn't filed their daily report?",
      "Show me the hiring plan",
      "How's team utilization?",
      "What weekly tasks are assigned?",
    ],
    dataHints: "team data: members, daily reports, weekly reports, weekly tasks, hiring stages, team utilization",
  },
};

interface Message {
  role: "user" | "didi";
  content: string;
  actionResults?: any[];
  timestamp: number;
}

interface ProactiveInsight {
  type: string;
  severity: string;
  title: string;
  message: string;
  recommendedAction?: string;
}

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  CRITICAL: <AlertTriangle className="h-3 w-3 text-rose-400" />,
  WARNING: <AlertTriangle className="h-3 w-3 text-amber-400" />,
  ACTION: <Zap className="h-3 w-3 text-primary" />,
  OPPORTUNITY: <TrendingUp className="h-3 w-3 text-teal-400" />,
  POSITIVE: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "border-l-rose-500/50 bg-rose-500/5",
  WARNING: "border-l-amber-500/50 bg-amber-500/5",
  ACTION: "border-l-primary/50 bg-primary/5",
  OPPORTUNITY: "border-l-teal-500/50 bg-teal-500/5",
  POSITIVE: "border-l-emerald-500/50 bg-emerald-500/5",
};

export function DidiBubble() {
  const { activeModule } = useAppStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [insightCount, setInsightCount] = useState(0);
  const [showInsights, setShowInsights] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [hasFetchedInsights, setHasFetchedInsights] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const context = PAGE_CONTEXT[activeModule] || {
    premise: "This page helps you manage your business operations.",
    suggestions: ["What should I focus on?", "Any risks?", "What's our cash position?"],
    dataHints: "general business data",
  };

  // Fetch proactive insights once when DIDI first opens
  const fetchInsights = useCallback(async () => {
    if (hasFetchedInsights) return;
    setLoadingInsights(true);
    setHasFetchedInsights(true);
    try {
      const res = await fetch("/api/doz/didi/proactive");
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights || []);
      setRecommendations(data.recommendations || []);
      const critical = data.summary?.critical || 0;
      const actions = data.summary?.actions || 0;
      setInsightCount(critical + actions);
      if (data.autoTasksCreated > 0) {
        toast.success(`DIDI created ${data.autoTasksCreated} task(s) for you`);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingInsights(false);
    }
  }, [hasFetchedInsights]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // When DIDI opens, fetch insights and show greeting
  useEffect(() => {
    if (open) {
      fetchInsights();
      if (messages.length === 0) {
        const insightNote = insightCount > 0
          ? `\n\n⚠ I've detected **${insightCount} issue${insightCount > 1 ? "s" : ""}** needing attention. Tap the bell icon above to see them.`
          : `\n\n✅ Everything looks good right now — no critical issues.`;
        setMessages([{
          role: "didi",
          content: `Hi Kelvin! I'm **DIDI**, your AI Growth Coach.\n\n**This page:** ${context.premise}${insightNote}\n\nAsk me anything, or tap a suggestion below 👇`,
          timestamp: Date.now(),
        }]);
      }
    }
  }, [open]);

  // Reset conversation when switching pages
  useEffect(() => {
    setMessages([]);
    setShowInsights(false);
  }, [activeModule]);

  // Focus input when opened
  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, loading]);

  async function ask(prompt?: string) {
    const userMsg = (prompt || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch("/api/doz/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat_with_actions",
          message: `[Context: User is on the ${activeModule} page. ${context.dataHints}] ${userMsg}`,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.response || "I couldn't process that. Please try rephrasing.";
      setMessages(prev => [...prev, {
        role: "didi",
        content: reply,
        actionResults: data.actionResults || [],
        timestamp: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "didi",
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 transition-all hover:scale-110 active:scale-95"
          title="Talk to DIDI"
          aria-label="Open DIDI chat"
        >
          <Sparkles className="h-6 w-6" />
          {insightCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {insightCount}
            </span>
          )}
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" style={{ animationDuration: "3s" }} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[600px] max-h-[85vh] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/15 to-transparent p-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary ring-2 ring-primary/30">
                <Sparkles className="h-4 w-4" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
              </div>
              <div>
                <p className="text-sm font-bold">DIDI</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  AI Growth Coach · Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {insightCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-rose-400 hover:bg-rose-500/10"
                  onClick={() => setShowInsights(!showInsights)}
                >
                  <Bell className="h-3 w-3" />
                  {insightCount}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); setShowInsights(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Insights panel */}
          {showInsights && (
            <div className="scroll-thin max-h-52 overflow-y-auto border-b border-border p-2 space-y-1.5">
              {loadingInsights ? (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">DIDI is scanning your business...</span>
                </div>
              ) : (
                <>
                  {insights.map((insight, i) => (
                    <div key={i} className={`rounded-lg border-l-2 p-2 ${SEVERITY_COLORS[insight.severity] || ""}`}>
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">{SEVERITY_ICONS[insight.severity]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground">{insight.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{insight.message}</p>
                          {insight.recommendedAction && (
                            <p className="text-[10px] text-primary mt-1 font-medium">→ {insight.recommendedAction}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {recommendations.length > 0 && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 mt-2">
                      <p className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" /> DIDI's Smart Recommendations
                      </p>
                      {recommendations.map((r, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">• {r}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-xs ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}>
                  {msg.role === "didi" && (
                    <div className="mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-primary">DIDI</span>
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mb-1 [&>li]:mb-0.5 [&>strong]:text-inherit">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.actionResults && msg.actionResults.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                      {msg.actionResults.filter((r: any) => r.ok).map((r: any, j: number) => (
                        <div key={j} className="flex items-center gap-1 text-[10px] text-primary font-medium">
                          ✓ {r.type === "create_task" ? "Task created" : r.type === "create_followup" ? "Follow-up created" : r.type === "create_account" ? "Account created" : "Action completed"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-muted p-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                  <span className="ml-1 text-[10px] text-muted-foreground">DIDI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions — context-aware per page */}
          {messages.length <= 1 && !loading && (
            <div className="border-t border-border p-2">
              <div className="flex flex-wrap gap-1">
                {context.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => ask(s)}
                    className="rounded-full bg-muted/60 px-2.5 py-1 text-[10px] text-muted-foreground transition-all hover:bg-primary/15 hover:text-primary active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask DIDI about ${activeModule}...`}
                rows={1}
                className="min-h-[38px] resize-none text-xs leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => ask()}
                disabled={loading || !input.trim()}
                className="h-9 shrink-0"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
