"use client";

import { useMemo, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  /** Did this event originate from our own input? */
  const isOwnInput = (target: EventTarget | null) =>
    target instanceof Node && inputRef.current?.contains(target) === true;

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
            ref={inputRef}
            value={value}
            // Opens on click, typing or arrow-down — deliberately NOT on focus.
            // Two reasons, both found by reproducing this inside a real dialog:
            //  1. The dialog auto-focuses its first field, so this input can
            //     already hold focus while the list is closed. onFocus only
            //     fires on a transition, so it could never reopen.
            //  2. Radix restores focus to the anchor when the list closes. With
            //     an onFocus opener that immediately reopened it, making the
            //     list impossible to dismiss with Escape or a pick.
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setOpen(true);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={placeholder ?? "Description — type or pick from catalogue"}
            className={cn("h-8", className)}
            autoComplete="off"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[min(360px,var(--radix-popover-trigger-width))] p-0"
          // The anchor IS the input, and Radix treats the anchor as "outside"
          // the content. Left alone, focusing the input opens the list and
          // that very same focus is then judged an outside interaction, so it
          // dismisses on the same tick — the list appears to flash and vanish.
          // Keep focus in the input, and never let the input's own focus or
          // clicks dismiss the list it just opened.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => {
            if (isOwnInput(e.target)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isOwnInput(e.target)) e.preventDefault();
          }}
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
