import { Document, Page, Text, View } from "@react-pdf/renderer";

import { BRAND, COMPANY, money, pdfDate, styles } from "./theme";
import type { CertificateType } from "@db/schema";

const TYPE_LABELS: Record<CertificateType, string> = {
  pest_control: "PEST CONTROL",
  fumigation: "FUMIGATION",
  wastewater_discharge: "WASTEWATER DISCHARGE",
  sanitation: "SANITATION",
};

export type CertificatePdfData = {
  reference: string;
  type: CertificateType;
  clientName: string;
  siteName: string;
  siteAddress: string | null;
  jobReference: string | null;
  serviceName: string | null;
  issuedAt: Date;
  expiresAt: Date;
  authority: string | null;
  issuedByName: string | null;
  treatmentSummary: string | null;
};

/**
 * A compliance certificate is shown to an inspector, so the facts they check —
 * what was treated, where, when it lapses — carry the page, and the reference
 * is prominent enough to quote over a phone.
 */
export function CertificateDocument({ certificate }: { certificate: CertificatePdfData }) {
  const expired = certificate.expiresAt.getTime() < Date.now();

  return (
    <Document title={`Certificate ${certificate.reference}`} author={COMPANY.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{COMPANY.name}</Text>
            <Text style={styles.companyMeta}>{COMPANY.tagline}</Text>
            <Text style={styles.companyMeta}>{COMPANY.address}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>CERTIFICATE</Text>
            <Text style={styles.docMeta}>{certificate.reference}</Text>
            {certificate.authority ? (
              <Text style={styles.docMeta}>Prepared for {certificate.authority}</Text>
            ) : null}
          </View>
        </View>

        <View
          style={{
            borderWidth: 1.5,
            borderColor: BRAND.green,
            paddingVertical: 18,
            paddingHorizontal: 20,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 8, color: BRAND.muted, letterSpacing: 1, textAlign: "center" }}>
            CERTIFICATE OF SERVICE
          </Text>
          <Text
            style={{
              fontSize: 17,
              fontFamily: "Helvetica-Bold",
              textAlign: "center",
              marginTop: 6,
              color: BRAND.green,
            }}
          >
            {TYPE_LABELS[certificate.type]}
          </Text>
          <Text style={{ textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
            This is to certify that the service named above was carried out by{" "}
            {COMPANY.name} at the premises identified below, in accordance with the applicable
            Tanzanian standards and the treatment schedule agreed with the client.
          </Text>
        </View>

        <View style={[styles.row, styles.gap]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>CLIENT</Text>
            <Text style={styles.bold}>{certificate.clientName}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>PREMISES TREATED</Text>
            <Text style={styles.bold}>{certificate.siteName}</Text>
            {certificate.siteAddress ? (
              <Text style={styles.muted}>{certificate.siteAddress}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 1 }]}>DETAIL</Text>
          <Text style={[styles.th, { flex: 1 }]}>VALUE</Text>
        </View>
        <DetailRow label="Service performed" value={certificate.serviceName ?? TYPE_LABELS[certificate.type]} />
        <DetailRow label="Job reference" value={certificate.jobReference ?? "—"} />
        <DetailRow label="Date of service" value={pdfDate(certificate.issuedAt)} />
        <DetailRow label="Valid until" value={pdfDate(certificate.expiresAt)} />
        <DetailRow label="Issued by" value={certificate.issuedByName ?? COMPANY.name} />

        {certificate.treatmentSummary ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>TREATMENT SUMMARY</Text>
            <Text style={{ lineHeight: 1.5 }}>{certificate.treatmentSummary}</Text>
          </View>
        ) : null}

        {expired ? (
          <View
            style={{
              marginTop: 18,
              padding: 10,
              borderLeftWidth: 3,
              borderLeftColor: BRAND.danger,
              backgroundColor: BRAND.soft,
            }}
          >
            <Text style={{ color: BRAND.danger, fontFamily: "Helvetica-Bold" }}>
              This certificate expired on {pdfDate(certificate.expiresAt)}.
            </Text>
            <Text style={styles.muted}>
              Arrange the follow-up service to maintain continuous compliance cover.
            </Text>
          </View>
        ) : null}

        <View style={[styles.row, { marginTop: 34 }]}>
          <View style={styles.col}>
            <Text style={styles.signature}>Authorised signatory</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.signature}>Client representative</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {certificate.reference} · valid {pdfDate(certificate.issuedAt)} –{" "}
            {pdfDate(certificate.expiresAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.td, styles.muted, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.td, styles.bold, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

export { money };
