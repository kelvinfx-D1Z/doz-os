"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore, type ModuleId } from "@/lib/store";
import { cn } from "@/lib/utils";
// Types only — the text comes from the founder-only API. See
// src/lib/founder-playbook.ts, SERVER-ONLY.
import type { DayPlan } from "@/lib/founder-playbook";
import { Compass, ArrowRight, HelpCircle, Moon } from "lucide-react";

// Today's line from the founder's playbook, on the dashboard he already
// opens every morning.
//
// Deliberately read-only and short: the blocks are ticked off on the
// Playbook page itself. This is the reminder that the day has a shape —
// a full checklist here would just be the Playbook page twice, and the
// Command Center is already busy.

export function PlaybookTodayCard() {
  const setModule = useAppStore((s) => s.setModule);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [sundayGuard, setSundayGuard] = useState("");
  const [tones, setTones] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doz/playbook", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.content) return;
        const weekday = new Date().getDay();
        setPlan((j.content.week as DayPlan[]).find((d) => d.weekday === weekday) ?? null);
        setSundayGuard(j.content.sundayGuard ?? "");
        setTones(j.content.tones ?? {});
      })
      // A missing reminder is not worth an error on the dashboard; the
      // Playbook page itself reports failures.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!plan) return null;
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
            <Badge key={b.id} variant="outline" className={cn("gap-1.5 font-medium", tones[b.priority])}>
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

      {isSunday && sundayGuard && <p className="mt-3 text-xs text-muted-foreground">{sundayGuard}</p>}
    </Card>
  );
}
