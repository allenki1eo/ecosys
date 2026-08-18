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
