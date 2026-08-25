import { Download, FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireClientUser } from "@/lib/auth/guards";
import { CERTIFICATE_LABELS, expiringCertificates, listCertificates } from "@/lib/data/compliance";
import { scopeFor } from "@/lib/data/scope";
import { daysUntil, formatDate } from "@/lib/format";

export const metadata = { title: "Certificates" };

export default async function PortalCertificatesPage() {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [certificates, expiring] = await Promise.all([
    listCertificates(scope),
    expiringCertificates(scope, 30),
  ]);

  const valid = certificates.filter((c) => c.expiresAt.getTime() > Date.now()).length;
  const canDownload = user.permissions.has("portal.approve_report");

  return (
    <>
      <PageHeader
        title="Compliance certificates"
        description="Pest control, fumigation and wastewater documents for your inspections."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total issued" value={certificates.length} icon={FileCheck2} />
        <StatCard label="Currently valid" value={valid} tone="positive" />
        <StatCard
          label="Expiring in 30 days"
          value={expiring.length}
          tone={expiring.length ? "warning" : "neutral"}
        />
      </section>

      {certificates.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No certificates yet"
          description="Certificates are issued when a certifying service is completed at one of your sites."
        />
      ) : (
        <DataList
          rows={certificates}
          rowKey={(certificate) => certificate.id}
          columns={[
            {
              key: "type",
              header: "Type",
              role: "primary",
              cell: (certificate) => CERTIFICATE_LABELS[certificate.type],
            },
            {
              key: "site",
              header: "Site",
              role: "secondary",
              className: "text-muted-foreground",
              cell: (certificate) => certificate.siteName,
            },
            {
              key: "expiry-badge",
              header: "Expires in",
              role: "trailing",
              cell: (certificate) => {
                const remaining = daysUntil(certificate.expiresAt);
                if (remaining === null) return null;
                if (remaining < 0) return <Badge variant="destructive">Expired</Badge>;
                if (remaining <= 30) return <Badge variant="warning">{remaining}d</Badge>;
                return <Badge variant="success">Valid</Badge>;
              },
            },
            {
              key: "reference",
              header: "Reference",
              className: "font-data",
              cell: (certificate) => certificate.reference,
            },
            {
              key: "issued",
              header: "Issued",
              className: "text-muted-foreground",
              cell: (certificate) => formatDate(certificate.issuedAt),
            },
            {
              key: "expires",
              header: "Expires",
              className: "text-muted-foreground",
              cell: (certificate) => formatDate(certificate.expiresAt),
            },
            {
              key: "document",
              header: "Document",
              cell: (certificate) =>
                canDownload ? (
                  <a
                    href={`/api/documents/certificate/${certificate.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
                  >
                    <Download className="size-3.5" /> PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Ask your admin</span>
                ),
            },
          ]}
        />
      )}
    </>
  );
}
