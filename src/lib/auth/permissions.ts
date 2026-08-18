import type { UserRole } from "@db/schema";

/**
 * The permission catalogue. Adding a key here makes it appear in
 * Settings → Permissions, where the Super Admin can toggle it per role
 * without a redeploy.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Scheduling & jobs",
    permissions: [
      { key: "jobs.view", label: "View jobs & schedule" },
      { key: "jobs.create", label: "Create and schedule jobs" },
      { key: "jobs.assign", label: "Assign / reassign crews" },
      { key: "jobs.execute", label: "Execute jobs (checklists, photos)" },
      { key: "jobs.sign_off", label: "Record client sign-off" },
      { key: "jobs.cancel", label: "Cancel jobs" },
    ],
  },
  {
    label: "Clients & sites",
    permissions: [
      { key: "clients.view", label: "View clients & sites" },
      { key: "clients.manage", label: "Create / edit clients, sites, contracts" },
    ],
  },
  {
    label: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View stock levels" },
      { key: "inventory.adjust", label: "Adjust stock / log movements" },
      { key: "inventory.request_po", label: "Raise reorder requests" },
      { key: "inventory.approve_po", label: "Approve purchase orders" },
      { key: "inventory.manage_suppliers", label: "Manage suppliers" },
      { key: "inventory.manage_equipment", label: "Manage equipment & maintenance" },
    ],
  },
  {
    label: "Compliance",
    permissions: [
      { key: "certificates.view", label: "View certificates" },
      { key: "certificates.issue", label: "Issue / revoke certificates" },
    ],
  },
  {
    label: "Incidents",
    permissions: [
      { key: "incidents.view", label: "View incidents" },
      { key: "incidents.create", label: "Report incidents" },
      { key: "incidents.resolve", label: "Assign & resolve incidents" },
    ],
  },
  {
    label: "Finance",
    permissions: [
      { key: "invoices.view", label: "View invoices & statements" },
      { key: "invoices.manage", label: "Create / issue invoices" },
      { key: "invoices.record_payment", label: "Record payments" },
      { key: "costs.view", label: "View internal costs & margins" },
    ],
  },
  {
    label: "Reporting",
    permissions: [
      { key: "reports.view", label: "View analytics dashboards" },
      { key: "reports.export", label: "Export audit-ready reports" },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "users.manage", label: "Invite / deactivate users" },
      { key: "permissions.manage", label: "Change role permissions" },
      { key: "settings.manage", label: "Company & notification settings" },
      { key: "audit.view", label: "View the audit log" },
    ],
  },
  {
    label: "Client portal",
    permissions: [
      { key: "portal.view", label: "Access own company portal" },
      { key: "portal.request_service", label: "Request ad-hoc service / raise issues" },
      { key: "portal.approve_report", label: "Approve job reports & download certificates" },
    ],
  },
] as const;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
) as string[];

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

const INTERNAL_READ_ONLY: Permission[] = [
  "jobs.view",
  "clients.view",
  "certificates.view",
  "incidents.view",
  "reports.view",
];

/** Hard-coded defaults. DB rows in `role_permissions` override these. */
export const ROLE_DEFAULTS: Record<UserRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS.filter((p) => !p.startsWith("portal.")) as Permission[],
  operations_manager: [
    ...INTERNAL_READ_ONLY,
    "jobs.create",
    "jobs.assign",
    "jobs.execute",
    "jobs.sign_off",
    "jobs.cancel",
    "clients.manage",
    "inventory.view",
    "inventory.request_po",
    "inventory.manage_equipment",
    "certificates.issue",
    "incidents.create",
    "incidents.resolve",
    "invoices.view",
    "reports.export",
  ],
  inventory_manager: [
    "jobs.view",
    "clients.view",
    "inventory.view",
    "inventory.adjust",
    "inventory.request_po",
    "inventory.manage_suppliers",
    "inventory.manage_equipment",
    "reports.view",
    "costs.view",
  ],
  finance: [
    "jobs.view",
    "clients.view",
    "invoices.view",
    "invoices.manage",
    "invoices.record_payment",
    "costs.view",
    "reports.view",
    "reports.export",
  ],
  site_supervisor: [
    ...INTERNAL_READ_ONLY,
    "jobs.assign",
    "jobs.execute",
    "jobs.sign_off",
    "inventory.view",
    "inventory.adjust",
    "incidents.create",
    "incidents.resolve",
    "certificates.view",
  ],
  field_technician: [
    "jobs.view",
    "jobs.execute",
    "clients.view",
    "inventory.view",
    "incidents.create",
  ],
  client_admin: ["portal.view", "portal.request_service", "portal.approve_report"],
  client_viewer: ["portal.view"],
};

export type PermissionOverride = { permission: string; enabled: boolean };

/**
 * Effective permissions = role defaults, overlaid with the Super Admin's
 * per-role switches, overlaid with per-user overrides from `permissions_json`.
 */
export function resolvePermissions(
  role: UserRole,
  roleOverrides: PermissionOverride[] = [],
  userOverrides: Record<string, boolean> | null | undefined = {},
): Set<string> {
  const effective = new Set<string>(ROLE_DEFAULTS[role] ?? []);

  for (const { permission, enabled } of roleOverrides) {
    if (enabled) effective.add(permission);
    else effective.delete(permission);
  }

  for (const [permission, enabled] of Object.entries(userOverrides ?? {})) {
    if (enabled) effective.add(permission);
    else effective.delete(permission);
  }

  return effective;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  operations_manager: "Operations Manager",
  inventory_manager: "Inventory Manager",
  finance: "Finance / Accounts",
  site_supervisor: "Site Supervisor",
  field_technician: "Field Technician",
  client_admin: "Client Admin",
  client_viewer: "Client Viewer",
};
