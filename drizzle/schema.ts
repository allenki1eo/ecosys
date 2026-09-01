/**
 * Ecohygiene Operations — database schema (Turso / libSQL + Drizzle ORM).
 *
 * Conventions
 * -----------
 * - IDs are text (nanoid-style, prefixed per entity) so records can be created
 *   client-side/offline and synced later by the field PWA.
 * - Timestamps are stored as unix-ms integers via Drizzle's `timestamp` mode.
 * - Money is stored as whole Tanzanian Shillings (TZS has no minor unit in
 *   practice) in `integer` columns. Never use floats for money.
 * - Quantities are `real` because chemicals are measured in litres/kg.
 * - Every client-facing table carries `client_id` (directly or one FK hop away)
 *   so the repository layer can scope reads without a join gymnastics pass.
 */
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* -------------------------------------------------------------------------- */
/* Enumerations (SQLite has no native enum — these are the allowed values)      */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = [
  "super_admin",
  "operations_manager",
  "inventory_manager",
  "finance",
  "site_supervisor",
  "field_technician",
  "client_admin",
  "client_viewer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that belong to an external client tenant rather than Ecohygiene. */
export const CLIENT_ROLES = ["client_admin", "client_viewer"] as const;

export const JOB_STATUSES = [
  "scheduled",
  "en_route",
  "in_progress",
  "completed",
  "signed_off",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const INCIDENT_STATUSES = ["open", "investigating", "resolved", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "issued", "part_paid", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CLIENT_STATUSES = ["prospect", "active", "suspended", "churned"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const EQUIPMENT_STATUSES = ["available", "deployed", "maintenance", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "ordered",
  "received",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const CERTIFICATE_TYPES = [
  "pest_control",
  "fumigation",
  "wastewater_discharge",
  "sanitation",
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const SERVICE_REQUEST_STATUSES = [
  "pending",
  "acknowledged",
  "scheduled",
  "declined",
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

const now = sql`(unixepoch() * 1000)`;

/* -------------------------------------------------------------------------- */
/* Identity & access                                                           */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    /**
     * Per-user permission overrides, e.g. `{"inventory.approve_po": true}`.
     * Merged on top of the role defaults so a Super Admin can fine-tune access
     * without a redeploy. See `src/lib/auth/permissions.ts`.
     */
    permissionsJson: text("permissions_json", { mode: "json" })
      .$type<Record<string, boolean>>()
      .default({}),
    /** Set only for external client-portal users. NULL for Ecohygiene staff. */
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    themePreference: text("theme_preference").$type<"dark" | "light" | "system">().default("dark"),
    notifyBySms: integer("notify_by_sms", { mode: "boolean" }).notNull().default(true),
    notifyByEmail: integer("notify_by_email", { mode: "boolean" }).notNull().default(true),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    clientIdx: index("users_client_idx").on(t.clientId),
  }),
);

/** Server-side sessions (Lucia-style: opaque id in an httpOnly cookie). */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

/**
 * Role-level permission switches the Super Admin can toggle in Settings.
 * A missing row means "fall back to the hard-coded role default".
 */
export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    id: text("id").primaryKey(),
    role: text("role").$type<UserRole>().notNull(),
    permission: text("permission").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ rolePermIdx: uniqueIndex("role_permissions_idx").on(t.role, t.permission) }),
);

/* -------------------------------------------------------------------------- */
/* Tenants: clients (sub-companies) and their sites                            */
/* -------------------------------------------------------------------------- */

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** URL-safe key used for the branded portal path, e.g. /portal (scoped). */
    slug: text("slug").notNull(),
    industry: text("industry"),
    contractStart: integer("contract_start", { mode: "timestamp_ms" }),
    contractEnd: integer("contract_end", { mode: "timestamp_ms" }),
    billingContact: text("billing_contact"),
    billingEmail: text("billing_email"),
    billingPhone: text("billing_phone"),
    /** Standard payment terms in days — used to date auto-generated invoices. */
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    status: text("status").$type<ClientStatus>().notNull().default("active"),
    /** Optional white-labelling of the client portal. */
    brandColor: text("brand_color"),
    logoUrl: text("logo_url"),
    /** Client-specific chemical formula / spec notes for crews. */
    specNotes: text("spec_notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ slugIdx: uniqueIndex("clients_slug_idx").on(t.slug) }),
);

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    region: text("region"),
    gpsLat: real("gps_lat"),
    gpsLng: real("gps_lng"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ clientIdx: index("sites_client_idx").on(t.clientId) }),
);

/* -------------------------------------------------------------------------- */
/* Service catalogue, jobs and field evidence                                  */
/* -------------------------------------------------------------------------- */

export type ChecklistItem = { id: string; label: string; done?: boolean; note?: string };

export const serviceTypes = sqliteTable(
  "service_types",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** Human-readable cadence, e.g. "Every 2 weeks". */
    defaultFrequency: text("default_frequency"),
    defaultDurationMinutes: integer("default_duration_minutes").notNull().default(120),
    /** Checklist rendered on the technician's mobile job view. */
    checklistTemplateJson: text("checklist_template_json", { mode: "json" })
      .$type<ChecklistItem[]>()
      .default([]),
    issuesCertificate: integer("issues_certificate", { mode: "boolean" }).notNull().default(false),
    certificateType: text("certificate_type").$type<CertificateType>(),
    certificateValidityDays: integer("certificate_validity_days"),
    /** Default billing rate in TZS, overridable per job line item. */
    defaultRate: integer("default_rate").notNull().default(0),
  },
  (t) => ({ slugIdx: uniqueIndex("service_types_slug_idx").on(t.slug) }),
);

/** Recurring schedule definitions, e.g. "Pepsi Factory A — pest control q2w". */
export const recurringJobTemplates = sqliteTable(
  "recurring_job_templates",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    serviceTypeId: text("service_type_id")
      .notNull()
      .references(() => serviceTypes.id),
    /** Interval between visits in days (14 = fortnightly). */
    intervalDays: integer("interval_days").notNull().default(14),
    /** Local time-of-day for generated jobs, "HH:MM" 24h. */
    timeOfDay: text("time_of_day").notNull().default("08:00"),
    assignedCrewJson: text("assigned_crew_json", { mode: "json" })
      .$type<string[]>()
      .default([]),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ siteIdx: index("recurring_templates_site_idx").on(t.siteId) }),
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    /** Short human reference shown to crews and clients, e.g. "JOB-2481". */
    reference: text("reference").notNull(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    serviceTypeId: text("service_type_id")
      .notNull()
      .references(() => serviceTypes.id),
    /** Denormalised for cheap tenant scoping — always mirrors sites.client_id. */
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    assignedCrewJson: text("assigned_crew_json", { mode: "json" })
      .$type<string[]>()
      .default([]),
    supervisorId: text("supervisor_id").references(() => users.id),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    status: text("status").$type<JobStatus>().notNull().default("scheduled"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    checklistJson: text("checklist_json", { mode: "json" }).$type<ChecklistItem[]>().default([]),
    /** Client sign-off evidence captured on the technician's device. */
    signatureUrl: text("signature_url"),
    signedOffBy: text("signed_off_by"),
    signedOffAt: integer("signed_off_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    /** Findings written up for the client-visible job report. */
    reportSummary: text("report_summary"),
    recurringTemplateId: text("recurring_template_id").references(() => recurringJobTemplates.id, {
      onDelete: "set null",
    }),
    billedInvoiceId: text("billed_invoice_id"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    refIdx: uniqueIndex("jobs_reference_idx").on(t.reference),
    clientIdx: index("jobs_client_idx").on(t.clientId),
    siteIdx: index("jobs_site_idx").on(t.siteId),
    scheduleIdx: index("jobs_scheduled_idx").on(t.scheduledAt),
    statusIdx: index("jobs_status_idx").on(t.status),
  }),
);

export const jobPhotos = sqliteTable(
  "job_photos",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    caption: text("caption"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ jobIdx: index("job_photos_job_idx").on(t.jobId) }),
);

/** Ad-hoc service requests raised from the client portal. */
export const serviceRequests = sqliteTable(
  "service_requests",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    serviceTypeId: text("service_type_id").references(() => serviceTypes.id),
    requestedBy: text("requested_by").references(() => users.id),
    preferredDate: integer("preferred_date", { mode: "timestamp_ms" }),
    urgency: text("urgency").$type<"routine" | "urgent" | "emergency">().notNull().default("routine"),
    description: text("description").notNull(),
    status: text("status").$type<ServiceRequestStatus>().notNull().default("pending"),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ clientIdx: index("service_requests_client_idx").on(t.clientId) }),
);

/* -------------------------------------------------------------------------- */
/* Inventory, suppliers, equipment                                             */
/* -------------------------------------------------------------------------- */

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  email: text("email"),
  phone: text("phone"),
  leadTimeDays: integer("lead_time_days").notNull().default(7),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<"chemical" | "consumable" | "ppe" | "spare_part">().notNull(),
    unit: text("unit").notNull().default("L"),
    quantityOnHand: real("quantity_on_hand").notNull().default(0),
    reorderThreshold: real("reorder_threshold").notNull().default(0),
    /** Unit cost in TZS — internal only, never exposed to client portals. */
    costPerUnit: integer("cost_per_unit").notNull().default(0),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** Default storage location, e.g. "Shinyanga Warehouse". */
    location: text("location").notNull().default("Shinyanga Warehouse"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ skuIdx: uniqueIndex("inventory_items_sku_idx").on(t.sku) }),
);

/**
 * Append-only stock ledger. `quantity_on_hand` on the item is a materialised
 * running total — every change must also write a movement row so the audit
 * trail reconciles.
 */
export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    /** Set when stock was consumed by a job (auto-deduct on completion). */
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** Set when stock was allocated to a mixing unit deployed at a site. */
    siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }),
    /** Negative = consumed/transferred out, positive = received/returned. */
    quantityDelta: real("quantity_delta").notNull(),
    reason: text("reason")
      .$type<"purchase" | "job_usage" | "transfer" | "adjustment" | "wastage" | "return">()
      .notNull(),
    performedBy: text("performed_by").references(() => users.id),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    itemIdx: index("inventory_movements_item_idx").on(t.itemId),
    jobIdx: index("inventory_movements_job_idx").on(t.jobId),
    // Per-location balances group by (item, site); this serves both that and
    // the "what does this site hold" view.
    siteItemIdx: index("inventory_movements_site_item_idx").on(t.siteId, t.itemId),
  }),
);

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: text("status").$type<PurchaseOrderStatus>().notNull().default("requested"),
    requestedBy: text("requested_by").references(() => users.id),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    expectedAt: integer("expected_at", { mode: "timestamp_ms" }),
    totalAmount: integer("total_amount").notNull().default(0),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ refIdx: uniqueIndex("purchase_orders_reference_idx").on(t.reference) }),
);

export const purchaseOrderItems = sqliteTable(
  "purchase_order_items",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    quantity: real("quantity").notNull(),
    unitCost: integer("unit_cost").notNull().default(0),
  },
  (t) => ({ poIdx: index("purchase_order_items_po_idx").on(t.purchaseOrderId) }),
);

export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").$type<"sprayer" | "mixing_unit" | "vehicle" | "meter" | "other">().notNull(),
    serialNumber: text("serial_number"),
    /** NULL = at the warehouse; set = deployed at a client site. */
    currentSiteId: text("current_site_id").references(() => sites.id, { onDelete: "set null" }),
    status: text("status").$type<EquipmentStatus>().notNull().default("available"),
    lastMaintenanceAt: integer("last_maintenance_at", { mode: "timestamp_ms" }),
    nextMaintenanceAt: integer("next_maintenance_at", { mode: "timestamp_ms" }),
    /** Payload encoded in the QR sticker for scan-to-log on site. */
    qrCode: text("qr_code"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ siteIdx: index("equipment_site_idx").on(t.currentSiteId) }),
);

export const equipmentMaintenance = sqliteTable(
  "equipment_maintenance",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    performedAt: integer("performed_at", { mode: "timestamp_ms" }).notNull(),
    performedBy: text("performed_by").references(() => users.id),
    description: text("description").notNull(),
    cost: integer("cost").notNull().default(0),
  },
  (t) => ({ equipmentIdx: index("equipment_maintenance_equipment_idx").on(t.equipmentId) }),
);

/* -------------------------------------------------------------------------- */
/* Compliance                                                                  */
/* -------------------------------------------------------------------------- */

export const certificates = sqliteTable(
  "certificates",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    type: text("type").$type<CertificateType>().notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    pdfUrl: text("pdf_url"),
    issuedBy: text("issued_by").references(() => users.id),
    /** Regulator the document is prepared for: TBS / TFDA / NEMC / internal. */
    authority: text("authority"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    refIdx: uniqueIndex("certificates_reference_idx").on(t.reference),
    clientIdx: index("certificates_client_idx").on(t.clientId),
    expiryIdx: index("certificates_expiry_idx").on(t.expiresAt),
  }),
);

/* -------------------------------------------------------------------------- */
/* Incidents & quality                                                         */
/* -------------------------------------------------------------------------- */

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    reportedBy: text("reported_by").references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").$type<"low" | "medium" | "high" | "critical">().notNull().default("medium"),
    status: text("status").$type<IncidentStatus>().notNull().default("open"),
    photoUrl: text("photo_url"),
    assignedTo: text("assigned_to").references(() => users.id),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolutionNotes: text("resolution_notes"),
    /** Internal-only incidents (e.g. crew error reviews) stay hidden. */
    clientVisible: integer("client_visible", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    refIdx: uniqueIndex("incidents_reference_idx").on(t.reference),
    clientIdx: index("incidents_client_idx").on(t.clientId),
    statusIdx: index("incidents_status_idx").on(t.status),
  }),
);

/* -------------------------------------------------------------------------- */
/* Finance                                                                     */
/* -------------------------------------------------------------------------- */

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Total in TZS, kept in sync with the sum of line items. */
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    numberIdx: uniqueIndex("invoices_number_idx").on(t.number),
    clientIdx: index("invoices_client_idx").on(t.clientId),
    statusIdx: index("invoices_status_idx").on(t.status),
  }),
);

export const invoiceLineItems = sqliteTable(
  "invoice_line_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unitAmount: integer("unit_amount").notNull().default(0),
    amount: integer("amount").notNull().default(0),
  },
  (t) => ({ invoiceIdx: index("invoice_line_items_invoice_idx").on(t.invoiceId) }),
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    method: text("method").$type<"bank_transfer" | "mobile_money" | "cash" | "cheque">().notNull(),
    reference: text("reference"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    recordedBy: text("recorded_by").references(() => users.id),
  },
  (t) => ({ invoiceIdx: index("payments_invoice_idx").on(t.invoiceId) }),
);

/* -------------------------------------------------------------------------- */
/* Payroll                                                                     */
/* -------------------------------------------------------------------------- */

export const EMPLOYMENT_MODES = ["specified", "unspecified", "casual"] as const;
export type EmploymentMode = (typeof EMPLOYMENT_MODES)[number];

export const PAYROLL_RUN_STATUSES = ["draft", "finalised", "paid"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

/**
 * A loan is repaid over several months; an advance is drawn against a salary
 * not yet paid and normally cleared in one. They behave identically here — the
 * distinction is what the payslip and the ledger call it.
 */
export const LOAN_KINDS = ["loan", "advance"] as const;
export type LoanKind = (typeof LOAN_KINDS)[number];

/**
 * Ecohygiene's own staff, as payroll sees them. Kept separate from `users`
 * because the two sets only partly overlap: a technician may have a login and
 * a payroll record, a cleaner may have payroll and no login, and a client
 * contact has a login and no payroll. `user_id` links them where both exist.
 */
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    /** Payroll number as it appears on the payslip. */
    employeeNo: text("employee_no").notNull(),
    name: text("name").notNull(),
    designation: text("designation"),
    department: text("department"),
    employmentMode: text("employment_mode").$type<EmploymentMode>().notNull().default("specified"),
    nidaNumber: text("nida_number"),
    nssfNumber: text("nssf_number"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    phone: text("phone"),
    email: text("email"),
    /** Monthly basic salary in whole TZS. */
    basicSalary: integer("basic_salary").notNull().default(0),
    /** Paid on top of net pay and not subject to PAYE or NSSF (transport). */
    untaxableAllowance: integer("untaxable_allowance").notNull().default(0),
    responsibilityAllowance: integer("responsibility_allowance").notNull().default(0),
    /** Hours in a standard month, used to derive the overtime hourly rate. */
    monthlyHours: integer("monthly_hours").notNull().default(195),
    startDate: integer("start_date", { mode: "timestamp_ms" }),
    endDate: integer("end_date", { mode: "timestamp_ms" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    employeeNoIdx: uniqueIndex("employees_employee_no_idx").on(t.employeeNo),
    activeIdx: index("employees_active_idx").on(t.isActive),
  }),
);

/** Statutory rates, snapshotted onto each run — see `payrollRuns.ratesJson`. */
export type PayrollRates = {
  /** Employee NSSF contribution, as a fraction of basic pay. */
  nssfEmployee: number;
  /** Employer NSSF contribution, as a fraction of basic pay. */
  nssfEmployer: number;
  /** Skills & Development Levy, employer-borne. */
  sdl: number;
  /** Workers Compensation Fund, employer-borne. */
  wcf: number;
  /** Monthly PAYE bands, lowest first: income above `from` is taxed at `rate`. */
  payeBands: { from: number; rate: number }[];
};

export const payrollRuns = sqliteTable(
  "payroll_runs",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    /** The month this run pays for, as `YYYY-MM`. */
    period: text("period").notNull(),
    label: text("label").notNull(),
    status: text("status").$type<PayrollRunStatus>().notNull().default("draft"),
    /**
     * The statutory rates in force when the run was created. Snapshotted so a
     * later rate change never rewrites a payslip that has already been issued.
     */
    ratesJson: text("rates_json", { mode: "json" }).$type<PayrollRates>().notNull(),
    /** Materialised totals, so the list page needs no aggregate query. */
    totalGross: integer("total_gross").notNull().default(0),
    totalDeductions: integer("total_deductions").notNull().default(0),
    totalNetPay: integer("total_net_pay").notNull().default(0),
    totalEmployerCost: integer("total_employer_cost").notNull().default(0),
    employeeCount: integer("employee_count").notNull().default(0),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    finalisedAt: integer("finalised_at", { mode: "timestamp_ms" }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    refIdx: uniqueIndex("payroll_runs_reference_idx").on(t.reference),
    periodIdx: uniqueIndex("payroll_runs_period_idx").on(t.period),
  }),
);

/**
 * One employee's pay for one run. Identity and salary fields are copied rather
 * than joined: a payslip is a statement of what was paid on a date, and must
 * not change when someone is later given a raise or a new bank account.
 */
export const payslips = sqliteTable(
  "payslips",
  {
    id: text("id").primaryKey(),
    payrollRunId: text("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    /* Snapshot of the employee at the time of the run. */
    employeeNo: text("employee_no").notNull(),
    employeeName: text("employee_name").notNull(),
    designation: text("designation"),
    employmentMode: text("employment_mode").$type<EmploymentMode>().notNull(),
    nidaNumber: text("nida_number"),
    nssfNumber: text("nssf_number"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),

    /* Attendance. */
    daysWorked: integer("days_worked").notNull().default(28),
    earnedLeaveDays: integer("earned_leave_days").notNull().default(0),
    sickLeaveDays: integer("sick_leave_days").notNull().default(0),

    /* Earnings. */
    basicSalary: integer("basic_salary").notNull(),
    hourlyRate: integer("hourly_rate").notNull().default(0),
    overtimeNormalHours: real("overtime_normal_hours").notNull().default(0),
    overtimeNormalAmount: integer("overtime_normal_amount").notNull().default(0),
    publicHolidayHours: real("public_holiday_hours").notNull().default(0),
    publicHolidayAmount: integer("public_holiday_amount").notNull().default(0),
    responsibilityAllowance: integer("responsibility_allowance").notNull().default(0),
    /** Not taxed and outside NSSF; paid on top of net pay. */
    untaxableAllowance: integer("untaxable_allowance").notNull().default(0),
    grossEarnings: integer("gross_earnings").notNull().default(0),

    /* Employee deductions. */
    taxableSalary: integer("taxable_salary").notNull().default(0),
    paye: integer("paye").notNull().default(0),
    /**
     * A PAYE figure typed in by hand, which wins over the computed one. Null
     * means "use the bands". Kept separate from `paye` so that re-running the
     * calculation after any other edit does not silently discard it.
     */
    payeOverride: integer("paye_override"),
    nssfEmployee: integer("nssf_employee").notNull().default(0),
    loanDeduction: integer("loan_deduction").notNull().default(0),
    otherDeductions: integer("other_deductions").notNull().default(0),
    totalDeductions: integer("total_deductions").notNull().default(0),
    netPay: integer("net_pay").notNull().default(0),
    /** Net pay plus the untaxable allowance — what actually reaches the bank. */
    totalEarning: integer("total_earning").notNull().default(0),

    /* Employer-borne cost. */
    nssfEmployer: integer("nssf_employer").notNull().default(0),
    sdl: integer("sdl").notNull().default(0),
    wcf: integer("wcf").notNull().default(0),
    employerTotalCost: integer("employer_total_cost").notNull().default(0),

    notes: text("notes"),
    /** Set when the payslip has been sent to the employee. */
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    sentTo: text("sent_to"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    runIdx: index("payslips_run_idx").on(t.payrollRunId),
    runEmployeeIdx: uniqueIndex("payslips_run_employee_idx").on(t.payrollRunId, t.employeeId),
  }),
);

/**
 * Money advanced to an employee and recovered from their pay.
 *
 * The outstanding balance is *not* stored: it is the principal less the
 * repayments booked against it. A second running total is a second number to
 * drift, and this one would drift every time a run was reopened.
 */
export const employeeLoans = sqliteTable(
  "employee_loans",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").$type<LoanKind>().notNull().default("loan"),
    /** Amount handed over, in whole TZS. */
    principal: integer("principal").notNull(),
    /** Recovered from each payslip until the balance clears. */
    monthlyDeduction: integer("monthly_deduction").notNull(),
    /** First month to deduct from, as `YYYY-MM`. Runs before it are skipped. */
    startPeriod: text("start_period").notNull(),
    issuedOn: integer("issued_on", { mode: "timestamp_ms" }).notNull().default(now),
    reason: text("reason"),
    notes: text("notes"),
    /**
     * Set when the balance is written off or the loan was recorded in error.
     * Settlement is not a status — it is what a zero balance means.
     */
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    refIdx: uniqueIndex("employee_loans_reference_idx").on(t.reference),
    employeeIdx: index("employee_loans_employee_idx").on(t.employeeId),
  }),
);

/**
 * Append-only repayment ledger. A row with a `payslip_id` was recovered from
 * pay; one without was paid back directly (cash, or a bank transfer).
 *
 * A payslip-linked row only counts against the balance once its run leaves
 * draft — a proposed deduction on a run that may still be deleted has not been
 * repaid. That is a join, deliberately, rather than a status column to keep in
 * step with the run.
 */
export const loanRepayments = sqliteTable(
  "loan_repayments",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => employeeLoans.id, { onDelete: "cascade" }),
    payslipId: text("payslip_id").references(() => payslips.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    /** The month this repayment belongs to, as `YYYY-MM`. */
    period: text("period").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    loanIdx: index("loan_repayments_loan_idx").on(t.loanId),
    payslipIdx: index("loan_repayments_payslip_idx").on(t.payslipId),
  }),
);

/* -------------------------------------------------------------------------- */
/* Platform: audit trail and outbound notifications                            */
/* -------------------------------------------------------------------------- */

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("audit_log_user_idx").on(t.userId),
    entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  }),
);

/** Outbox for SMS/email reminders so delivery can be retried and audited. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    channel: text("channel").$type<"sms" | "email">().notNull(),
    recipient: text("recipient").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    template: text("template").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<"queued" | "sent" | "failed">().notNull().default("queued"),
    error: text("error"),
    relatedJobId: text("related_job_id").references(() => jobs.id, { onDelete: "set null" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => ({ statusIdx: index("notifications_status_idx").on(t.status) }),
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const clientsRelations = relations(clients, ({ many }) => ({
  sites: many(sites),
  jobs: many(jobs),
  invoices: many(invoices),
  incidents: many(incidents),
  certificates: many(certificates),
  users: many(users),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  client: one(clients, { fields: [sites.clientId], references: [clients.id] }),
  jobs: many(jobs),
  incidents: many(incidents),
  certificates: many(certificates),
  equipment: many(equipment),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  site: one(sites, { fields: [jobs.siteId], references: [sites.id] }),
  client: one(clients, { fields: [jobs.clientId], references: [clients.id] }),
  serviceType: one(serviceTypes, { fields: [jobs.serviceTypeId], references: [serviceTypes.id] }),
  photos: many(jobPhotos),
  movements: many(inventoryMovements),
}));

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, { fields: [jobPhotos.jobId], references: [jobs.id] }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [inventoryItems.supplierId], references: [suppliers.id] }),
  movements: many(inventoryMovements),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  item: one(inventoryItems, { fields: [inventoryMovements.itemId], references: [inventoryItems.id] }),
  job: one(jobs, { fields: [inventoryMovements.jobId], references: [jobs.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  lineItems: many(invoiceLineItems),
  payments: many(payments),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobPhoto = typeof jobPhotos.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type RecurringJobTemplate = typeof recurringJobTemplates.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
export type EmployeeLoan = typeof employeeLoans.$inferSelect;
export type LoanRepayment = typeof loanRepayments.$inferSelect;
