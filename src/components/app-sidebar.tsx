"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { INTERNAL_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Permission filtering happens on the server, which passes down the hrefs this
 * user may see. The nav definition (icons included) is imported here rather
 * than passed as props — React components cannot cross the RSC boundary.
 */
export function AppSidebar({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const visible = new Set(allowed);

  const sections = INTERNAL_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => visible.has(item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-brand-green")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
