"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/doz/ui-primitives";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatNGN } from "@/lib/format";
import { Wallet, FileText, Plus } from "lucide-react";
import { ServicesSection, deriveBudgetState, NewProjectDialog, type BudgetState } from "@/components/modules/projects-events";
import { MarkupPanel } from "@/components/modules/projects/markup-panel";

// Budgets — the first document in the chain (Budget -> Quotation -> Invoice
// -> Receipt), living where the founder actually went looking for it: the
// Documents module's sidebar link. A budget is NOT a new record type — it is
// a project's existing ProjectService rows, read through the same cost-sheet
// API and edited through the same ServicesSection editor Projects & Events
// already uses. Adding a second store or a second editor for the same money
// is exactly the `Referral`/`ReferralSource` duplication mistake this
// codebase is trying to leave behind.
//
// Access mirrors the cost sheet exactly (see requireProjectAccess in
// /api/doz/services): founder and staff see every project, a production
// manager or freelancer only the ones they manage, an intern is refused.
// This tab does not widen that — it can only ever list what
// GET /api/doz/projects already scoped for this viewer, and it never shows a
// row for a project whose services call comes back anything but 200.

interface ProjectLite {
  id: string;
  name: string;
  code: string | null;
  pricingStage: string;
  account: { name: string } | null;
  manager: { name: string } | null;
}

interface ServiceLineLite {
  status: string;
}

interface BudgetRow {
  project: ProjectLite;
  lineCount: number;
  baseTotal: number;
  state: BudgetState;
}

// deriveBudgetState lives in projects-events.tsx and is imported above — it
// is the SAME rule ServicesSection's own "Status" tile now reads off, so a
// row's badge here can never disagree with the dialog it opens onto. See
// that function's doc comment for the four states and why this used to be
// two copies that disagreed.

export function Budgets({ onCreateQuotation }: { onCreateQuotation: (projectId: string) => void }) {
  const { user, status } = useCurrentUser();
  // Same set /api/doz/services' requireProjectAccess grants read access to.
  // An INTERN reaching this tab (only possible if explicitly granted the
  // `documents` module) must see an explanation, not a 403 toast from a
  // fetch loop underneath them.
  const canSeeCostSheet =
    user?.role === "FOUNDER" ||
    user?.role === "STAFF" ||
    user?.role === "PRODUCTION_MANAGER" ||
    user?.role === "FREELANCER";

  // Who may START one. The founder's own rule — a budget is built "by founder
  // or production manager" — so a freelancer who can read their own project's
  // sheet still does not open new work.
  const canStartBudget =
    user?.role === "FOUNDER" || user?.role === "STAFF" || user?.role === "PRODUCTION_MANAGER";

  const [rows, setRows] = useState<BudgetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<ProjectLite | null>(null);
  // Starting a budget is where work begins now — the founder names the job and
  // picks the client, and the project is created behind it. He never meets a
  // blank project form asking for a cost and a contract value he cannot know
  // yet; both are earned later, from the cost sheet and from the quotation the
  // client accepts.
  const [newOpen, setNewOpen] = useState(false);

  // A plain function returning one promise chain (not `async`/`await`) so
  // every state update happens inside a `.then()`/`.catch()` continuation,
  // never synchronously in the body of the effect below that calls it.
  const load = useCallback(() => {
    // The one and only source of WHICH projects this viewer may see —
    // already scoped server-side. Never fetched and then filtered
    // client-side; a row this call didn't return is never built.
    return fetch("/api/doz/projects")
      .then((pr) => pr.json().catch(() => null).then((pj) => ({ pr, pj })))
      .then(({ pr, pj }) => {
        if (!pr.ok) throw new Error(pj?.error || `Failed to load projects (${pr.status})`);
        const projects: ProjectLite[] = (pj.projects ?? []).map((p: {
          id: string; name: string; code: string | null; pricingStage: string;
          account: { name: string } | null; manager: { name: string } | null;
        }) => ({
          id: p.id,
          name: p.name,
          code: p.code ?? null,
          pricingStage: p.pricingStage,
          account: p.account ? { name: p.account.name } : null,
          manager: p.manager ? { name: p.manager.name } : null,
        }));

        // A budget is a project's cost lines — fetch each visible project's
        // sheet and keep only the ones that actually carry at least one
        // line. A non-200 here (e.g. a role edge case the projects list
        // didn't anticipate) drops the row rather than surfacing it.
        return Promise.all(
          projects.map((p): Promise<BudgetRow | null> =>
            fetch(`/api/doz/services?projectId=${encodeURIComponent(p.id)}`)
              .then((sr) => (sr.ok ? sr.json().catch(() => null) : null))
              .then((sj) => {
                const lines: ServiceLineLite[] = sj?.projectServices ?? [];
                if (!sj || lines.length === 0) return null;
                return {
                  project: p,
                  lineCount: lines.length,
                  baseTotal: sj?.totals?.totalValue ?? 0,
                  state: deriveBudgetState(lines, p.pricingStage),
                };
              }),
          ),
        );
      })
      .then((built) => {
        const next = built.filter((r): r is BudgetRow => r !== null);
        setRows(next);
        return next;
      });
  }, []);

  // Re-fetches this project's own row after MarkupPanel converts or reopens
  // it, and — critically — re-syncs `openProject` (a frozen snapshot taken
  // when the dialog opened) so its `pricingStage` stops reading stale
  // "BASE" the moment Convert succeeds. A targeted refetch rather than
  // ProjectDialog's window.location.reload() idiom: this dialog's own data
  // (the row list) is already a plain fetch-and-setState the component
  // owns, so re-running it is no more fragile than the initial load and
  // avoids losing the founder's place (open dialog, scroll position) for a
  // change that only ever affects one project's own state.
  const refreshOpenProject = useCallback(
    (projectId: string) => {
      load()
        .then((next) => {
          const updated = next.find((r) => r.project.id === projectId)?.project;
          if (updated) setOpenProject(updated);
        })
        .catch(() => {});
    },
    [load],
  );

  useEffect(() => {
    let cancelled = false;
    if (canSeeCostSheet) {
      load()
        // A later successful load must win over a stale error from an
        // earlier failed one — canSeeCostSheet can flip (e.g. the founder
        // switching "view as"), re-running this effect. Cleared only on
        // success, and only in a .then() continuation, never synchronously
        // in this effect's own body.
        .then(() => {
          if (!cancelled) setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load budgets");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [canSeeCostSheet, load]);

  // The session resolving is its own state, distinct from "this role can't
  // see budgets" — while `status` is "loading", `user` is null, and
  // `canSeeCostSheet` would read as false for a FOUNDER too. Checked before
  // the role gate below so a founder never sees the denial message flash on
  // first paint (masked before Budgets was the default tab, since inactive
  // TabsContent panes weren't mounted yet by the time the session resolved).
  if (status === "loading") {
    return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
  }

  if (!canSeeCostSheet) {
    return (
      <EmptyState
        icon={<Wallet className="h-8 w-8" />}
        title="Budgets aren't part of your role"
        hint="Budgets show a project's cost sheet — visible to the founder, staff, and the production manager or freelancer running the job."
      />
    );
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (rows === null) {
    return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
  }

  // A freshly started budget lands straight on its cost sheet, which is the
  // whole point: the founder came here to build one, not to admire a row.
  return (
    <div className="space-y-3">
      {canStartBudget && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Budget
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No budgets yet"
          hint="Start one with New Budget — name the job, pick the client, then build its cost lines. The project is created for you."
        />
      ) : (
        rows.map((row) => (
          <BudgetRowCard key={row.project.id} row={row} onOpen={() => setOpenProject(row.project)} />
        ))
      )}

      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        mode="budget"
        onCreated={(project) => {
          // Straight onto the cost sheet — the founder came here to build one,
          // not to admire a row. No need to wait for the reload to hand the
          // project back: a budget that has just been created is always BASE,
          // and the reload behind it fills in the rest.
          if (project) {
            setOpenProject({
              id: project.id,
              name: project.name,
              code: null,
              pricingStage: "BASE",
              account: null,
              manager: null,
            });
          }
          void load();
        }}
      />

      <Dialog open={openProject !== null} onOpenChange={(open) => { if (!open) setOpenProject(null); }}>
        {openProject && (
          <BudgetDialog
            project={openProject}
            onProjectChanged={() => refreshOpenProject(openProject.id)}
            onCreateQuotation={() => {
              const id = openProject.id;
              setOpenProject(null);
              onCreateQuotation(id);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BudgetRowCard({ row, onOpen }: { row: BudgetRow; onOpen: () => void }) {
  const { project, lineCount, baseTotal, state } = row;
  return (
    <Card
      className="cursor-pointer p-4 transition-colors hover:border-primary/40"
      onClick={onOpen}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {project.code && (
              <span className="font-mono text-xs font-semibold text-primary">{project.code}</span>
            )}
            <StatusBadge status={state} />
          </div>
          <p className="mt-1.5 text-sm font-semibold">{project.name}</p>
          <p className="text-xs text-muted-foreground">
            {project.account?.name ?? "No client"} · {lineCount} line item{lineCount === 1 ? "" : "s"}
            {project.manager && ` · PM: ${project.manager.name}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight">{formatNGN(baseTotal)}</p>
          <p className="text-[10px] text-muted-foreground">base cost</p>
        </div>
      </div>
    </Card>
  );
}

function BudgetDialog({
  project, onProjectChanged, onCreateQuotation,
}: { project: ProjectLite; onProjectChanged: () => void; onCreateQuotation: () => void }) {
  const { user } = useCurrentUser();
  const isFounder = user?.role === "FOUNDER";
  const isPM = user?.role === "FREELANCER" || user?.role === "PRODUCTION_MANAGER";

  // Wide, because this is not a form — it is a whole cost sheet, with a vendor,
  // quantity, days and rate on every line, plus the markup panel underneath. At
  // max-w-2xl the columns wrapped and the founder could not scan a budget for
  // the wrong number, which is the one thing this screen exists to let him do.
  return (
    <DialogContent
      className="max-h-[94vh] w-[97vw] overflow-y-auto"
      // maxWidth is set inline on purpose. DialogContent carries `sm:max-w-lg`
      // of its own, and a responsive variant beats any base-level max-w-*
      // utility passed in via className — so widening it with a class silently
      // did nothing above 640px, which is every screen this is used on. An
      // inline style is the one thing that reliably wins.
      style={{ maxWidth: "min(1600px, 97vw)" }}
    >
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {project.code && (
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {project.code}
            </span>
          )}
        </div>
        <DialogTitle className="text-base">{project.name}</DialogTitle>
        <DialogDescription>
          {project.account?.name ?? "No client"}
          {project.manager ? ` · PM: ${project.manager.name}` : ""}
        </DialogDescription>
      </DialogHeader>

      {/* The cost sheet itself — Submit for approval / Approve are already
          built into this section and gated server-side; reused verbatim. */}
      <ServicesSection projectId={project.id} isPM={isPM} pricingStage={project.pricingStage} />

      {/* Price it — founder-only, exactly like Projects & Events. Never even
          attempts to render for anyone else (MarkupPanel enforces this
          itself), so a PM never sees client price alongside their cost. */}
      {isFounder && <MarkupPanel projectId={project.id} onChanged={onProjectChanged} variant="budget" />}

      <div className="mt-4 rounded-lg border border-border p-4">
        {project.pricingStage !== "OFFICIAL" ? (
          <p className="text-xs text-muted-foreground">
            Price this budget first — the client price comes from the markup.
          </p>
        ) : isFounder ? (
          <Button className="w-full gap-1.5" onClick={onCreateQuotation}>
            <FileText className="h-4 w-4" /> Create quotation
          </Button>
        ) : (
          // The document builder's auto-load depends on GET
          // /api/doz/projects/pricing, which is founder-only and 403s for
          // anyone else — showing the button here would land a STAFF/PM
          // viewer (reachable only via an explicit `documents` grant) in a
          // builder with no lines and no explanation. Refuse before that
          // dead end rather than after it.
          <p className="text-xs text-muted-foreground">
            This budget has been priced — ask the founder to create the quotation.
          </p>
        )}
      </div>
    </DialogContent>
  );
}
