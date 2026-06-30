"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

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

export function DidiPageHelper({ moduleId }: { moduleId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  const premise = PAGE_PREMISES[moduleId] || "This page helps you manage your business operations.";

  async function askDIDI() {
    if (!question.trim()) return;
    setLoading(true);
    setReply("");
    try {
      const res = await fetch("/api/doz/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat_with_actions",
          message: `[On the ${moduleId} page] ${question}`,
        }),
      });
      const data = await res.json();
      setReply(data.reply || data.response || "I couldn't process that right now.");
    } catch {
      setReply("I'm having trouble connecting. Please try again.");
      toast.error("DIDI is unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-l-4 border-l-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <p className="flex-1 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">DIDI:</span> {premise}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-primary"
          onClick={() => setExpanded(!expanded)}
        >
          <Sparkles className="h-3 w-3" />
          Ask DIDI
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask DIDI about this page...`}
              rows={2}
              className="text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  askDIDI();
                }
              }}
            />
            <Button
              size="sm"
              onClick={askDIDI}
              disabled={loading || !question.trim()}
              className="h-9 shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {reply && (
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">DIDI</span>
              </div>
              <div className="prose prose-sm max-w-none text-xs text-muted-foreground">
                <ReactMarkdown>{reply}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
