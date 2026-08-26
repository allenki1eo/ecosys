import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Documents are rendered on demand rather than written to object storage. There
 * is no stale copy to invalidate when an invoice is part-paid or a certificate
 * is reissued, and no bucket to configure before the feature works.
 */
export async function pdfResponse(
  document: ReactElement<DocumentProps>,
  filename: string,
  disposition: "inline" | "attachment" = "inline",
): Promise<Response> {
  const buffer = await renderToBuffer(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // Quoted so filenames containing spaces survive the round trip.
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": String(buffer.length),
      // These contain salary and billing data: never let a shared cache hold one.
      "Cache-Control": "private, no-store",
    },
  });
}

/** Filesystem-safe filename fragment. */
export function slugForFile(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
