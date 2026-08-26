import { Document, Page, Text, View } from "@react-pdf/renderer";

import { BRAND, COMPANY, money, pdfDate, styles } from "./theme";

export type InvoicePdfData = {
  number: string;
  clientName: string;
  billingContact: string | null;
  billingEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  issuedAt: Date | null;
  dueDate: Date | null;
  notes: string | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitAmount: number;
    amount: number;
    jobReference: string | null;
  }[];
  payments: { id: string; amount: number; method: string; receivedAt: Date; reference: string | null }[];
};

export function InvoiceDocument({ invoice }: { invoice: InvoicePdfData }) {
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(invoice.amount - paid, 0);
  const overdue =
    balance > 0 && invoice.dueDate !== null && invoice.dueDate.getTime() < Date.now();

  return (
    <Document title={`Invoice ${invoice.number}`} author={COMPANY.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{COMPANY.name}</Text>
            <Text style={styles.companyMeta}>{COMPANY.tagline}</Text>
            <Text style={styles.companyMeta}>{COMPANY.address}</Text>
            <Text style={styles.companyMeta}>{COMPANY.contact}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>TAX INVOICE</Text>
            <Text style={styles.docMeta}>{invoice.number}</Text>
            <Text style={styles.docMeta}>Issued {pdfDate(invoice.issuedAt)}</Text>
          </View>
        </View>

        <View style={[styles.row, styles.gap]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>BILL TO</Text>
            <Text style={styles.bold}>{invoice.clientName}</Text>
            {invoice.billingContact ? <Text>{invoice.billingContact}</Text> : null}
            {invoice.billingEmail ? (
              <Text style={styles.muted}>{invoice.billingEmail}</Text>
            ) : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>PAYMENT</Text>
            <Pair label="Due date" value={pdfDate(invoice.dueDate)} />
            <Pair label="Amount due" value={`${invoice.currency} ${money(balance)}`} />
            {overdue ? (
              <Text style={{ color: BRAND.danger, fontFamily: "Helvetica-Bold", marginTop: 3 }}>
                OVERDUE
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 1 }]}>DESCRIPTION</Text>
          <Text style={[styles.th, { width: 60 }]}>JOB</Text>
          <Text style={[styles.th, styles.right, { width: 34 }]}>QTY</Text>
          <Text style={[styles.th, styles.right, { width: 74 }]}>UNIT</Text>
          <Text style={[styles.th, styles.right, { width: 80 }]}>AMOUNT</Text>
        </View>

        {invoice.lines.map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <Text style={[styles.td, { flex: 1 }]}>{line.description}</Text>
            <Text style={[styles.td, styles.muted, { width: 60 }]}>{line.jobReference ?? "—"}</Text>
            <Text style={[styles.td, styles.right, { width: 34 }]}>{line.quantity}</Text>
            <Text style={[styles.td, styles.right, { width: 74 }]}>{money(line.unitAmount)}</Text>
            <Text style={[styles.td, styles.right, { width: 80 }]}>{money(line.amount)}</Text>
          </View>
        ))}

        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
          <View style={{ width: 240 }}>
            <TotalLine label="Subtotal" value={`${invoice.currency} ${money(invoice.amount)}`} />
            {paid > 0 ? (
              <TotalLine label="Paid to date" value={`− ${money(paid)}`} />
            ) : null}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1.5,
                borderTopColor: BRAND.ink,
                marginTop: 5,
                paddingTop: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>BALANCE DUE</Text>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND.green }}>
                {invoice.currency} {money(balance)}
              </Text>
            </View>
          </View>
        </View>

        {invoice.payments.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>PAYMENTS RECEIVED</Text>
            {invoice.payments.map((payment) => (
              <View
                key={payment.id}
                style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}
              >
                <Text style={styles.muted}>
                  {pdfDate(payment.receivedAt)} · {payment.method.replace(/_/g, " ")}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </Text>
                <Text>{money(payment.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.muted}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{COMPANY.name} · {COMPANY.address}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pair}>
      <Text style={styles.pairLabel}>{label}</Text>
      <Text style={styles.pairValue}>{value}</Text>
    </View>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
      <Text style={styles.muted}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}
