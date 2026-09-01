import { Users } from "lucide-react";

import { EditUserSheet, InviteUserSheet, UserRowControls } from "./user-controls";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { listClients } from "@/lib/data/clients";
import { listUsers } from "@/lib/data/users";
import { scopeFor } from "@/lib/data/scope";
import { formatDate, formatRelative } from "@/lib/format";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  if (!user.permissions.has("users.manage")) {
    return (
      <EmptyState
        icon={Users}
        title="User administration is restricted"
        description="Ask a Super Admin for the users.manage permission."
      />
    );
  }

  const [users, clients] = await Promise.all([listUsers(scope), listClients(scope)]);
  const staff = users.filter((row) => !row.clientId);
  const portal = users.filter((row) => row.clientId);

  return (
    <>
      <PageHeader
        title="Users"
        description="Ecohygiene staff and external client-portal accounts."
        actions={<InviteUserSheet clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
      />

      <UserTable
        title="Ecohygiene staff"
        rows={staff}
        currentUserId={user.id}
        emptyMessage="No staff accounts yet."
      />
      <UserTable
        title="Client portal users"
        rows={portal}
        currentUserId={user.id}
        emptyMessage="No client users invited yet."
        showClient
      />
    </>
  );
}

type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

function UserTable({
  title,
  rows,
  currentUserId,
  emptyMessage,
  showClient,
}: {
  title: string;
  rows: UserRow[];
  currentUserId: string;
  emptyMessage: string;
  showClient?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                {showClient ? <TableHead>Client</TableHead> : null}
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Role / active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.name}
                    {row.id === currentUserId ? (
                      <Badge variant="muted" className="ml-2">
                        You
                      </Badge>
                    ) : null}
                    {row.phone ? (
                      <span className="block text-xs text-muted-foreground">{row.phone}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  {showClient ? (
                    <TableCell className="text-muted-foreground">{row.clientName ?? "—"}</TableCell>
                  ) : null}
                  <TableCell>
                    <Badge variant={row.isActive ? "info" : "muted"}>{ROLE_LABELS[row.role]}</Badge>
                    {Object.keys(row.permissionsJson ?? {}).length > 0 ? (
                      <Badge variant="warning" className="ml-2">
                        Custom
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.lastLoginAt ? formatRelative(row.lastLoginAt) : `Invited ${formatDate(row.createdAt)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditUserSheet
                        user={{
                          id: row.id,
                          name: row.name,
                          email: row.email,
                          phone: row.phone,
                        }}
                      />
                      <UserRowControls
                        userId={row.id}
                        role={row.role}
                        isActive={row.isActive}
                        isSelf={row.id === currentUserId}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
