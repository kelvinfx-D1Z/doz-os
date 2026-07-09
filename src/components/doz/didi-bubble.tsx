"use client";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Send, X, Loader2, ChevronUp, AlertTriangle,
  CheckCircle2, TrendingUp, Lightbulb, Bell, Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";

const PAGE_PREMISES: Record<string, string> = {
  command: "Your daily command center — priorities, approvals, cash position, and team activity at a glance.",
  planning: "Strategic planning — connect daily tasks to annual goals. Annual → Quarterly → Monthly → Weekly → Daily.",
  routines: "Business routines — run the same playbook every time. Morning briefings, weekly reviews, event day checklists.",
  ai: "Talk to DIDI — your AI Growth Coach. Ask anything about the business, create tasks, draft proposals.",
  field: "Field Mode — file daily reports and run event day checklists from your phone, even offline.",
  crm: "CRM & Sales — track leads, opportunities, proposals, and referrals. Manage your sales pipeline.",
  marketing: "Marketing & Growth — reduce referral dependency, plan content, nurture referral sources.",
  projects: "Projects & Events — manage every production, track financials, assign crew, monitor deliverables.",
  procurement: "Procurement & Payments — manage vendors, RFQs, purchase orders, and payments with 3-way segregation.",
  finance: "Financial Intelligence — profit by project, client, and service. Track invoices, expenses, and cash flow.",
  team: "Team Management — manage interns, freelancers, staff. Daily reports, weekly tasks, hiring plan.",
  sop: "SOP & Knowledge Base — proposal templates, event checklists, procurement policies, training materials.",
  internship: "NJFP Internship Programme — 12-month structured development for Akpala and Esther.",
  founder: "Founder's Roadmap — your 12-month journey from Operator to CEO. Systems, revenue, brand, assets, products.",
  calendar: "Calendar — all projects, tasks, and deadlines at a glance.",
  growth: "Growth Dashboard — progress toward the ₦500M vision. Live KPIs, health score, 9 sections.",
  "staff-hub": "Staff Hub — manage your team, assign tasks, and track responsibilities across all pillars.",
  help: "Help & Guide — personalized guidance for your role and each module.",
};

interface Message {
  role: "user" | "didi";
  content: string;
  actionResults?: any[];
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

const QUICK_PROMPTS = [
  "What should I focus on today?",
  "Any risks I should know about?",
  "What's our cash position?",
  "Which proposals need follow-up?",
  "How are the interns doing?",
  "What can I delegate?",
];

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const premise = PAGE_PREMISES[activeModule] || "This page helps you manage your business operations.";

  // Fetch proactive insights when DIDI opens
  useEffect(() => {
    if (open && insights.length === 0) {
      fetchInsights();
    }
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function fetchInsights() {
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/doz/didi/proactive");
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights || []);
      setRecommendations(data.recommendations || []);
      setInsightCount(data.summary?.critical + data.summary?.warnings + data.summary?.actions || 0);

      if (data.autoTasksCreated > 0) {
        toast.success(`DIDI created ${data.autoTasksCreated} task(s) for you`);
      }
    } catch {
      // Silent fail — insights are optional
    } finally {
      setLoadingInsights(false);
    }
  }

  // Show premise as first message when opening on a new page
  useEffect(() => {
    if (open && messages.length === 0) {
      const insightNote = insightCount > 0
        ? `\n\n⚠ I've detected **${insightCount} issue${insightCount > 1 ? "s" : ""}** that need your attention. Click "Insights" above to see them.`
        : "\n\n✓ Everything looks good right now. No critical issues detected.";
      setMessages([{ role: "didi", content: `Hi Kelvin! I'm DIDI, your AI Growth Coach.\n\n**This page:** ${premise}${insightNote}` }]);
    }
  }, [open, activeModule, insightCount]);

  // Reset messages when switching pages
  useEffect(() => {
    setMessages([]);
  }, [activeModule]);

  async function ask(prompt?: string) {
    const userMsg = (prompt || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/doz/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat_with_actions",
          message: `[On the ${activeModule} page] ${userMsg}`,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.response || "I couldn't process that right now.";
      setMessages(prev => [...prev, { role: "didi", content: reply, actionResults: data.actionResults || [] }]);
    } catch {
      setMessages(prev => [...prev, { role: "didi", content: "I'm having trouble connecting. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating bubble button with insight badge */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-110"
          title="Ask DIDI"
        >
          <Sparkles className="h-6 w-6" />
          {insightCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
              {insightCount}
            </span>
          )}
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] max-h-[85vh] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-primary/10 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
              </div>
              <div>
                <p className="text-sm font-semibold">DIDI</p>
                <p className="text-[10px] text-muted-foreground">AI Growth Coach · Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {insightCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-rose-400"
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

          {/* Proactive Insights Panel */}
          {showInsights && (
            <div className="scroll-thin max-h-48 overflow-y-auto border-b border-border p-2 space-y-1.5">
              {loadingInsights ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="ml-2 text-xs text-muted-foreground">DIDI is scanning your business...</span>
                </div>
              ) : (
                <>
                  {insights.map((insight, i) => (
                    <div key={i} className={`rounded-lg border-l-2 p-2 ${SEVERITY_COLORS[insight.severity] || ""}`}>
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">{SEVERITY_ICONS[insight.severity]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground">{insight.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{insight.message}</p>
                          {insight.recommendedAction && (
                            <p className="text-[10px] text-primary mt-1">→ {insight.recommendedAction}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {recommendations.length > 0 && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 mt-2">
                      <p className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" /> DIDI's Recommendations
                      </p>
                      {recommendations.map((r, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground">• {r}</p>
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
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {msg.role === "didi" && (
                    <div className="mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-semibold uppercase text-primary">DIDI</span>
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.actionResults && msg.actionResults.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                      {msg.actionResults.filter((r: any) => r.ok).map((r: any, j: number) => (
                        <div key={j} className="flex items-center gap-1 text-[10px] text-primary">
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
                <div className="flex items-center gap-1 rounded-2xl bg-muted p-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "0ms" }}></span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "150ms" }}></span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="border-t border-border p-2">
              <div className="flex flex-wrap gap-1">
                {QUICK_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => ask(p)}
                    className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask DIDI anything..."
                rows={1}
                className="min-h-[36px] resize-none text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
              <Button size="sm" onClick={() => ask()} disabled={loading || !input.trim()} className="h-9 shrink-0">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
