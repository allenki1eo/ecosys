"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setRolePermissionAction } from "../actions";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSION_GROUPS, ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@db/schema";

/**
 * Live permission switches. Each toggle writes a `role_permissions` row that
 * overrides the code default, so access can be tuned without a deploy.
 */
export function PermissionMatrix({
  roles,
  effective,
  readOnly,
}: {
  roles: UserRole[];
  /** role → permission → currently effective value */
  effective: Record<string, Record<string, boolean>>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [state, setState] = React.useState(effective);
  const [pending, startTransition] = React.useTransition();

  const toggle = (role: UserRole, permission: string, enabled: boolean) => {
    setState((prev) => ({ ...prev, [role]: { ...prev[role], [permission]: enabled } }));
    startTransition(async () => {
      const result = await setRolePermissionAction(role, permission, enabled);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
        setState((prev) => ({ ...prev, [role]: { ...prev[role], [permission]: !enabled } }));
      }
    });
  };

  return (
    <div className="space-y-6">
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.label} className="space-y-2">
          <h3 className="text-sm font-medium">{group.label}</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[240px]">Permission</TableHead>
                  {roles.map((role) => (
                    <TableHead key={role} className="whitespace-nowrap text-center">
                      {ROLE_LABELS[role]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.permissions.map((permission) => (
                  <TableRow key={permission.key}>
                    <TableCell>
                      {permission.label}
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {permission.key}
                      </span>
                    </TableCell>
                    {roles.map((role) => (
                      <TableCell key={role} className="text-center">
                        <Switch
                          checked={Boolean(state[role]?.[permission.key])}
                          disabled={readOnly || pending || role === "super_admin"}
                          aria-label={`${ROLE_LABELS[role]}: ${permission.label}`}
                          onCheckedChange={(checked) => toggle(role, permission.key, checked)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
