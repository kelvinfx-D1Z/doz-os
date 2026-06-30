"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X, Loader2, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAppStore, type ModuleId } from "@/lib/store";

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
};

interface Message {
  role: "user" | "didi";
  content: string;
  actionResults?: any[];
}

export function DidiBubble() {
  const { activeModule } = useAppStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const premise = PAGE_PREMISES[activeModule] || "This page helps you manage your business operations.";

  // Show premise as first message when opening on a new page
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "didi", content: `Hi Kelvin! I'm DIDI, your AI Growth Coach. \n\n**This page:** ${premise}\n\nAsk me anything about this page or your business.` }]);
    }
  }, [open, activeModule]);

  // Reset messages when switching pages
  useEffect(() => {
    setMessages([]);
  }, [activeModule]);

  async function ask() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
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
      {/* Floating bubble button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-110"
          title="Ask DIDI"
        >
          <Sparkles className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[500px] max-h-[80vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-primary/10 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">DIDI</p>
                <p className="text-[10px] text-muted-foreground">AI Growth Coach · Online</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

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
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="border-t border-border p-2">
              <div className="flex flex-wrap gap-1">
                {["What should I do here?", "Any risks?", "What's our cash position?"].map(p => (
                  <button
                    key={p}
                    onClick={() => { setInput(p); }}
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
              <Button size="sm" onClick={ask} disabled={loading || !input.trim()} className="h-9 shrink-0">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
