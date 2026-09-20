"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore, type ModuleId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { planForDate, SUNDAY_GUARD } from "@/lib/founder-playbook";
import { Compass, ArrowRight, HelpCircle, Moon } from "lucide-react";

// Today's line from the founder's playbook, on the dashboard he already
// opens every morning.
//
// Deliberately read-only and short: the blocks are ticked off on the
// Playbook page itself. This is the reminder that the day has a shape —
// a full checklist here would just be the Playbook page twice, and the
// Command Center is already busy.

const TONE: Record<string, string> = {
  D1Z: "bg-primary/15 text-primary border-primary/30",
  RESEARCHBRAINIE: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  FIESTIVO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  MASTERS: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  FLEX: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  RESET: "bg-muted text-muted-foreground border-border",
};

export function PlaybookTodayCard() {
  const setModule = useAppStore((s) => s.setModule);
  const plan = useMemo(() => planForDate(new Date()), []);
  const isSunday = plan.weekday === 0;

  return (
    <Card className={cn("p-5", isSunday && "border-border bg-muted/30")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {isSunday ? (
            <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {plan.name} · your playbook
            </p>
            <p className="mt-0.5 text-sm font-bold">{plan.theme}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
          onClick={() => setModule("playbook" as ModuleId)}
        >
          Open playbook <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      {plan.blocks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.blocks.map((b) => (
            <Badge key={b.id} variant="outline" className={cn("gap-1.5 font-medium", TONE[b.priority])}>
              {b.title}
              {b.duration && <span className="opacity-70">· {b.duration}</span>}
            </Badge>
          ))}
        </div>
      )}

      {plan.question && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/40 p-3">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs font-medium italic">{plan.question}</p>
        </div>
      )}

      {isSunday && <p className="mt-3 text-xs text-muted-foreground">{SUNDAY_GUARD}</p>}
    </Card>
  );
}
