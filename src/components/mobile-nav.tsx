"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { INTERNAL_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Below `lg` the sidebar is hidden, so navigation lives in a drawer behind this
 * button. Same nav definition and the same server-filtered `allowed` hrefs as
 * the desktop sidebar — a user never sees a destination here that the sidebar
 * would have withheld.
 */
export function MobileNav({ allowed }: { allowed: string[] }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // A tap that navigates should also dismiss the drawer. Closing on pathname
  // change covers every route into the app, including the ⌘K palette.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const visible = new Set(allowed);
  const sections = INTERNAL_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => visible.has(item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-[17rem] p-0 sm:max-w-[17rem]">
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <Logo className="size-7 text-xs" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Ecohygiene</p>
            <p className="text-[11px] text-muted-foreground">Operations</p>
          </div>
        </div>

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
                          // Taller rows than the desktop sidebar: this is a
                          // touch target, not a pointer target.
                          "flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors",
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
      </SheetContent>
    </Sheet>
  );
}
