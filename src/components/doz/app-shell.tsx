"use client";
import { useAppStore, type ModuleId } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Target,
  Users2,
  Clapperboard,
  Truck,
  Wallet,
  UserCog,
  BookOpen,
  Sparkles,
  Search,
  Bell,
  Command,
  ChevronRight,
  CircleDot,
} from "lucide-react";
import { CommandCenter } from "@/components/modules/command-center";
import { StrategicPlanning } from "@/components/modules/strategic-planning";
import { CrmSales } from "@/components/modules/crm-sales";
import { ProjectsEvents } from "@/components/modules/projects-events";
import { Procurement } from "@/components/modules/procurement";
import { Financial } from "@/components/modules/financial";
import { Team } from "@/components/modules/team";
import { SopKnowledge } from "@/components/modules/sop-knowledge";
import { AiChiefOfStaff } from "@/components/modules/ai-chief-of-staff";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useEffect } from "react";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: React.ReactNode;
  group: string;
  hint?: string;
}

const NAV: NavItem[] = [
  { id: "command", label: "Command Center", icon: <LayoutDashboard className="h-4 w-4" />, group: "Operate" },
  { id: "planning", label: "Strategic Planning", icon: <Target className="h-4 w-4" />, group: "Operate" },
  { id: "ai", label: "AI Chief of Staff", icon: <Sparkles className="h-4 w-4" />, group: "Operate", hint: "AI" },
  { id: "crm", label: "CRM & Sales", icon: <Users2 className="h-4 w-4" />, group: "Grow" },
  { id: "projects", label: "Projects & Events", icon: <Clapperboard className="h-4 w-4" />, group: "Deliver" },
  { id: "procurement", label: "Procurement", icon: <Truck className="h-4 w-4" />, group: "Deliver" },
  { id: "finance", label: "Financial Intelligence", icon: <Wallet className="h-4 w-4" />, group: "Control" },
  { id: "team", label: "Team Management", icon: <UserCog className="h-4 w-4" />, group: "Control" },
  { id: "sop", label: "SOP & Knowledge", icon: <BookOpen className="h-4 w-4" />, group: "Scale" },
];

const MODULES: Record<ModuleId, React.ReactNode> = {
  command: <CommandCenter />,
  planning: <StrategicPlanning />,
  crm: <CrmSales />,
  projects: <ProjectsEvents />,
  procurement: <Procurement />,
  finance: <Financial />,
  team: <Team />,
  sop: <SopKnowledge />,
  ai: <AiChiefOfStaff />,
};

const MODULE_META: Record<ModuleId, { title: string; subtitle: string }> = {
  command: { title: "CEO Command Center", subtitle: "Your single view to run the company" },
  planning: { title: "Strategic Planning", subtitle: "Annual → Quarterly → Monthly → Weekly → Daily" },
  crm: { title: "CRM & Sales Engine", subtitle: "Leads, opportunities, proposals, pipeline" },
  projects: { title: "Projects & Event Operations", subtitle: "Deliver every event on time, on budget" },
  procurement: { title: "Procurement & Vendor Management", subtitle: "Requester ≠ Approver ≠ Payer" },
  finance: { title: "Financial Intelligence", subtitle: "Profit by project, client & service" },
  team: { title: "Team Management", subtitle: "Interns, freelancers, accountability" },
  sop: { title: "SOP & Knowledge Base", subtitle: "Process is the product" },
  ai: { title: "AI Chief of Staff", subtitle: "Your digital Operations Director" },
};

export function AppShell() {
  const { activeModule, setModule, commandOpen, setCommandOpen } = useAppStore();

  // keyboard shortcut cmd+k
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandOpen]);

  const grouped = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  const meta = MODULE_META[activeModule];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
              10
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-sidebar-foreground">DOZ OS</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Digit One Zero</p>
            </div>
          </div>

          <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setModule(item.id)}
                        className={cn(
                          "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <span className={cn(active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground")}>
                          {item.icon}
                        </span>
                        <span className="flex-1 text-left font-medium">{item.label}</span>
                        {item.hint === "AI" && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                            AI
                          </span>
                        )}
                        {active && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
              <Avatar className="h-8 w-8 border border-sidebar-border">
                <AvatarFallback className="bg-primary/20 text-xs font-semibold text-primary">
                  AO
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-semibold text-sidebar-foreground">Adaeze Okonkwo</p>
                <p className="truncate text-[10px] text-muted-foreground">Founder & CEO</p>
              </div>
              <CircleDot className="h-3 w-3 text-primary pulse-dot" />
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-primary font-mono text-xs font-bold text-primary-foreground">
                10
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold sm:text-base">{meta.title}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{meta.subtitle}</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 text-muted-foreground md:flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-xs">Search / Jump</span>
              <kbd className="ml-2 inline-flex h-4 items-center gap-0.5 rounded border bg-muted px-1 text-[9px] font-medium">
                ⌘K
              </kbd>
            </Button>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCommandOpen(true)}>
              <Command className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
            </Button>
          </header>

          {/* Mobile nav */}
          <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeModule === item.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* Module content */}
          <main className="scroll-thin flex-1 overflow-y-auto p-4 lg:p-6">
            <div key={activeModule} className="mx-auto max-w-[1400px] animate-in fade-in-50 duration-300">
              {MODULES[activeModule]}
            </div>
          </main>
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-border bg-card/50 px-4 py-2.5 lg:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-primary">DOZ OS</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Founder Operating System v1.0</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1 border-primary/30 text-[10px] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
            </Badge>
            <span className="hidden md:inline">Digit One Zero Ltd · Lagos, Nigeria</span>
          </div>
        </div>
      </footer>

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Jump to module or action…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Modules">
            {NAV.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  setModule(item.id);
                  setCommandOpen(false);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
