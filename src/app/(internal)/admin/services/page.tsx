import { Clock, FileCheck2, ListChecks, Repeat, Sparkles } from "lucide-react";

import { ServiceFormSheet } from "./service-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listServiceCatalogue } from "@/lib/data/services";
import { scopeFor } from "@/lib/data/scope";
import { formatCurrency, formatNumber } from "@/lib/format";
import { CERTIFICATE_LABELS } from "@/lib/data/compliance";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const user = await requireStaff();
  const services = await listServiceCatalogue(scopeFor(user));
  const canManage = user.permissions.has("settings.manage");

  return (
    <>
      <PageHeader
        title="Services"
        description="What Ecohygiene sells: each one carries its own checklist, duration, rate and certificate rules."
        actions={canManage ? <ServiceFormSheet /> : null}
      />

      {services.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No services defined"
          description="Add your first service — pest control, fumigation, factory cleaning — so jobs can be scheduled against it."
          action={canManage ? <ServiceFormSheet /> : undefined}
        />
      ) : (
        // Cards rather than a table: each service carries a checklist, so rows
        // would be unreadable and would never fit a phone.
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const checklist = service.checklistTemplateJson ?? [];
            return (
              <Card key={service.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium">{service.name}</h2>
                      <p className="font-data text-xs text-muted-foreground">{service.slug}</p>
                    </div>
                    {canManage ? (
                      <ServiceFormSheet
                        service={{
                          id: service.id,
                          name: service.name,
                          slug: service.slug,
                          description: service.description,
                          defaultFrequency: service.defaultFrequency,
                          defaultDurationMinutes: service.defaultDurationMinutes,
                          defaultRate: service.defaultRate,
                          issuesCertificate: service.issuesCertificate,
                          certificateType: service.certificateType,
                          certificateValidityDays: service.certificateValidityDays,
                          checklist: checklist.map((item) => item.label),
                        }}
                      />
                    ) : null}
                  </div>

                  {service.description ? (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  ) : null}

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Fact
                      icon={Repeat}
                      label="Cadence"
                      value={service.defaultFrequency ?? "Ad-hoc"}
                    />
                    <Fact
                      icon={Clock}
                      label="Duration"
                      value={`${formatNumber(service.defaultDurationMinutes)} min`}
                    />
                    <Fact label="Rate" value={formatCurrency(service.defaultRate)} />
                    <Fact
                      icon={ListChecks}
                      label="Checklist"
                      value={`${checklist.length} step${checklist.length === 1 ? "" : "s"}`}
                    />
                  </dl>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {service.issuesCertificate && service.certificateType ? (
                      <Badge variant="success">
                        <FileCheck2 className="size-3" />
                        {CERTIFICATE_LABELS[service.certificateType]} ·{" "}
                        {service.certificateValidityDays}d
                      </Badge>
                    ) : (
                      <Badge variant="muted">No certificate</Badge>
                    )}
                    {service.activeSchedules > 0 ? (
                      <Badge variant="info">{service.activeSchedules} recurring</Badge>
                    ) : null}
                    <Badge variant="muted">{formatNumber(service.jobCount)} jobs</Badge>
                  </div>

                  {checklist.length > 0 ? (
                    <details className="mt-auto rounded-md border">
                      <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                        Checklist crews follow
                      </summary>
                      <ol className="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
                        {checklist.map((item, index) => (
                          <li key={item.id} className="flex gap-2">
                            <span className="font-data shrink-0">{index + 1}.</span>
                            <span>{item.label}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </dt>
      <dd className="truncate font-data">{value}</dd>
    </div>
  );
}
