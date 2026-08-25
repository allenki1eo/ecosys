import { NextResponse } from "next/server";

import { CertificateDocument } from "@/lib/pdf/certificate";
import { pdfResponse, slugForFile } from "@/lib/pdf/render";
import { getCurrentUser } from "@/lib/auth/session";
import { getCertificate } from "@/lib/data/compliance";
import { scopeFor } from "@/lib/data/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compliance certificate PDF — tenant-scoped, so clients get only their own. */
export async function GET(
  _request: Request,
  { params }: { params: { certificateId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.has("certificates.view") && !user.permissions.has("portal.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const certificate = await getCertificate(scopeFor(user), params.certificateId);
  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return pdfResponse(
    CertificateDocument({
      certificate: {
        reference: certificate.reference,
        type: certificate.type,
        clientName: certificate.clientName,
        siteName: certificate.siteName,
        siteAddress: certificate.siteAddress,
        jobReference: certificate.jobReference,
        serviceName: certificate.serviceName,
        issuedAt: certificate.issuedAt,
        expiresAt: certificate.expiresAt,
        authority: certificate.authority,
        issuedByName: certificate.issuedByName,
        treatmentSummary: certificate.reportSummary,
      },
    }),
    `${slugForFile(certificate.reference)}.pdf`,
  );
}
