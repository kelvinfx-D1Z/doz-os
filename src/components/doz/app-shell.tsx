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
  Smartphone,
  LogOut,
  Loader2,
  ShieldCheck,
  Repeat,
  Megaphone,
  Users,
  HelpCircle,
  Package,
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
import { FieldMode } from "@/components/modules/field-mode";
import { Routines } from "@/components/modules/routines";
import { MarketingGrowth } from "@/components/modules/marketing-growth";
import { StaffHub } from "@/components/modules/staff-hub";
import { HelpPage } from "@/components/modules/help-page";
import { UpdatesPage } from "@/components/modules/updates-page";
import { DidiBubble } from "@/components/doz/didi-bubble";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { signOut } from "next-auth/react";
import { SignIn } from "@/components/doz/sign-in";
import { initials, avatarColor } from "@/lib/format";
import { toast } from "sonner";

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
  { id: "routines", label: "Routines", icon: <Repeat className="h-4 w-4" />, group: "Operate" },
  { id: "ai", label: "AI Chief of Staff", icon: <Sparkles className="h-4 w-4" />, group: "Operate", hint: "AI" },
  { id: "field", label: "Field Mode", icon: <Smartphone className="h-4 w-4" />, group: "Operate", hint: "Mobile" },
  { id: "crm", label: "CRM & Sales", icon: <Users2 className="h-4 w-4" />, group: "Grow" },
  { id: "marketing", label: "Marketing & Growth", icon: <Megaphone className="h-4 w-4" />, group: "Grow" },
  { id: "projects", label: "Projects & Events", icon: <Clapperboard className="h-4 w-4" />, group: "Deliver" },
  { id: "procurement", label: "Procurement", icon: <Truck className="h-4 w-4" />, group: "Deliver" },
  { id: "finance", label: "Financial Intelligence", icon: <Wallet className="h-4 w-4" />, group: "Control" },
  { id: "team", label: "Team Management", icon: <UserCog className="h-4 w-4" />, group: "Control" },
  { id: "staff-hub", label: "Staff Hub", icon: <Users className="h-4 w-4" />, group: "Control" },
  { id: "sop", label: "SOP & Knowledge", icon: <BookOpen className="h-4 w-4" />, group: "Scale" },
  { id: "help", label: "Help & Guide", icon: <HelpCircle className="h-4 w-4" />, group: "Scale" },
  { id: "updates", label: "Updates & Backups", icon: <Package className="h-4 w-4" />, group: "Scale" },
];

// Role-based module access (Phase 2)
const ROLE_MODULES: Record<string, ModuleId[]> = {
  FOUNDER: ["command", "planning", "routines", "ai", "field", "crm", "marketing", "projects", "procurement", "finance", "team", "staff-hub", "sop", "help", "updates"],
  STAFF: ["command", "planning", "routines", "field", "crm", "marketing", "projects", "procurement", "finance", "team", "staff-hub", "sop", "help"],
  INTERN: ["command", "field", "team", "staff-hub", "sop", "help"],
  FREELANCER: ["command", "field", "projects", "help"],
};

const MODULES: Record<ModuleId, React.ReactNode> = {
  command: <CommandCenter />,
  planning: <StrategicPlanning />,
  crm: <CrmSales />,
  projects: <ProjectsEvents />,
  procurement: <Procurement />,
  finance: <Financial />,
  team: <Team />,
  "staff-hub": <StaffHub />,
  sop: <SopKnowledge />,
  help: <HelpPage />,
  updates: <UpdatesPage />,
  ai: <AiChiefOfStaff />,
  field: <FieldMode />,
  routines: <Routines />,
  marketing: <MarketingGrowth />,
};

const MODULE_META: Record<ModuleId, { title: string; subtitle: string }> = {
  command: { title: "CEO Command Center", subtitle: "Your single view to run the company" },
  planning: { title: "Strategic Planning", subtitle: "Annual → Quarterly → Monthly → Weekly → Daily" },
  crm: { title: "CRM & Sales Engine", subtitle: "Leads, opportunities, proposals, pipeline" },
  projects: { title: "Projects & Event Operations", subtitle: "Deliver every event on time, on budget" },
  procurement: { title: "Procurement & Vendor Management", subtitle: "Requester ≠ Approver ≠ Payer" },
  finance: { title: "Financial Intelligence", subtitle: "Profit by project, client & service" },
  team: { title: "Team Management", subtitle: "Interns, freelancers, accountability" },
  "staff-hub": { title: "Staff Hub", subtitle: "Roles, responsibilities, and task tracking" },
  sop: { title: "SOP & Knowledge Base", subtitle: "Process is the product" },
  help: { title: "Help & Guide", subtitle: "Personalized for your role" },
  updates: { title: "Updates & Backups", subtitle: "Manage updates and protect your data" },
  ai: { title: "AI Chief of Staff", subtitle: "Your digital Operations Director" },
  field: { title: "Field Mode", subtitle: "On-site report filing & offline event run-sheet" },
  routines: { title: "Routines", subtitle: "Your business rhythm — run the same playbook every time" },
  marketing: { title: "Marketing & Growth", subtitle: "Turn referrals into a predictable lead engine" },
};

const ROLE_LABELS: Record<string, string> = {
  FOUNDER: "Founder & CEO",
  STAFF: "Staff",
  INTERN: "Intern",
  FREELANCER: "Freelancer",
};

const ROLE_BADGE_COLOR: Record<string, string> = {
  FOUNDER: "bg-emerald-500/15 text-emerald-300",
  STAFF: "bg-teal-500/15 text-teal-300",
  INTERN: "bg-violet-500/15 text-violet-300",
  FREELANCER: "bg-fuchsia-500/15 text-fuchsia-300",
};

export function AppShell() {
  const { activeModule, setModule, commandOpen, setCommandOpen } = useAppStore();
  const { user, status } = useCurrentUser();

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

  // Loading state while session resolves
  if (status === "loading") {
    return (
      <div className="bg-grid flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-mono text-lg font-bold text-primary-foreground">
            10
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading DOZ OS…
          </div>
        </div>
      </div>
    );
  }

  // Not signed in → show sign-in overlay
  if (!user) {
    return <SignIn />;
  }

  const role = user.role;
  const allowed = ROLE_MODULES[role] ?? ROLE_MODULES.FOUNDER;
  const visibleNav = NAV.filter((n) => allowed.includes(n.id));

  // If the active module isn't allowed for this role, fall back to command
  const effectiveModule = allowed.includes(activeModule) ? activeModule : "command";

  const grouped = visibleNav.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  const meta = MODULE_META[effectiveModule];
  // Non-founders see "Command Center" instead of "CEO Command Center"
  const displayTitle = effectiveModule === "command" && role !== "FOUNDER"
    ? "Command Center"
    : meta.title;
  const displaySubtitle = effectiveModule === "command" && role !== "FOUNDER"
    ? "Your tasks and priorities at a glance"
    : meta.subtitle;

  async function handleSignOut() {
    await signOut({ redirect: false });
    toast.success("Signed out");
    window.location.assign("/");
  }

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
                    const active = effectiveModule === item.id;
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
                        {item.hint === "Mobile" && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                            App
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

          {/* User menu */}
          <div className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/50">
                  <Avatar className="h-8 w-8 border border-sidebar-border">
                    <AvatarFallback className={cn("text-xs font-semibold", avatarColor(user.name))}>
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-semibold text-sidebar-foreground">{user.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
                  </div>
                  <CircleDot className="h-3 w-3 text-primary pulse-dot" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", ROLE_BADGE_COLOR[role] ?? "bg-muted")}>
                    {role}
                  </span>
                  {user.title && <p className="mt-1 text-xs text-muted-foreground">{user.title}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <h1 className="truncate text-sm font-semibold sm:text-base">{displayTitle}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{displaySubtitle}</p>
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
            {visibleNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  effectiveModule === item.id
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
            <div key={effectiveModule} className="mx-auto max-w-[1400px] animate-in fade-in-50 duration-300">
              {MODULES[effectiveModule]}
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
            <span className="hidden sm:inline">Founder Operating System v2.0</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1 border-primary/30 text-[10px] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
            </Badge>
            <span className="hidden md:inline">Digit One Zero Ltd · Abuja, Nigeria</span>
          </div>
        </div>
      </footer>

      {/* DIDI floating support bubble — on every page */}
      <DidiBubble />

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Jump to module or action…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Modules">
            {visibleNav.map((item) => (
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
