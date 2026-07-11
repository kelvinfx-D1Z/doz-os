"use client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  HelpCircle, Crown, Briefcase, GraduationCap, LayoutDashboard, Target,
  Users2, Clapperboard, Truck, Wallet, UserCog, BookOpen, Sparkles,
  Smartphone, Repeat, Megaphone, Calendar, GraduationCap as Intern,
  ArrowRight, Lightbulb, Shield,
} from "lucide-react";
import { SectionHeader } from "@/components/doz/ui-primitives";

const ROLE_GUIDES: Record<string, { title: string; icon: React.ReactNode; sections: { title: string; items: string[] }[] }> = {
  FOUNDER: {
    title: "Founder & CEO Guide",
    icon: <Crown className="h-5 w-5 text-emerald-400" />,
    sections: [
      { title: "Your Daily Flow", items: [
        "Open the Command Center first — read DIDI's Morning Briefing",
        "Check your Top Priorities and check them off as you complete them",
        "Approve pending payment requests (Procurement → Approvals)",
        "Review the Founder Freedom Score — is it going up?",
        "Log your time at end of day (helps track delegation)",
      ]},
      { title: "Your Weekly Flow", items: [
        "Monday: Read the Weekly CEO Review + assign intern tasks (Staff Hub)",
        "Tuesday: Sales day — check CRM pipeline and follow up on proposals",
        "Wednesday: Creative — review project deliverables",
        "Thursday: Product — work on Fiestivo.com or FounderOS",
        "Friday: Review — check financial dashboard, review intern reports",
      ]},
      { title: "Managing Your Team", items: [
        "Staff Hub: Add staff, assign tasks, set pillar allocations (DOZ/Fiestivo/FounderOS)",
        "Use 'DIDI Assign' to describe work in natural language — DIDI breaks it into tasks",
        "Internship Program: Track milestone completion and submit daily standups",
        "Team Management: Add/edit/deactivate team members, change passwords",
      ]},
      { title: "Key Metrics to Watch", items: [
        "Growth Dashboard: Company Health Score (target 75+)",
        "Founder Freedom Score: Are you building independence? (target 50+)",
        "Focus Score: Are your tasks connected to goals? (target 75+)",
        "Revenue vs Target: Are you on pace for ₦120M this year?",
        "Referral Dependency: Is it going down? (target <40%)",
      ]},
    ],
  },
  STAFF: {
    title: "Staff Guide",
    icon: <Briefcase className="h-5 w-5 text-teal-400" />,
    sections: [
      { title: "Your Daily Flow", items: [
        "Open the Command Center — see YOUR tasks and approvals",
        "Complete your assigned tasks and check them off",
        "File your daily report (Field Mode or Team Management)",
        "Check pending approvals you can action",
      ]},
      { title: "Managing Projects", items: [
        "Projects & Events: View project financials, crew, milestones, vendor costs",
        "Add vendor costs to projects (fee, advance, balance tracking)",
        "Procurement: Add expenses, record payments, manage vendors",
        "Use the Calendar to see upcoming deadlines",
      ]},
      { title: "Working with the Team", items: [
        "Staff Hub: See your tasks and responsibilities",
        "Assign tasks to interns when needed",
        "Submit daily standups in the Internship Program",
      ]},
    ],
  },
  INTERN: {
    title: "Intern Guide",
    icon: <GraduationCap className="h-5 w-5 text-violet-400" />,
    sections: [
      { title: "Your Daily Flow", items: [
        "Open the Command Center — see YOUR tasks for today",
        "Complete tasks and check them off",
        "File your daily report before 6 PM (Field Mode → Daily Report)",
        "Submit your daily standup (Internship Program → Daily Standup tab)",
      ]},
      { title: "Your Internship Journey", items: [
        "Internship Program: Track your milestones across 4 quarters",
        "Click milestones to mark them as In Progress or Completed",
        "Your pillar allocation: 50% DOZ Studios, 30% Fiestivo, 20% FounderOS",
        "Monthly Learning Goals: focus on the current month's skill",
      ]},
      { title: "Learning Resources", items: [
        "SOP & Knowledge: Read templates, checklists, and training materials",
        "Field Mode: File reports and run event day checklists from your phone",
        "Ask DIDI anything — she's at the bottom-right of every page",
      ]},
      { title: "Weekly Structure", items: [
        "Monday: Team planning meeting (30 min)",
        "Tuesday: Learning day (2-hour training)",
        "Wednesday: Project work",
        "Thursday: Innovation day (Fiestivo/FounderOS)",
        "Friday: Reflection — what did I learn, build, struggle with?",
      ]},
    ],
  },
  FREELANCER: {
    title: "Production Manager Guide",
    icon: <Briefcase className="h-5 w-5 text-fuchsia-400" />,
    sections: [
      { title: "Your Daily Flow", items: [
        "Open the Command Center — see your assigned tasks and crew status",
        "Check your project's equipment list and budget status",
        "File your daily report before end of day (Field Mode)",
      ]},
      { title: "Managing Your Project", items: [
        "Projects & Events: You only see projects where you're the PM",
        "Build the equipment list from the 304-item library (28 categories)",
        "For each item: set quantity, unit price, and attach a vendor",
        "Select vendors from the database OR add new ones with bank details",
        "Submit your budget for founder approval when ready",
        "Track budget status: DRAFT → SUBMITTED → APPROVED",
      ]},
      { title: "What You Can See", items: [
        "Your project's equipment list and costs (your budget)",
        "Vendors with contact details and bank information",
        "RFQs and purchase orders for your project",
        "Your crew assignments and tasks",
        "You CANNOT see: company revenue, contract value, profit, or client payment details",
      ]},
      { title: "Procurement", items: [
        "View RFQs, quotes, and purchase orders for your project",
        "Add new vendors to the database (they appear in Onboarding tab)",
        "Track payment status for your vendors",
      ]},
      { title: "Field Mode", items: [
        "File daily reports from your phone on-site",
        "Run the event day checklist (offline capable)",
        "Log issues and track crew check-in status",
      ]},
    ],
  },
};

const MODULE_GUIDES = [
  { name: "Command Center", icon: <LayoutDashboard className="h-4 w-4" />, desc: "Your daily dashboard — priorities, approvals, cash, team activity" },
  { name: "Growth Dashboard", icon: <Target className="h-4 w-4" />, desc: "Company health score and 39 live KPIs tracking the ₦500M vision" },
  { name: "Founder's Roadmap", icon: <Crown className="h-4 w-4" />, desc: "12-month CEO plan — daily activities, quarterly milestones, ecosystem vision" },
  { name: "DIDI", icon: <Sparkles className="h-4 w-4" />, desc: "AI Growth Coach — ask anything, create tasks, draft proposals. Floating bubble on every page." },
  { name: "CRM & Sales", icon: <Users2 className="h-4 w-4" />, desc: "Real customers vs potentials, pipeline, proposals, follow-ups with assignment" },
  { name: "Marketing & Growth", icon: <Megaphone className="h-4 w-4" />, desc: "12 posts/month tracker, content ideas, SEO, email list, partnerships" },
  { name: "Projects & Events", icon: <Clapperboard className="h-4 w-4" />, desc: "Project financials, crew, vendor costs, equipment lists, milestones" },
  { name: "Procurement & Payments", icon: <Truck className="h-4 w-4" />, desc: "Vendors, expenses, payments, 3-way segregation (Requester ≠ Approver ≠ Payer)" },
  { name: "Financial Intelligence", icon: <Wallet className="h-4 w-4" />, desc: "P&L by project/client/service, invoices, reminders, budgets" },
  { name: "Staff Hub", icon: <UserCog className="h-4 w-4" />, desc: "Manage staff, assign tasks, DIDI creates activities, track pillar allocations" },
  { name: "Calendar", icon: <Calendar className="h-4 w-4" />, desc: "All projects, tasks, invoices, and follow-ups in a month grid" },
  { name: "Internship Program", icon: <Intern className="h-4 w-4" />, desc: "12-month NJFP program — 84 milestones, daily standups, performance reviews" },
  { name: "Routines", icon: <Repeat className="h-4 w-4" />, desc: "Business rhythm checklists — morning, weekly review, event day, monthly close" },
  { name: "Field Mode", icon: <Smartphone className="h-4 w-4" />, desc: "Mobile report filing + offline event run-sheet" },
  { name: "SOP & Knowledge", icon: <BookOpen className="h-4 w-4" />, desc: "Templates, checklists, policies, case studies, training materials" },
];

export function HelpPage() {
  const { user } = useCurrentUser();
  const role = user?.role || "FOUNDER";
  const guide = ROLE_GUIDES[role] || ROLE_GUIDES.FOUNDER;
  const isFounder = role === "FOUNDER";

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<HelpCircle className="h-5 w-5" />}
        title="Help & Guide"
        description={`Personalized for ${user?.name || "you"} — ${guide.title}`}
      />

      {/* Role-specific guide */}
      <Card className="border-l-4 border-l-primary p-5">
        <div className="mb-4 flex items-center gap-2">
          {guide.icon}
          <h2 className="text-sm font-semibold">{guide.title}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {guide.sections.map((section, i) => (
            <div key={i} className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold text-primary">{section.title}</p>
              <ul className="space-y-1.5">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Module guides — FOUNDER only */}
      {isFounder && (
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-amber-400" /> Module Guide — What Each Page Does
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_GUIDES.map((m, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
              <span className="mt-0.5 text-primary">{m.icon}</span>
              <div>
                <p className="text-xs font-semibold">{m.name}</p>
                <p className="text-[10px] text-muted-foreground">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {/* DIDI tip — FOUNDER only */}
      {isFounder && (
      <Card className="border-l-4 border-l-amber-500/50 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> DIDI is Here to Help
        </div>
        <p className="text-xs text-muted-foreground">
          DIDI is the floating bubble at the bottom-right of every page. Click it to ask questions about the current page, create tasks, draft proposals, or get business advice. DIDI knows which page you're on and has access to your live business data.
        </p>
      </Card>
      )}

      {/* Quick tips */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-primary" /> Quick Tips
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-xs text-muted-foreground">• Press <kbd className="rounded border bg-muted px-1 text-[10px]">⌘K</kbd> to jump between modules</div>
          <div className="text-xs text-muted-foreground">• Click task checkboxes to mark complete</div>
          {isFounder && <div className="text-xs text-muted-foreground">• Use DIDI Assign in Staff Hub to create tasks from descriptions</div>}
          <div className="text-xs text-muted-foreground">• Click milestone icons to cycle status</div>
        </div>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground">
        DOZ OS · Digit One Zero Ltd · Lagos, Nigeria
      </p>
    </div>
  );
}
