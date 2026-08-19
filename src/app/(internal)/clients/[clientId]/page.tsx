import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";

import { NewSiteSheet } from "../client-forms";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  ClientStatusBadge,
  IncidentStatusBadge,
  InvoiceStatusBadge,
  JobStatusBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getClient, listSites } from "@/lib/data/clients";
import { listCertificates, listIncidents } from "@/lib/data/compliance";
import { listInvoices } from "@/lib/data/finance";
import { listJobs } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";
import { CERTIFICATE_LABELS } from "@/lib/data/compliance";
import { formatCompactCurrency, formatDate, formatSchedule } from "@/lib/format";

export default async function ClientDetailPage({ params }: { params: { clientId: string } }) {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const client = await getClient(scope, params.clientId);
  if (!client) notFound();

  const [sites, jobs, certificates, incidents, invoices] = await Promise.all([
    listSites(scope, client.id),
    listJobs(scope, { clientId: client.id, limit: 50 }),
    listCertificates(scope, client.id),
    listIncidents(scope),
    user.permissions.has("invoices.view") ? listInvoices(scope, client.id) : [],
  ]);

  const clientIncidents = incidents.filter((incident) => incident.clientId === client.id);
  const outstanding = invoices
    .filter((invoice) => ["issued", "part_paid", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/clients">
          <ArrowLeft /> All clients
        </Link>
      </Button>

      <PageHeader
        title={client.name}
        description={`${client.industry ?? "Industry not set"} · contract ${formatDate(client.contractStart)} – ${formatDate(client.contractEnd)}`}
        actions={
          <div className="flex items-center gap-2">
            <ClientStatusBadge status={client.status} />
            {user.permissions.has("clients.manage") ? <NewSiteSheet clientId={client.id} /> : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sites" value={sites.length} caption="Active service locations" />
        <StatCard
          label="Jobs (recent)"
          value={jobs.length}
          caption="Scheduled and historic visits"
        />
        <StatCard
          label="Certificates"
          value={certificates.length}
          caption="Issued compliance documents"
        />
        {user.permissions.has("invoices.view") ? (
          <StatCard
            label="Outstanding"
            value={formatCompactCurrency(outstanding)}
            caption={`${client.paymentTermsDays}-day terms`}
            tone={outstanding > 0 ? "warning" : "neutral"}
          />
        ) : null}
      </section>

      <Tabs defaultValue="sites">
        <TabsList>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="jobs">Service history</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          {user.permissions.has("invoices.view") ? (
            <TabsTrigger value="finance">Finance</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="sites">
          {sites.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No sites yet"
              description="Add the client's factories or premises so jobs can be scheduled against them."
              action={
                user.permissions.has("clients.manage") ? <NewSiteSheet clientId={client.id} /> : undefined
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Coordinates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell>
                        <Link href={`/clients/sites/${site.id}`} className="hover:underline">
                          {site.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {site.address ?? "No address"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{site.region ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {site.contactName ?? "—"}
                        {site.contactPhone ? (
                          <span className="block text-xs">{site.contactPhone}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-data text-muted-foreground">
                        {site.gpsLat && site.gpsLng
                          ? `${site.gpsLat.toFixed(4)}, ${site.gpsLng.toFixed(4)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          {jobs.length === 0 ? (
            <EmptyState title="No jobs recorded" description="Scheduled work will appear here." />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Link href={`/jobs/${job.id}`} className="font-data hover:underline">
                          {job.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatSchedule(job.scheduledAt)}
                      </TableCell>
                      <TableCell>{job.siteName}</TableCell>
                      <TableCell className="text-muted-foreground">{job.serviceTypeName}</TableCell>
                      <TableCell>
                        <JobStatusBadge status={job.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="compliance">
          {certificates.length === 0 ? (
            <EmptyState
              title="No certificates issued"
              description="Certificates are generated automatically when a certifying service completes."
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((certificate) => (
                    <TableRow key={certificate.id}>
                      <TableCell className="font-data">{certificate.reference}</TableCell>
                      <TableCell>{CERTIFICATE_LABELS[certificate.type]}</TableCell>
                      <TableCell className="text-muted-foreground">{certificate.siteName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(certificate.issuedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(certificate.expiresAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="incidents">
          {clientIncidents.length === 0 ? (
            <EmptyState title="No incidents" description="Nothing has been raised at these sites." />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientIncidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell className="font-data">{incident.reference}</TableCell>
                      <TableCell>{incident.title}</TableCell>
                      <TableCell className="text-muted-foreground">{incident.siteName}</TableCell>
                      <TableCell>
                        <IncidentStatusBadge status={incident.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {user.permissions.has("invoices.view") ? (
          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <EmptyState
                    className="m-4 border-0"
                    title="No invoices"
                    description="Generate one from completed jobs on the Finance page."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Link href={`/finance/${invoice.id}`} className="font-data hover:underline">
                              {invoice.number}
                            </Link>
                          </TableCell>
                          <TableCell className="font-data">
                            {formatCompactCurrency(invoice.amount)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(invoice.dueDate)}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={invoice.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      {client.specNotes ? (
        <Card>
          <CardHeader>
            <CardTitle>Client spec notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{client.specNotes}</CardContent>
        </Card>
      ) : null}
    </>
  );
}
