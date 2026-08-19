"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";

/**
 * Clients with more than one factory switch between them here; the choice is a
 * query param so it survives navigation and can be linked to.
 */
export function SiteSwitcher({ sites }: { sites: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("site") ?? "";

  if (sites.length <= 1) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <MapPin className="size-4 text-muted-foreground" />
      <select
        value={current}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set("site", event.target.value);
          else params.delete("site");
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">All sites</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  );
}
