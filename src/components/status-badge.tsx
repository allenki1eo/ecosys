import { Badge } from "@/components/ui/badge";
import type {
  ClientStatus,
  IncidentStatus,
  InvoiceStatus,
  JobStatus,
  PurchaseOrderStatus,
} from "@db/schema";

type Variant = React.ComponentProps<typeof Badge>["variant"];

const JOB: Record<JobStatus, { label: string; variant: Variant }> = {
  scheduled: { label: "Scheduled", variant: "muted" },
  en_route: { label: "En route", variant: "info" },
  in_progress: { label: "In progress", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  signed_off: { label: "Signed off", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const INVOICE: Record<InvoiceStatus, { label: string; variant: Variant }> = {
  draft: { label: "Draft", variant: "muted" },
  issued: { label: "Issued", variant: "info" },
  part_paid: { label: "Part paid", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  overdue: { label: "Overdue", variant: "destructive" },
  void: { label: "Void", variant: "muted" },
};

const INCIDENT: Record<IncidentStatus, { label: string; variant: Variant }> = {
  open: { label: "Open", variant: "destructive" },
  investigating: { label: "Investigating", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "muted" },
};

const CLIENT: Record<ClientStatus, { label: string; variant: Variant }> = {
  prospect: { label: "Prospect", variant: "info" },
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "warning" },
  churned: { label: "Churned", variant: "muted" },
};

const PURCHASE_ORDER: Record<PurchaseOrderStatus, { label: string; variant: Variant }> = {
  requested: { label: "Awaiting approval", variant: "warning" },
  approved: { label: "Approved", variant: "info" },
  rejected: { label: "Rejected", variant: "destructive" },
  ordered: { label: "Ordered", variant: "info" },
  received: { label: "Received", variant: "success" },
};

const SEVERITY = {
  low: { label: "Low", variant: "muted" as Variant },
  medium: { label: "Medium", variant: "info" as Variant },
  high: { label: "High", variant: "warning" as Variant },
  critical: { label: "Critical", variant: "destructive" as Variant },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, variant } = JOB[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, variant } = INVOICE[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { label, variant } = INCIDENT[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const { label, variant } = CLIENT[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const { label, variant } = PURCHASE_ORDER[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY }) {
  const { label, variant } = SEVERITY[severity];
  return <Badge variant={variant}>{label}</Badge>;
}
