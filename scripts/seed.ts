/**
 * Seeds a working demo dataset: Ecohygiene staff, three client companies with
 * their own portal users, a service catalogue, six months of job history,
 * inventory with movements, certificates, incidents and invoices.
 *
 *   npm run db:push && npm run db:seed
 *
 * Safe to re-run: it clears the tables it owns first.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  auditLog,
  certificates,
  employees,
  clients,
  equipment,
  equipmentMaintenance,
  incidents,
  inventoryItems,
  inventoryMovements,
  invoiceLineItems,
  invoices,
  jobPhotos,
  jobs,
  notifications,
  payments,
  payrollRuns,
  payslips,
  purchaseOrderItems,
  purchaseOrders,
  recurringJobTemplates,
  rolePermissions,
  serviceRequests,
  serviceTypes,
  sessions,
  sites,
  suppliers,
  users,
  type JobStatus,
} from "../drizzle/schema";
import { hashPassword } from "../src/lib/auth/password";
import { newId, newReference } from "../src/lib/ids";

const DAY = 24 * 60 * 60 * 1000;
const DEMO_PASSWORD = "ecohygiene2024";

function daysFromNow(days: number, hour = 8, minute = 0): Date {
  const date = new Date(Date.now() + days * DAY);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** Deterministic pseudo-random so re-seeding produces a comparable dataset. */
let seedState = 42;
function random(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

async function clearAll() {
  // Children first — SQLite foreign keys are enforced by libSQL.
  const tables = [
    auditLog,
    notifications,
    payslips,
    payrollRuns,
    employees,
    payments,
    invoiceLineItems,
    invoices,
    certificates,
    incidents,
    serviceRequests,
    jobPhotos,
    inventoryMovements,
    jobs,
    recurringJobTemplates,
    equipmentMaintenance,
    equipment,
    purchaseOrderItems,
    purchaseOrders,
    inventoryItems,
    suppliers,
    serviceTypes,
    sessions,
    rolePermissions,
    users,
    sites,
    clients,
  ];
  for (const table of tables) await db.delete(table);
}

async function main() {
  console.log("Clearing existing data…");
  await clearAll();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  /* ------------------------------- clients ------------------------------- */

  console.log("Seeding clients and sites…");
  const clientSeeds = [
    {
      id: newId("cli"),
      name: "Pepsi Bottling Tanzania",
      slug: "pepsi",
      industry: "Beverage manufacturing",
      billingContact: "Grace Mollel",
      billingEmail: "accounts@pepsi-tz.example",
      billingPhone: "+255754000101",
      specNotes:
        "Food-grade sanitiser only inside the filling hall. No aerosol application within 20 m of the syrup room.",
      paymentTermsDays: 30,
      contractStart: new Date(Date.now() - 300 * DAY),
      contractEnd: daysFromNow(24),
      sites: [
        { name: "Shinyanga Bottling Plant", region: "Shinyanga", lat: -3.6619, lng: 33.4212 },
        { name: "Mwanza Distribution Depot", region: "Mwanza", lat: -2.5164, lng: 32.9175 },
      ],
    },
    {
      id: newId("cli"),
      name: "Sayona Fruits",
      slug: "sayona",
      industry: "Juice & food processing",
      billingContact: "Emmanuel Kessy",
      billingEmail: "finance@sayona.example",
      billingPhone: "+255754000202",
      specNotes: "Wastewater discharge readings must be filed with NEMC quarterly.",
      paymentTermsDays: 45,
      contractStart: new Date(Date.now() - 420 * DAY),
      contractEnd: daysFromNow(210),
      sites: [{ name: "Sayona Factory — Shinyanga", region: "Shinyanga", lat: -3.6702, lng: 33.4256 }],
    },
    {
      id: newId("cli"),
      name: "Jambo Foods",
      slug: "jambo",
      industry: "Grain milling",
      billingContact: "Neema Charles",
      billingEmail: "neema@jambofoods.example",
      billingPhone: "+255754000303",
      specNotes: "Fumigation requires 48 hours notice — plant shuts the mill line.",
      paymentTermsDays: 30,
      contractStart: new Date(Date.now() - 180 * DAY),
      contractEnd: daysFromNow(6),
      sites: [
        { name: "Jambo Mill — Kahama", region: "Shinyanga", lat: -3.8378, lng: 32.6011 },
        { name: "Jambo Warehouse — Shinyanga", region: "Shinyanga", lat: -3.6588, lng: 33.4301 },
      ],
    },
  ];

  const siteIds: { id: string; clientId: string; name: string }[] = [];

  for (const seed of clientSeeds) {
    await db.insert(clients).values({
      id: seed.id,
      name: seed.name,
      slug: seed.slug,
      industry: seed.industry,
      contractStart: seed.contractStart,
      contractEnd: seed.contractEnd,
      billingContact: seed.billingContact,
      billingEmail: seed.billingEmail,
      billingPhone: seed.billingPhone,
      paymentTermsDays: seed.paymentTermsDays,
      status: "active",
      specNotes: seed.specNotes,
    });

    for (const site of seed.sites) {
      const id = newId("site");
      await db.insert(sites).values({
        id,
        clientId: seed.id,
        name: site.name,
        address: `${site.name}, ${site.region}, Tanzania`,
        region: site.region,
        gpsLat: site.lat,
        gpsLng: site.lng,
        contactName: pick(["J. Mwanri", "A. Shirima", "P. Ngonyani", "L. Mbise"]),
        contactPhone: `+2557540004${Math.floor(random() * 90 + 10)}`,
      });
      siteIds.push({ id, clientId: seed.id, name: site.name });
    }
  }

  /* -------------------------------- users -------------------------------- */

  console.log("Seeding users…");
  const staffSeeds = [
    { name: "Allen Kileo", email: "allen@ecohygiene.co.tz", role: "super_admin" as const },
    { name: "Rehema Msuya", email: "ops@ecohygiene.co.tz", role: "operations_manager" as const },
    { name: "Daniel Mkenda", email: "stores@ecohygiene.co.tz", role: "inventory_manager" as const },
    { name: "Fatuma Juma", email: "finance@ecohygiene.co.tz", role: "finance" as const },
    { name: "Baraka Method", email: "supervisor@ecohygiene.co.tz", role: "site_supervisor" as const },
    { name: "Joseph Materu", email: "joseph@ecohygiene.co.tz", role: "field_technician" as const },
    { name: "Salma Ally", email: "salma@ecohygiene.co.tz", role: "field_technician" as const },
    { name: "Peter Lyimo", email: "peter@ecohygiene.co.tz", role: "field_technician" as const },
  ];

  const staffIds: Record<string, string> = {};
  for (const [index, seed] of staffSeeds.entries()) {
    const id = newId("usr");
    staffIds[seed.email] = id;
    await db.insert(users).values({
      id,
      name: seed.name,
      email: seed.email,
      phone: `+2557550001${String(index).padStart(2, "0")}`,
      role: seed.role,
      passwordHash,
      lastLoginAt: new Date(Date.now() - index * 3 * 60 * 60 * 1000),
    });
  }

  const technicians = [
    staffIds["joseph@ecohygiene.co.tz"],
    staffIds["salma@ecohygiene.co.tz"],
    staffIds["peter@ecohygiene.co.tz"],
  ];

  for (const [index, seed] of clientSeeds.entries()) {
    await db.insert(users).values([
      {
        id: newId("usr"),
        name: `${seed.billingContact}`,
        email: `admin@${seed.slug}.example`,
        phone: seed.billingPhone,
        role: "client_admin",
        clientId: seed.id,
        passwordHash,
      },
      {
        id: newId("usr"),
        name: pick(["QA Office", "Plant Manager", "Compliance Desk"]),
        email: `viewer@${seed.slug}.example`,
        phone: `+2557540009${index}0`,
        role: "client_viewer",
        clientId: seed.id,
        passwordHash,
      },
    ]);
  }

  /* --------------------------- service catalogue ------------------------- */

  console.log("Seeding service catalogue…");
  const serviceSeeds = [
    {
      id: newId("svc"),
      name: "Pest control",
      slug: "pest-control",
      description: "Routine inspection, bait station servicing and targeted treatment.",
      defaultFrequency: "Every 2 weeks",
      defaultDurationMinutes: 150,
      issuesCertificate: true,
      certificateType: "pest_control" as const,
      certificateValidityDays: 90,
      defaultRate: 450_000,
      checklist: [
        "Inspect all bait stations and record activity",
        "Check perimeter entry points and seal gaps",
        "Apply treatment to identified harbourage areas",
        "Record findings and replace consumed bait",
        "Brief site contact on findings",
      ],
    },
    {
      id: newId("svc"),
      name: "Factory deep clean",
      slug: "factory-clean",
      description: "Full production-area sanitation with food-grade chemicals.",
      defaultFrequency: "Monthly",
      defaultDurationMinutes: 300,
      issuesCertificate: true,
      certificateType: "sanitation" as const,
      certificateValidityDays: 30,
      defaultRate: 1_200_000,
      checklist: [
        "Isolate and cover sensitive equipment",
        "Degrease floors, drains and wall skirting",
        "Sanitise contact surfaces with food-grade agent",
        "Rinse and verify with ATP swab",
        "Restore the line and sign off with QA",
      ],
    },
    {
      id: newId("svc"),
      name: "Fumigation",
      slug: "fumigation",
      description: "Sealed-area fumigation for stored grain and raw materials.",
      defaultFrequency: "Quarterly",
      defaultDurationMinutes: 480,
      issuesCertificate: true,
      certificateType: "fumigation" as const,
      certificateValidityDays: 120,
      defaultRate: 2_400_000,
      checklist: [
        "Confirm area evacuated and sealed",
        "Post warning signage at all entries",
        "Deploy fumigant at calculated dosage",
        "Monitor concentration through exposure period",
        "Ventilate and clear the area for re-entry",
      ],
    },
    {
      id: newId("svc"),
      name: "Wastewater treatment",
      slug: "wastewater",
      description: "Effluent dosing, sampling and NEMC discharge reporting.",
      defaultFrequency: "Weekly",
      defaultDurationMinutes: 120,
      issuesCertificate: true,
      certificateType: "wastewater_discharge" as const,
      certificateValidityDays: 90,
      defaultRate: 700_000,
      checklist: [
        "Take influent and effluent samples",
        "Record pH, COD and TSS readings",
        "Dose treatment chemicals to specification",
        "Check pumps and aerators",
        "File discharge reading for NEMC",
      ],
    },
    {
      id: newId("svc"),
      name: "Mixing unit service",
      slug: "mixing-unit",
      description: "Chemical mixing unit calibration and refill at client site.",
      defaultFrequency: "Monthly",
      defaultDurationMinutes: 90,
      issuesCertificate: false,
      certificateType: null,
      certificateValidityDays: null,
      defaultRate: 300_000,
      checklist: [
        "Check dosing accuracy against specification",
        "Refill chemical reservoirs",
        "Inspect hoses and seals for wear",
        "Log unit reading",
      ],
    },
  ];

  for (const seed of serviceSeeds) {
    await db.insert(serviceTypes).values({
      id: seed.id,
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      defaultFrequency: seed.defaultFrequency,
      defaultDurationMinutes: seed.defaultDurationMinutes,
      issuesCertificate: seed.issuesCertificate,
      certificateType: seed.certificateType,
      certificateValidityDays: seed.certificateValidityDays,
      defaultRate: seed.defaultRate,
      checklistTemplateJson: seed.checklist.map((label, index) => ({
        id: `c${index + 1}`,
        label,
      })),
    });
  }

  /* ------------------------- suppliers & inventory ----------------------- */

  console.log("Seeding inventory…");
  const supplierSeeds = [
    { id: newId("sup"), name: "Kilimanjaro Chemicals Ltd", contact: "Asha Ndosi", lead: 7 },
    { id: newId("sup"), name: "Lake Zone Hygiene Supplies", contact: "Frank Mushi", lead: 4 },
    { id: newId("sup"), name: "Dar Industrial Safety", contact: "Zawadi Haule", lead: 14 },
  ];
  for (const supplier of supplierSeeds) {
    await db.insert(suppliers).values({
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      email: `sales@${supplier.name.split(" ")[0].toLowerCase()}.example`,
      phone: `+2557620001${Math.floor(random() * 90 + 10)}`,
      leadTimeDays: supplier.lead,
    });
  }

  const itemSeeds = [
    { sku: "CHM-001", name: "Cypermethrin 10% EC", category: "chemical" as const, unit: "L", qty: 42, threshold: 25, cost: 38_000 },
    { sku: "CHM-002", name: "Food-grade sanitiser (QAC)", category: "chemical" as const, unit: "L", qty: 18, threshold: 30, cost: 22_000 },
    { sku: "CHM-003", name: "Aluminium phosphide tablets", category: "chemical" as const, unit: "kg", qty: 12, threshold: 8, cost: 96_000 },
    { sku: "CHM-004", name: "Effluent flocculant", category: "chemical" as const, unit: "kg", qty: 64, threshold: 40, cost: 15_500 },
    { sku: "CHM-005", name: "Rodent bait blocks", category: "chemical" as const, unit: "kg", qty: 7, threshold: 15, cost: 28_000 },
    { sku: "CON-001", name: "Bait station housings", category: "consumable" as const, unit: "pcs", qty: 120, threshold: 50, cost: 9_000 },
    { sku: "CON-002", name: "ATP swab tests", category: "consumable" as const, unit: "pcs", qty: 60, threshold: 40, cost: 12_000 },
    { sku: "PPE-001", name: "Respirator cartridges", category: "ppe" as const, unit: "pcs", qty: 34, threshold: 20, cost: 18_000 },
    { sku: "PPE-002", name: "Chemical-resistant gloves", category: "ppe" as const, unit: "pairs", qty: 46, threshold: 25, cost: 7_500 },
    { sku: "SPR-001", name: "Sprayer nozzle set", category: "spare_part" as const, unit: "sets", qty: 9, threshold: 5, cost: 45_000 },
  ];

  const itemIds: Record<string, string> = {};
  for (const [index, item] of itemSeeds.entries()) {
    const id = newId("itm");
    itemIds[item.sku] = id;
    await db.insert(inventoryItems).values({
      id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantityOnHand: item.qty,
      reorderThreshold: item.threshold,
      costPerUnit: item.cost,
      supplierId: supplierSeeds[index % supplierSeeds.length].id,
    });
  }

  // One pending reorder awaiting approval, so the workflow is visible.
  const poId = newId("po");
  await db.insert(purchaseOrders).values({
    id: poId,
    reference: newReference("PO"),
    supplierId: supplierSeeds[0].id,
    status: "requested",
    requestedBy: staffIds["stores@ecohygiene.co.tz"],
    totalAmount: 60 * 22_000,
    expectedAt: daysFromNow(7),
    notes: "Sanitiser is below reorder level — filling hall cleans coming up.",
  });
  await db.insert(purchaseOrderItems).values({
    id: newId("poi"),
    purchaseOrderId: poId,
    itemId: itemIds["CHM-002"],
    quantity: 60,
    unitCost: 22_000,
  });

  /* ------------------------------- equipment ----------------------------- */

  const equipmentSeeds = [
    { name: "Mixing Unit MU-01", type: "mixing_unit" as const, siteIndex: 0 },
    { name: "Mixing Unit MU-02", type: "mixing_unit" as const, siteIndex: 2 },
    { name: "Motorised Sprayer SP-01", type: "sprayer" as const, siteIndex: null },
    { name: "Motorised Sprayer SP-02", type: "sprayer" as const, siteIndex: null },
    { name: "Effluent pH Meter PM-01", type: "meter" as const, siteIndex: 2 },
  ];

  for (const [index, piece] of equipmentSeeds.entries()) {
    const id = newId("eqp");
    const lastMaintenance = new Date(Date.now() - (20 + index * 9) * DAY);
    await db.insert(equipment).values({
      id,
      name: piece.name,
      type: piece.type,
      serialNumber: `EH-${2024}-${String(index + 1).padStart(3, "0")}`,
      currentSiteId: piece.siteIndex === null ? null : siteIds[piece.siteIndex].id,
      status: piece.siteIndex === null ? "available" : "deployed",
      lastMaintenanceAt: lastMaintenance,
      nextMaintenanceAt: new Date(lastMaintenance.getTime() + 90 * DAY),
      qrCode: `ecohygiene:equipment:${id}`,
    });
    await db.insert(equipmentMaintenance).values({
      id: newId("mnt"),
      equipmentId: id,
      performedAt: lastMaintenance,
      performedBy: staffIds["stores@ecohygiene.co.tz"],
      description: "Routine service: seals replaced, calibration verified.",
      cost: 45_000,
    });
  }

  /* --------------------------------- jobs -------------------------------- */

  console.log("Seeding jobs, certificates and incidents…");

  // Recurring templates for the two flagship contracts.
  for (const site of siteIds.slice(0, 3)) {
    await db.insert(recurringJobTemplates).values({
      id: newId("rec"),
      siteId: site.id,
      serviceTypeId: serviceSeeds[0].id,
      intervalDays: 14,
      timeOfDay: "08:00",
      assignedCrewJson: [technicians[0], technicians[1]],
      nextRunAt: daysFromNow(3),
    });
  }

  const photoUrls = [
    "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&q=60",
    "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=60",
  ];

  let jobCounter = 0;

  // Six months of history: each site gets a visit roughly every 12 days.
  for (const site of siteIds) {
    for (let offset = -170; offset <= 21; offset += 12) {
      const service = pick(serviceSeeds);
      const scheduledAt = daysFromNow(offset, 8 + Math.floor(random() * 6), 0);
      const isPast = offset < 0;
      const status: JobStatus = isPast
        ? random() > 0.25
          ? "signed_off"
          : "completed"
        : offset === 21
          ? "scheduled"
          : random() > 0.5
            ? "scheduled"
            : "scheduled";

      const jobId = newId("job");
      const crew = [pick(technicians), pick(technicians)].filter(
        (id, index, all) => all.indexOf(id) === index,
      );
      const completedAt = isPast ? new Date(scheduledAt.getTime() + service.defaultDurationMinutes * 60_000) : null;

      await db.insert(jobs).values({
        id: jobId,
        reference: `JOB-${String(++jobCounter).padStart(4, "0")}`,
        siteId: site.id,
        clientId: site.clientId,
        serviceTypeId: service.id,
        assignedCrewJson: crew,
        supervisorId: staffIds["supervisor@ecohygiene.co.tz"],
        scheduledAt,
        durationMinutes: service.defaultDurationMinutes,
        status,
        startedAt: isPast ? scheduledAt : null,
        completedAt,
        checklistJson: service.checklist.map((label, index) => ({
          id: `c${index + 1}`,
          label,
          done: isPast,
        })),
        reportSummary: isPast
          ? pick([
              "All bait stations serviced. Low activity in the raw store; two stations replenished.",
              "Deep clean completed to specification. ATP swabs within limits after rinse.",
              "Treatment applied as scheduled. Recommend sealing the loading-bay door sweep.",
              "Effluent readings within NEMC limits. Flocculant dosing adjusted slightly upward.",
            ])
          : null,
        signedOffBy: status === "signed_off" ? pick(["J. Mwanri", "A. Shirima", "QA Officer"]) : null,
        signedOffAt: status === "signed_off" && completedAt ? new Date(completedAt.getTime() + 3_600_000) : null,
        createdBy: staffIds["ops@ecohygiene.co.tz"],
      });

      if (isPast) {
        // Evidence photos on roughly half the completed jobs.
        if (random() > 0.5) {
          await db.insert(jobPhotos).values({
            id: newId("pho"),
            jobId,
            url: pick(photoUrls),
            caption: pick(["Before treatment", "After treatment", "Bait station 04", "Drain line"]),
            uploadedBy: crew[0],
            uploadedAt: completedAt ?? scheduledAt,
          });
        }

        // Chemical consumption, deducted from stock through the ledger.
        const chemical = pick(["CHM-001", "CHM-002", "CHM-004", "CHM-005"]);
        const used = Math.round((1 + random() * 4) * 10) / 10;
        await db.insert(inventoryMovements).values({
          id: newId("mov"),
          itemId: itemIds[chemical],
          jobId,
          siteId: site.id,
          quantityDelta: -used,
          reason: "job_usage",
          performedBy: crew[0],
          createdAt: completedAt ?? scheduledAt,
        });

        // Certificate for certifying services.
        if (service.issuesCertificate && service.certificateType && completedAt) {
          await db.insert(certificates).values({
            id: newId("cert"),
            reference: newReference("CERT"),
            clientId: site.clientId,
            siteId: site.id,
            jobId,
            type: service.certificateType,
            issuedAt: completedAt,
            expiresAt: new Date(completedAt.getTime() + (service.certificateValidityDays ?? 90) * DAY),
            issuedBy: staffIds["supervisor@ecohygiene.co.tz"],
            authority: service.certificateType === "wastewater_discharge" ? "NEMC" : "TBS",
            pdfUrl: null,
          });
        }
      }
    }
  }

  /* ------------------------------- incidents ----------------------------- */

  const incidentSeeds = [
    {
      title: "Rodent droppings in raw material store",
      description: "Cleaner reported droppings behind pallet racking during morning inspection.",
      severity: "high" as const,
      status: "investigating" as const,
    },
    {
      title: "Mixing unit dosing below specification",
      description: "MU-02 dosing 15% under target. Sanitiser concentration reading low at line 3.",
      severity: "medium" as const,
      status: "open" as const,
    },
    {
      title: "Effluent pH spike after shift change",
      description: "pH read 9.4 at 14:00, above the discharge limit. Dosing corrected on site.",
      severity: "critical" as const,
      status: "resolved" as const,
      resolution: "Caustic dosing valve reset and interlock added. Readings normal for 5 consecutive days.",
    },
    {
      title: "Missed bait station on north perimeter",
      description: "Station 14 not serviced on the last visit — logged by the client QA officer.",
      severity: "low" as const,
      status: "resolved" as const,
      resolution: "Station serviced the following day and added to the standing route sheet.",
    },
  ];

  for (const [index, seed] of incidentSeeds.entries()) {
    const site = siteIds[index % siteIds.length];
    const createdAt = new Date(Date.now() - (5 + index * 9) * DAY);
    await db.insert(incidents).values({
      id: newId("inc"),
      reference: newReference("INC"),
      clientId: site.clientId,
      siteId: site.id,
      reportedBy: pick(technicians),
      title: seed.title,
      description: seed.description,
      severity: seed.severity,
      status: seed.status,
      assignedTo: staffIds["supervisor@ecohygiene.co.tz"],
      resolvedAt: seed.status === "resolved" ? new Date(createdAt.getTime() + 3 * DAY) : null,
      resolutionNotes: seed.resolution ?? null,
      createdAt,
    });
  }

  await db.insert(serviceRequests).values({
    id: newId("sreq"),
    clientId: siteIds[0].clientId,
    siteId: siteIds[0].id,
    serviceTypeId: serviceSeeds[0].id,
    description: "Ants spotted near the syrup room — can someone come before Friday's audit?",
    urgency: "urgent",
    status: "pending",
    preferredDate: daysFromNow(3),
    createdAt: new Date(Date.now() - 2 * DAY),
  });

  /* -------------------------------- invoices ----------------------------- */

  console.log("Seeding invoices…");
  let invoiceCounter = 0;

  for (const clientSeed of clientSeeds) {
    const clientJobs = await db.query.jobs.findMany({
      where: (job, { eq, inArray, and }) =>
        and(eq(job.clientId, clientSeed.id), inArray(job.status, ["completed", "signed_off"])),
    });

    // Bill history in monthly batches so the revenue chart has a shape.
    const byMonth = new Map<string, typeof clientJobs>();
    for (const job of clientJobs) {
      if (!job.completedAt) continue;
      const key = `${job.completedAt.getFullYear()}-${job.completedAt.getMonth()}`;
      byMonth.set(key, [...(byMonth.get(key) ?? []), job]);
    }

    for (const [key, monthJobs] of byMonth) {
      const [year, month] = key.split("-").map(Number);
      const issuedAt = new Date(year, month + 1, 1);
      if (issuedAt.getTime() > Date.now()) continue;

      const invoiceId = newId("inv");
      const dueDate = new Date(issuedAt.getTime() + clientSeed.paymentTermsDays * DAY);
      const overdue = dueDate.getTime() < Date.now();
      const settled = overdue && random() > 0.35;

      let total = 0;
      for (const job of monthJobs) {
        const service = serviceSeeds.find((s) => s.id === job.serviceTypeId);
        total += service?.defaultRate ?? 0;
      }
      if (total === 0) continue;

      await db.insert(invoices).values({
        id: invoiceId,
        number: `INV-${year}-${String(++invoiceCounter).padStart(4, "0")}`,
        clientId: clientSeed.id,
        amount: total,
        status: settled ? "paid" : overdue ? "overdue" : "issued",
        issuedAt,
        dueDate,
        paidAt: settled ? new Date(dueDate.getTime() - 2 * DAY) : null,
      });

      for (const job of monthJobs) {
        const service = serviceSeeds.find((s) => s.id === job.serviceTypeId);
        const site = siteIds.find((s) => s.id === job.siteId);
        await db.insert(invoiceLineItems).values({
          id: newId("ili"),
          invoiceId,
          jobId: job.id,
          description: `${service?.name ?? "Service"} — ${site?.name ?? "Site"} (${job.reference})`,
          quantity: 1,
          unitAmount: service?.defaultRate ?? 0,
          amount: service?.defaultRate ?? 0,
        });
        await db.update(jobs).set({ billedInvoiceId: invoiceId }).where(eq(jobs.id, job.id));
      }

      if (settled) {
        await db.insert(payments).values({
          id: newId("pay"),
          invoiceId,
          amount: total,
          method: pick(["bank_transfer", "mobile_money", "cheque"] as const),
          reference: `TXN${Math.floor(random() * 900000 + 100000)}`,
          receivedAt: new Date(dueDate.getTime() - 2 * DAY),
          recordedBy: staffIds["finance@ecohygiene.co.tz"],
        });
      }
    }
  }

  /* -------------------------------- payroll ------------------------------ */

  console.log("Seeding employees and payroll…");
  const { calculatePayslip, DEFAULT_RATES } = await import("../src/lib/payroll/calculate");

  // Mirrors the July 2026 payroll sheet the company already runs.
  const staffSeed = [
    { no: "1", name: "Triphonia Dindili", designation: "Site Manager", basic: 350_000, transport: 65_000, bank: "Equity Bank" },
    { no: "2", name: "David Lema", designation: "Technician", basic: 450_000, transport: 175_000, bank: "Equity Bank" },
    { no: "3", name: "Vaileth Mkumbo", designation: "Technician", basic: 300_000, transport: 65_000, bank: "Equity Bank" },
  ];

  const employeeIds: { id: string; seed: (typeof staffSeed)[number] }[] = [];
  for (const [index, person] of staffSeed.entries()) {
    const id = newId("emp");
    employeeIds.push({ id, seed: person });
    await db.insert(employees).values({
      id,
      employeeNo: person.no,
      name: person.name,
      designation: person.designation,
      employmentMode: "specified",
      nssfNumber: `NSSF-${900000 + index}`,
      bankName: person.bank,
      bankAccountNo: `30012345678${index}`,
      phone: `+2557550002${String(index).padStart(2, "0")}`,
      basicSalary: person.basic,
      untaxableAllowance: person.transport,
      monthlyHours: 195,
    });
  }

  // One finalised run for last month, so payslips and PDFs are there to look at.
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  const runId = newId("run");
  let runGross = 0, runDeductions = 0, runNet = 0, runEmployer = 0;

  await db.insert(payrollRuns).values({
    id: runId,
    reference: newReference("PAY"),
    period,
    label: `Payroll: ${period}`,
    status: "finalised",
    ratesJson: DEFAULT_RATES,
    createdBy: staffIds["finance@ecohygiene.co.tz"],
    finalisedAt: new Date(),
  });

  for (const { id: employeeId, seed: person } of employeeIds) {
    const result = calculatePayslip(
      { basicSalary: person.basic, untaxableAllowance: person.transport, monthlyHours: 195 },
      DEFAULT_RATES,
    );
    runGross += result.grossEarnings;
    runDeductions += result.totalDeductions;
    runNet += result.totalEarning;
    runEmployer += result.employerTotalCost;

    await db.insert(payslips).values({
      id: newId("slip"),
      payrollRunId: runId,
      employeeId,
      employeeNo: person.no,
      employeeName: person.name,
      designation: person.designation,
      employmentMode: "specified",
      bankName: person.bank,
      basicSalary: person.basic,
      ...result,
    });
  }

  await db.update(payrollRuns).set({
    totalGross: runGross,
    totalDeductions: runDeductions,
    totalNetPay: runNet,
    totalEmployerCost: runEmployer,
    employeeCount: employeeIds.length,
  }).where(eq(payrollRuns.id, runId));

  await db.insert(auditLog).values({
    id: newId("aud"),
    userId: staffIds["allen@ecohygiene.co.tz"],
    action: "system.seed",
    entityType: "system",
    entityId: null,
    metadataJson: { note: "Demo dataset generated" },
  });

  console.log("\nSeed complete.\n");
  console.log("Sign in with any of these (password: %s)", DEMO_PASSWORD);
  for (const staff of staffSeeds) console.log(`  ${staff.role.padEnd(20)} ${staff.email}`);
  for (const client of clientSeeds) {
    console.log(`  client_admin         admin@${client.slug}.example`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
