import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, jobs, notifications, serviceTypes, sites, users } from "@db/schema";
import { newId } from "@/lib/ids";
import { formatDateTime } from "@/lib/format";

/**
 * Outbound SMS/email goes through an outbox table first: the row is written
 * synchronously, delivery is attempted after. That way a failed Africa's
 * Talking call never loses the reminder and the ops team can see what was
 * sent, to whom, and when.
 */
export async function queueNotification(input: {
  channel: "sms" | "email";
  recipient: string;
  body: string;
  template: string;
  userId?: string | null;
  relatedJobId?: string | null;
}): Promise<string> {
  const id = newId("ntf");
  await db.insert(notifications).values({
    id,
    channel: input.channel,
    recipient: input.recipient,
    body: input.body,
    template: input.template,
    userId: input.userId ?? null,
    relatedJobId: input.relatedJobId ?? null,
  });
  return id;
}

/** Sends every queued message. Intended to run from a cron route. */
export async function flushNotificationQueue(): Promise<{ sent: number; failed: number }> {
  const queued = await db.select().from(notifications).where(eq(notifications.status, "queued"));
  let sent = 0;
  let failed = 0;

  for (const message of queued) {
    try {
      if (message.channel === "sms") await sendSms(message.recipient, message.body);
      else await sendEmail(message.recipient, message.body);
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notifications.id, message.id));
      sent++;
    } catch (error) {
      await db
        .update(notifications)
        .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
        .where(eq(notifications.id, message.id));
      failed++;
    }
  }

  return { sent, failed };
}

async function sendSms(to: string, body: string): Promise<void> {
  if (process.env.NOTIFICATIONS_ENABLED !== "true") return; // dry run in dev

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!username || !apiKey) throw new Error("Africa's Talking credentials are not configured");

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      username,
      to,
      message: body,
      ...(process.env.AFRICASTALKING_SENDER_ID
        ? { from: process.env.AFRICASTALKING_SENDER_ID }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Africa's Talking responded ${response.status}: ${await response.text()}`);
  }
}

async function sendEmail(to: string, body: string): Promise<void> {
  if (process.env.NOTIFICATIONS_ENABLED !== "true") return;
  // Wire up your transactional provider here (Resend, SES, Postmark…).
  throw new Error(`No email transport configured (would have mailed ${to}: ${body.slice(0, 40)}…)`);
}

/**
 * Queues reminders for every job scheduled in the next `hoursAhead` window:
 * one per assigned crew member plus the site contact.
 */
export async function queueJobReminders(hoursAhead = 24): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const upcoming = await db
    .select({
      id: jobs.id,
      reference: jobs.reference,
      scheduledAt: jobs.scheduledAt,
      crew: jobs.assignedCrewJson,
      siteName: sites.name,
      siteContactPhone: sites.contactPhone,
      clientName: clients.name,
      serviceName: serviceTypes.name,
    })
    .from(jobs)
    .innerJoin(sites, eq(jobs.siteId, sites.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(
      and(
        eq(jobs.status, "scheduled"),
        gte(jobs.scheduledAt, now),
        lte(jobs.scheduledAt, horizon),
      ),
    );

  let queued = 0;

  for (const job of upcoming) {
    const crewIds = job.crew ?? [];
    if (crewIds.length > 0) {
      const crew = await db
        .select({ id: users.id, name: users.name, phone: users.phone, notify: users.notifyBySms })
        .from(users)
        .where(inArray(users.id, crewIds));

      for (const member of crew) {
        if (!member.phone || !member.notify) continue;
        await queueNotification({
          channel: "sms",
          recipient: member.phone,
          userId: member.id,
          relatedJobId: job.id,
          template: "job_reminder_crew",
          body: `Ecohygiene: ${job.reference} ${job.serviceName} at ${job.clientName} — ${job.siteName}, ${formatDateTime(job.scheduledAt)}.`,
        });
        queued++;
      }
    }

    if (job.siteContactPhone) {
      await queueNotification({
        channel: "sms",
        recipient: job.siteContactPhone,
        relatedJobId: job.id,
        template: "job_reminder_client",
        body: `Ecohygiene will carry out ${job.serviceName} at ${job.siteName} on ${formatDateTime(job.scheduledAt)}. Ref ${job.reference}.`,
      });
      queued++;
    }
  }

  return queued;
}
