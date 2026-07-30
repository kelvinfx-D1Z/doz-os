"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CheckCircle2, ClipboardList, ArrowRight } from "lucide-react";

// Filing a daily report already worked — the form lives in Field Mode and
// /api/doz/field handles it. Nobody found it, because "Field Mode" reads as
// on-site event work and the Command Center never mentioned reports at all.
//
// This is the missing signpost: it sits at the top of every non-founder's home
// screen, states plainly whether today's report is in, and jumps straight there.
export function DailyReportPrompt({
  reportFiled,
  firstName,
}: {
  reportFiled: boolean;
  firstName?: string;
}) {
  const setModule = useAppStore((s) => s.setModule);

  if (reportFiled) {
    return (
      <Card className="flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5 p-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-sm text-emerald-300">
          Today&apos;s report is filed. Thank you.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() => setModule("field")}
        >
          Edit it
        </Button>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-wrap items-center gap-3 border-amber-500/30 bg-amber-500/5 p-3")}>
      <ClipboardList className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-200">
          {firstName ? `${firstName}, you` : "You"} haven&apos;t filed today&apos;s report yet
        </p>
        <p className="text-[11px] text-amber-200/70">
          Takes about 30 seconds — what you did, what&apos;s next, anything blocking you.
        </p>
      </div>
      <Button size="sm" className="gap-1.5" onClick={() => setModule("field")}>
        File report
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Card>
  );
}
