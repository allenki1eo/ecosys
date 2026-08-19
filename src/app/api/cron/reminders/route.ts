import { NextResponse } from "next/server";

import { flushNotificationQueue, queueJobReminders } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron target — schedule hourly. Queues reminders for jobs in the next
 * 24 hours and flushes the outbox.
 *
 * Protected by CRON_SECRET: Vercel sends it as `Authorization: Bearer …`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queued = await queueJobReminders(24);
  const delivery = await flushNotificationQueue();

  return NextResponse.json({ queued, ...delivery });
}
