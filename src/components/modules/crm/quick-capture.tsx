"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// One-line capture. Type a name, press Enter, done. Everything else is
// optional and can be filled in later from the list.
export function QuickCapture({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = text.trim();
    if (!value) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_lead",
          contactName: value,
          direction,
          source: direction === "OUTBOUND" ? "COLD" : "REFERRAL",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setText("");
      toast.success(direction === "OUTBOUND" ? "Target added" : "Enquiry logged");
      onCreated();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3 sm:flex-row sm:items-center">
      <div className="flex shrink-0 gap-1">
        {(["INBOUND", "OUTBOUND"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              direction === d
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {d === "INBOUND" ? "They asked" : "I'm chasing"}
          </button>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        placeholder={
          direction === "INBOUND"
            ? "Log an enquiry — who got in touch?"
            : "Who do you want to reach?"
        }
        className="flex-1"
      />
      <Button onClick={save} disabled={saving || !text.trim()} size="sm" className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Log
      </Button>
    </div>
  );
}
