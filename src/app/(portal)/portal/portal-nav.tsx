"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PORTAL_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function PortalNav({ siteCount }: { siteCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {PORTAL_NAV.map((item) => {
        const active =
          item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-brand-green font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
            {item.href === "/portal/services" && siteCount > 1 ? (
              <span className="font-data text-[11px] text-muted-foreground">{siteCount} sites</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
