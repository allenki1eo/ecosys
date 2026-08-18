import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PreferencesForm } from "./preferences-form";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const home = user.isClientUser ? "/portal" : "/dashboard";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Logo className="size-7 text-xs" />
        <Button asChild variant="ghost" size="sm">
          <Link href={home}>
            <ArrowLeft /> Back
          </Link>
        </Button>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <PageHeader title={user.name} description={user.email} />

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Role" value={ROLE_LABELS[user.role]} />
            <Row label="Phone" value={user.phone ?? "Not set"} />
            <Row label="Member since" value={formatDate(user.createdAt)} />
            <Row
              label="Access"
              value={user.isClientUser ? "Client portal" : "Ecohygiene internal"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <PreferencesForm notifyBySms={user.notifyBySms} notifyByEmail={user.notifyByEmail} />
          </CardContent>
        </Card>

        {!user.isClientUser ? (
          <Card>
            <CardHeader>
              <CardTitle>Your permissions</CardTitle>
              <p className="text-xs text-muted-foreground">
                Effective set: role defaults, plus any adjustments a Super Admin has made.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {[...user.permissions].sort().map((permission) => (
                <Badge key={permission} variant="muted" className="font-data">
                  {permission}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
