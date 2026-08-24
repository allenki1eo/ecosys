import {
  Building2,
  CalendarDays,
  FileCheck2,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldAlert,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden entirely when the signed-in user lacks this permission. */
  permission?: string;
  description?: string;
};

export type NavSection = { label: string; items: NavItem[] };

export const INTERNAL_NAV: NavSection[] = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, description: "Company-wide KPIs" },
      {
        href: "/schedule",
        label: "Schedule",
        icon: CalendarDays,
        permission: "jobs.view",
        description: "Calendar of all crews and sites",
      },
      {
        href: "/jobs",
        label: "Jobs",
        icon: Truck,
        permission: "jobs.view",
        description: "Job pipeline and field reports",
      },
      {
        href: "/clients",
        label: "Clients",
        icon: Building2,
        permission: "clients.view",
        description: "Sub-companies, sites and contracts",
      },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        href: "/inventory",
        label: "Inventory",
        icon: Package,
        permission: "inventory.view",
        description: "Chemical stock, suppliers, equipment",
      },
      {
        href: "/compliance",
        label: "Compliance",
        icon: FileCheck2,
        permission: "certificates.view",
        description: "Certificates and audit exports",
      },
      {
        href: "/incidents",
        label: "Incidents",
        icon: ShieldAlert,
        permission: "incidents.view",
        description: "Site issues and resolutions",
      },
      {
        href: "/finance",
        label: "Finance",
        icon: Receipt,
        permission: "invoices.view",
        description: "Invoices, payments and revenue",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        permission: "users.manage",
        description: "Invite, deactivate, assign roles",
      },
      {
        href: "/admin/services",
        label: "Services",
        icon: Sparkles,
        description: "Service catalogue, checklists and rates",
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        description: "Permissions, notifications, audit log",
      },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/services", label: "Service history", icon: CalendarDays },
  { href: "/portal/certificates", label: "Certificates", icon: FileCheck2 },
  { href: "/portal/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
];

export function visibleNav(sections: NavSection[], permissions: Set<string>): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || permissions.has(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
