"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/doz/ui-primitives";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatNGN } from "@/lib/format";
import { Wallet, FileText } from "lucide-react";
import { ServicesSection } from "@/components/modules/projects-events";
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

type BudgetState = "DRAFT" | "SUBMITTED" | "APPROVED" | "PRICED";

interface BudgetRow {
  project: ProjectLite;
  lineCount: number;
  baseTotal: number;
  state: BudgetState;
}

/**
 * Derives one of the four budget states from the project's cost-line
 * statuses and its pricingStage — never from a field of its own, because a
 * budget has none.
 *
 *   Draft     — lines still LISTED (the default, nothing submitted yet)
 *   Submitted — any line BUDGET_SUBMITTED
 *   Approved  — every line APPROVED or further along, project still BASE
 *   Priced    — project.pricingStage === "OFFICIAL" (checked first: once the
 *               founder has converted it, that outranks whatever the lines
 *               individually say)
 */
function deriveBudgetState(lines: ServiceLineLite[], pricingStage: string): BudgetState {
  if (pricingStage === "OFFICIAL") return "PRICED";
  const approvedOrBeyond = new Set(["APPROVED", "ORDERED", "DELIVERED", "PAID"]);
  if (lines.length > 0 && lines.every((l) => approvedOrBeyond.has(l.status))) return "APPROVED";
  if (lines.some((l) => l.status === "BUDGET_SUBMITTED")) return "SUBMITTED";
  return "DRAFT";
}

export function Budgets({ onCreateQuotation }: { onCreateQuotation: (projectId: string) => void }) {
  const { user } = useCurrentUser();
  // Same set /api/doz/services' requireProjectAccess grants read access to.
  // An INTERN reaching this tab (only possible if explicitly granted the
  // `documents` module) must see an explanation, not a 403 toast from a
  // fetch loop underneath them.
  const canSeeCostSheet =
    user?.role === "FOUNDER" ||
    user?.role === "STAFF" ||
    user?.role === "PRODUCTION_MANAGER" ||
    user?.role === "FREELANCER";

  const [rows, setRows] = useState<BudgetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<ProjectLite | null>(null);

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
        setRows(built.filter((r): r is BudgetRow => r !== null));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (canSeeCostSheet) {
      load().catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load budgets");
      });
    }
    return () => {
      cancelled = true;
    };
  }, [canSeeCostSheet, load]);

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

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No budgets yet"
          hint="A budget appears here once a project's cost sheet has at least one line — add services from Projects & Events."
        />
      ) : (
        rows.map((row) => (
          <BudgetRowCard key={row.project.id} row={row} onOpen={() => setOpenProject(row.project)} />
        ))
      )}

      <Dialog open={openProject !== null} onOpenChange={(open) => { if (!open) setOpenProject(null); }}>
        {openProject && (
          <BudgetDialog
            project={openProject}
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
  project, onCreateQuotation,
}: { project: ProjectLite; onCreateQuotation: () => void }) {
  const { user } = useCurrentUser();
  const isFounder = user?.role === "FOUNDER";
  const isPM = user?.role === "FREELANCER" || user?.role === "PRODUCTION_MANAGER";

  return (
    <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
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
      {isFounder && <MarkupPanel projectId={project.id} />}

      <div className="mt-4 rounded-lg border border-border p-4">
        {project.pricingStage === "OFFICIAL" ? (
          <Button className="w-full gap-1.5" onClick={onCreateQuotation}>
            <FileText className="h-4 w-4" /> Create quotation
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Price this budget first — the client price comes from the markup.
          </p>
        )}
      </div>
    </DialogContent>
  );
}
