"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ServiceCatalogueCategory = {
  id: string;
  name: string;
  icon?: string | null;
  items: { id: string; name: string }[];
};

// A per-line description field that suggests D1Z's service catalogue without
// ever forcing a pick. The visible input IS the description — typing updates
// the real line value directly, so a founder who types something not in the
// catalogue never has to "confirm" anything: it's already there. Picking a
// catalogue item additionally fills the section with its department. The
// list is filtered ourselves (same substring match ServicePicker uses) with
// shouldFilter={false} on Command, since the field driving the search is a
// plain styled Input outside Command's own CommandInput, not cmdk's search box.
export function DescriptionCombobox({
  value,
  onChange,
  onPick,
  categories,
  placeholder,
  className,
}: {
  value: string;
  onChange: (description: string) => void;
  onPick: (description: string, section: string) => void;
  categories: ServiceCatalogueCategory[] | null;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!categories) return [];
    const q = value.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, value]);

  // No catalogue yet (still loading) or the fetch failed/returned nothing —
  // degrade to a plain input rather than block the founder from typing.
  if (!categories || categories.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Description"}
        className={cn("h-8", className)}
      />
    );
  }

  const trimmed = value.trim();
  const exactMatch = categories.some((c) =>
    c.items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} className="overflow-visible bg-transparent">
        <PopoverAnchor asChild>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? "Description — type or pick from catalogue"}
            className={cn("h-8", className)}
            autoComplete="off"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[min(360px,var(--radix-popover-trigger-width))] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CommandList className="max-h-[280px]">
            {trimmed.length > 0 && !exactMatch && (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`__custom__${trimmed}`}
                  onSelect={() => setOpen(false)}
                  className="italic"
                >
                  Use &ldquo;{trimmed}&rdquo; as typed
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.map((cat) => (
              <CommandGroup key={cat.id} heading={cat.icon ? `${cat.icon} ${cat.name}` : cat.name}>
                {cat.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onPick(item.name, cat.name);
                      setOpen(false);
                    }}
                  >
                    {item.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandEmpty>Nothing matches — keep typing, it&apos;s used as typed.</CommandEmpty>
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
