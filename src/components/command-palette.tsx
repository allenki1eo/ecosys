"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Search, Truck } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { INTERNAL_NAV } from "@/lib/navigation";

export type PaletteEntity = {
  id: string;
  label: string;
  sublabel?: string | null;
  href: string;
  kind: "client" | "site" | "job";
};

const KIND_ICONS = { client: Building2, site: MapPin, job: Truck } as const;

/**
 * ⌘K navigation. Sections are pre-filtered on the server by permission, so
 * whatever reaches the palette is something this user may actually open.
 */
export function CommandPalette({
  sections,
  entities,
}: {
  sections: { label: string; items: { href: string; label: string }[] }[];
  entities: PaletteEntity[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="justify-start gap-2 px-2 text-muted-foreground sm:w-56"
      >
        <Search className="size-4" />
        {/* The label would crowd the header on a phone; the icon carries it. */}
        <span className="hidden text-xs sm:inline">Search or jump to…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search clients, sites, jobs or pages…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>

          {entities.length > 0 ? (
            <CommandGroup heading="Records">
              {entities.map((entity) => {
                const Icon = KIND_ICONS[entity.kind];
                return (
                  <CommandItem
                    key={`${entity.kind}-${entity.id}`}
                    value={`${entity.label} ${entity.sublabel ?? ""}`}
                    onSelect={() => go(entity.href)}
                  >
                    <Icon />
                    <span>{entity.label}</span>
                    {entity.sublabel ? (
                      <span className="ml-auto text-xs text-muted-foreground">{entity.sublabel}</span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {(sections.length ? sections : INTERNAL_NAV).map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items.map((item) => (
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
