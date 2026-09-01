import { Download, FileCheck2, FileWarning } from "lucide-react";

import { IssueCertificateDialog } from "./certificate-form";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { CERTIFICATE_LABELS, expiringCertificates, listCertificates } from "@/lib/data/compliance";
import { listSites } from "@/lib/data/clients";
import { scopeFor } from "@/lib/data/scope";
import { daysUntil, formatDate } from "@/lib/format";

export const metadata = { title: "Compliance" };

export default async function CompliancePage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const canIssue = user.permissions.has("certificates.issue");
  const [certificates, expiring, sites] = await Promise.all([
    listCertificates(scope),
    expiringCertificates(scope, 30),
    canIssue ? listSites(scope) : Promise.resolve([]),
  ]);

  const valid = certificates.filter(
    (certificate) => certificate.expiresAt.getTime() > Date.now(),
  ).length;

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Certificates issued from completed services, ready for TBS, TFDA and NEMC inspections."
        actions={
          <div className="flex flex-wrap gap-2">
            {canIssue ? <IssueCertificateDialog sites={sites} /> : null}
            {user.permissions.has("reports.export") ? (
              <Button size="sm" variant="outline" disabled title="Bundled PDF export — Phase 2">
                Export audit bundle
              </Button>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Certificates issued" value={certificates.length} icon={FileCheck2} />
        <StatCard label="Currently valid" value={valid} tone="positive" />
        <StatCard
          label="Expiring in 30 days"
          value={expiring.length}
          icon={FileWarning}
          tone={expiring.length ? "warning" : "neutral"}
        />
      </section>

      {expiring.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Renewal queue</CardTitle>
            <p className="text-xs text-muted-foreground">
              Schedule the follow-up service before these lapse.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client / site</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.map((certificate) => (
                  <TableRow key={certificate.id}>
                    <TableCell className="font-data">{certificate.reference}</TableCell>
                    <TableCell>{CERTIFICATE_LABELS[certificate.type]}</TableCell>
                    <TableCell>
                      {certificate.clientName}
                      <span className="block text-xs text-muted-foreground">
                        {certificate.siteName}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatDate(certificate.expiresAt)}
                      <Badge variant="warning" className="ml-2">
                        {daysUntil(certificate.expiresAt)}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {certificates.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No certificates yet"
          description="Certificates are issued automatically when a certifying service — pest control, fumigation or wastewater — is completed."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((certificate) => {
                const remaining = daysUntil(certificate.expiresAt);
                return (
                  <TableRow key={certificate.id}>
                    <TableCell className="font-data">{certificate.reference}</TableCell>
                    <TableCell>{CERTIFICATE_LABELS[certificate.type]}</TableCell>
                    <TableCell>{certificate.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{certificate.siteName}</TableCell>
                    <TableCell className="font-data text-muted-foreground">
                      {certificate.jobReference ?? "—"}
                    </TableCell>
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
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/api/documents/certificate/${certificate.id}`}
                        className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="size-3.5" /> PDF
                      </a>
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
