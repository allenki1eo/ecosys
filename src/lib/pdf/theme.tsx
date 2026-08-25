import { StyleSheet } from "@react-pdf/renderer";

/**
 * Shared look for every document Ecohygiene issues — payslips, invoices and
 * compliance certificates.
 *
 * Print is not the app: the dark UI theme would waste toner and read poorly on
 * paper, so documents are black-on-white with the brand green reserved for
 * rules and headings. Sizes are in PDF points (1/72").
 */
export const BRAND = {
  green: "#2c9664",
  blue: "#1d81c9",
  ink: "#111113",
  muted: "#6b7280",
  line: "#d4d4d8",
  soft: "#f4f4f5",
  danger: "#b91c1c",
} as const;

export const COMPANY = {
  name: "ECOHYGIENE COMPANY LIMITED",
  tagline: "Hygiene & Sanitation Technical Services",
  address: "Shinyanga, Tanzania",
  contact: "info@ecohygiene.co.tz",
} as const;

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 54,
    paddingHorizontal: 40,
    fontSize: 9,
    color: BRAND.ink,
    fontFamily: "Helvetica",
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND.green,
    paddingBottom: 10,
    marginBottom: 16,
  },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND.ink },
  companyMeta: { fontSize: 8, color: BRAND.muted, marginTop: 2 },
  docTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docMeta: { fontSize: 8, color: BRAND.muted, textAlign: "right", marginTop: 2 },

  /* Blocks */
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    color: BRAND.muted,
    marginBottom: 5,
  },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  gap: { marginBottom: 14 },

  /* Definition pairs */
  pair: { flexDirection: "row", marginBottom: 3 },
  pairLabel: { width: 96, color: BRAND.muted },
  pairValue: { flex: 1, fontFamily: "Helvetica-Bold" },

  /* Tables */
  tableHead: {
    flexDirection: "row",
    backgroundColor: BRAND.soft,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BRAND.line,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.line,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND.muted },
  td: { fontSize: 9 },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: BRAND.muted },

  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: BRAND.ink,
    paddingTop: 6,
    paddingHorizontal: 6,
    marginTop: 2,
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BRAND.line,
    paddingTop: 6,
    fontSize: 7.5,
    color: BRAND.muted,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  signature: {
    borderTopWidth: 1,
    borderTopColor: BRAND.ink,
    marginTop: 26,
    paddingTop: 4,
    fontSize: 8,
    color: BRAND.muted,
    width: 150,
  },
});

/** Whole shillings with thousands separators — never decimals for TZS. */
export function money(amount: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(amount ?? 0);
}

export function pdfDate(date: Date | number | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
