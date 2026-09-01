import { MigratePanel } from "./migrate-panel";
import { PermissionMatrix } from "./permission-matrix";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { ROLE_LABELS, resolvePermissions } from "@/lib/auth/permissions";
import { listAuditLog } from "@/lib/data/audit";
import { listRolePermissions } from "@/lib/data/users";
import { scopeFor } from "@/lib/data/scope";
import { USER_ROLES, type UserRole } from "@db/schema";
import { formatRelative, titleCase } from "@/lib/format";

export const metadata = { title: "Settings" };

const MANAGED_ROLES: UserRole[] = USER_ROLES.filter((role) => role !== "super_admin");

export default async function SettingsPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const canViewAudit = user.permissions.has("audit.view");
  const canManagePermissions = user.permissions.has("permissions.manage");
  // Schema changes are irreversible in a way permissions are not.
  const isSuperAdmin = user.role === "super_admin";

  const [overrides, auditEntries] = await Promise.all([
    listRolePermissions(scope),
    canViewAudit ? listAuditLog(120) : Promise.resolve([]),
  ]);

  // Effective matrix = code defaults with any stored per-role overrides applied.
  const effective: Record<string, Record<string, boolean>> = {};
  for (const role of USER_ROLES) {
    const roleOverrides = overrides
      .filter((row) => row.role === role)
      .map((row) => ({ permission: row.permission, enabled: row.enabled }));
    const resolved = resolvePermissions(role, roleOverrides);
    effective[role] = Object.fromEntries([...resolved].map((permission) => [permission, true]));
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Fine-grained permissions, notification behaviour and the system audit trail."
      />

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isSuperAdmin ? <TabsTrigger value="database">Database</TabsTrigger> : null}
          {canViewAudit ? <TabsTrigger value="audit">Audit log</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="permissions" className="space-y-4">
          {!canManagePermissions ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              You can see the matrix but not change it — that needs the permissions.manage
              permission.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Super Admin always holds every internal permission and cannot be locked out.
          </p>
          <PermissionMatrix
            roles={MANAGED_ROLES}
            effective={effective}
            readOnly={!canManagePermissions}
          />
        </TabsContent>

        {isSuperAdmin ? (
          <TabsContent value="database">
            <MigratePanel />
          </TabsContent>
        ) : null}

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Job reminders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Reminders are queued into the notification outbox and delivered by the
                <span className="font-data"> /api/cron/reminders</span> route, which runs once a day
                at 08:00 EAT and covers every job in the following 24 hours. Re-running it is safe —
                a reminder already in the outbox is never queued twice.
              </p>
              <p>
                SMS goes out through Africa&apos;s Talking. Set{" "}
                <span className="font-data">NOTIFICATIONS_ENABLED=true</span> plus the API
                credentials to switch delivery on; without it the queue runs in dry-run mode.
              </p>
              <p>
                Individual users can opt out of SMS or email on their own profile page.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewAudit ? (
          <TabsContent value="audit">
            {auditEntries.length === 0 ? (
              <EmptyState
                title="Nothing logged yet"
                description="Every create, update and status change lands here with the user who made it."
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatRelative(entry.createdAt)}
                        </TableCell>
                        <TableCell>
                          {entry.userName ?? "System"}
                          {entry.userRole ? (
                            <span className="block text-xs text-muted-foreground">
                              {ROLE_LABELS[entry.userRole]}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted" className="font-data">
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {titleCase(entry.entityType)}
                          {entry.entityId ? (
                            <span className="ml-2 font-data">{entry.entityId}</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}
