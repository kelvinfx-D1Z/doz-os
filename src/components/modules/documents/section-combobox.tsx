"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { CommandGroup, CommandItem, CommandEmpty } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ComboboxField, type ServiceCatalogueCategory } from "@/components/modules/documents/description-combobox";

// A per-line Section field that suggests D1Z's six service-catalogue
// departments without ever forcing a pick — same free-text-first contract
// as DescriptionCombobox, and built on the same ComboboxField primitive so
// the popover/keyboard mechanics (and the Radix quirks they work around)
// exist in exactly one place. This is a sibling rather than a variant of
// DescriptionCombobox because the two lists are shaped differently — a flat
// department list here vs. a grouped, section-scoped items list there — and
// their pick behaviour differs too (Section never back-fills anything;
// Description back-fills Section only when it's empty, handled by the
// caller in document-builder.tsx).
export function SectionCombobox({
  value,
  onChange,
  categories,
  placeholder,
  className,
}: {
  value: string;
  onChange: (section: string) => void;
  categories: ServiceCatalogueCategory[] | null;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!categories) return [];
    const q = value.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, value]);

  // No catalogue yet (still loading) or the fetch failed/returned nothing —
  // degrade to a plain input rather than block the founder from typing.
  if (!categories || categories.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Section"}
        className={cn("h-8", className)}
      />
    );
  }

  return (
    <ComboboxField
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder ?? "Section — type or pick a department"}
      className={className}
    >
      <CommandGroup>
        {filtered.map((cat) => (
          <CommandItem
            key={cat.id}
            value={cat.id}
            onSelect={() => {
              onChange(cat.name);
              setOpen(false);
            }}
          >
            {cat.icon ? `${cat.icon} ${cat.name}` : cat.name}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandEmpty>Nothing matches — keep typing, it&apos;s used as typed.</CommandEmpty>
    </ComboboxField>
  );
}
