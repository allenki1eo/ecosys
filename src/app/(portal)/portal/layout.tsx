import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalNav } from "./portal-nav";
import { ThemeToggle } from "@/components/theme-provider";
import { UserMenu } from "@/components/user-menu";
import { requireClientUser } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getClient, listSites } from "@/lib/data/clients";
import { scopeFor } from "@/lib/data/scope";

/**
 * The client-facing shell. Everything under it is scoped to the signed-in
 * user's own company — `requireClientUser` bounces Ecohygiene staff back to
 * the internal dashboard, and every query below carries the tenant scope.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [client, sites] = await Promise.all([
    getClient(scope, user.clientId),
    listSites(scope),
  ]);
  if (!client) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/portal" className="flex items-center gap-2.5">
            {/* Per-client branding, falling back to the Ecohygiene green. */}
            <span
              className="flex size-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: client.brandColor ?? "hsl(var(--brand-green))" }}
              aria-hidden
            >
              {client.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{client.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                Service portal · Ecohygiene
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4">
          <PortalNav siteCount={sites.length} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">{children}</main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Serviced by Ecohygiene Company Limited · Shinyanga, Tanzania
      </footer>
    </div>
  );
}
