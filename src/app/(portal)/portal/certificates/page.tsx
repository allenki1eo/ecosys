import { Download, FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((certificate) => {
                const remaining = daysUntil(certificate.expiresAt);
                return (
                  <TableRow key={certificate.id}>
                    <TableCell className="font-data">{certificate.reference}</TableCell>
                    <TableCell>{CERTIFICATE_LABELS[certificate.type]}</TableCell>
                    <TableCell className="text-muted-foreground">{certificate.siteName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(certificate.issuedAt)}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {formatDate(certificate.expiresAt)}
                      </span>
                      {remaining !== null && remaining < 0 ? (
                        <Badge variant="destructive" className="ml-2">
                          Expired
                        </Badge>
                      ) : remaining !== null && remaining <= 30 ? (
                        <Badge variant="warning" className="ml-2">
                          {remaining}d
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {certificate.pdfUrl && canDownload ? (
                        <a
                          href={certificate.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
                        >
                          <Download className="size-3.5" /> PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {canDownload ? "Being prepared" : "Ask your admin"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
