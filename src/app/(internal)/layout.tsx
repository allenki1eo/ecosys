import Link from "next/link";
import { asc, eq, or } from "drizzle-orm";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, type PaletteEntity } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-provider";
import { UserMenu } from "@/components/user-menu";
import { requireStaff } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { clients, jobs, sites } from "@db/schema";
import { INTERNAL_NAV, visibleNav } from "@/lib/navigation";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const sections = visibleNav(INTERNAL_NAV, user.permissions);
  // Permission filtering stays on the server; the nav components receive only
  // the hrefs this user may open.
  const allowedHrefs = sections.flatMap((section) => section.items.map((item) => item.href));

  const entities = await paletteEntities();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r lg:block">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <Logo className="size-7 text-xs" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Ecohygiene</p>
            <p className="text-[11px] text-muted-foreground">Operations</p>
          </div>
        </div>
        <AppSidebar allowed={allowedHrefs} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <MobileNav allowed={allowedHrefs} />
          <Link href="/dashboard" className="lg:hidden">
            <Logo className="size-7 text-xs" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette
              sections={sections.map((s) => ({
                label: s.label,
                items: s.items.map((i) => ({ href: i.href, label: i.label })),
              }))}
              entities={entities}
            />
            <ThemeToggle />
            <UserMenu
              name={user.name}
              email={user.email}
              roleLabel={ROLE_LABELS[user.role]}
              settingsHref="/admin/settings"
            />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Records the ⌘K palette can jump to. Kept small — it ships with the page. */
async function paletteEntities(): Promise<PaletteEntity[]> {
  const [clientRows, siteRows, jobRows] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name, industry: clients.industry })
      .from(clients)
      .orderBy(asc(clients.name))
      .limit(30),
    db
      .select({ id: sites.id, name: sites.name, clientName: clients.name })
      .from(sites)
      .innerJoin(clients, eq(sites.clientId, clients.id))
      .orderBy(asc(sites.name))
      .limit(50),
    db
      .select({ id: jobs.id, reference: jobs.reference, siteName: sites.name })
      .from(jobs)
      .innerJoin(sites, eq(jobs.siteId, sites.id))
      .where(or(eq(jobs.status, "scheduled"), eq(jobs.status, "in_progress")))
      .limit(40),
  ]);

  return [
    ...clientRows.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: c.industry,
      href: `/clients/${c.id}`,
      kind: "client" as const,
    })),
    ...siteRows.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: s.clientName,
      href: `/clients/sites/${s.id}`,
      kind: "site" as const,
    })),
    ...jobRows.map((j) => ({
      id: j.id,
      label: j.reference,
      sublabel: j.siteName,
      href: `/jobs/${j.id}`,
      kind: "job" as const,
    })),
  ];
}
