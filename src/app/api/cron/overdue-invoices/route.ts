import { NextResponse } from "next/server";

import { markOverdueInvoices } from "@/lib/data/finance";
import { SYSTEM_SCOPE } from "@/lib/data/scope";

export const dynamic = "force-dynamic";

/** Daily sweep that flips past-due invoices to `overdue`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markOverdueInvoices(SYSTEM_SCOPE);
  return NextResponse.json({ ok: true });
}
