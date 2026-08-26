import { Document, Page, Text, View } from "@react-pdf/renderer";

import { BRAND, COMPANY, money, pdfDate, styles } from "./theme";
import { formatPeriod } from "@/lib/payroll/calculate";
import type { Payslip, PayrollRun } from "@db/schema";

/**
 * Payslip, laid out to match the sheet Ecohygiene already issues: identity
 * block, then earnings and deductions side by side, then what is actually
 * payable.
 */
export function PayslipDocument({ payslip, run }: { payslip: Payslip; run: PayrollRun }) {
  const earnings: [string, string][] = [
    ["Basic pay", money(payslip.basicSalary)],
    ["Responsibility allowance", money(payslip.responsibilityAllowance)],
    ["Overtime (normal)", money(payslip.overtimeNormalAmount)],
    ["Overtime (public holiday)", money(payslip.publicHolidayAmount)],
  ];

  const deductions: [string, string][] = [
    ["PAYE", money(payslip.paye)],
    ["NSSF (employee)", money(payslip.nssfEmployee)],
    ["Loan repayment", money(payslip.loanDeduction)],
    ["Other deductions", money(payslip.otherDeductions)],
  ];

  return (
    <Document
      title={`Payslip ${payslip.employeeName} ${formatPeriod(run.period)}`}
      author={COMPANY.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{COMPANY.name}</Text>
            <Text style={styles.companyMeta}>{COMPANY.tagline}</Text>
            <Text style={styles.companyMeta}>{COMPANY.address}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>PAYSLIP</Text>
            <Text style={styles.docMeta}>{formatPeriod(run.period)}</Text>
            <Text style={styles.docMeta}>{run.reference}</Text>
          </View>
        </View>

        {/* Who this is for */}
        <View style={[styles.row, styles.gap]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>EMPLOYEE</Text>
            <Pair label="Name" value={payslip.employeeName} />
            <Pair label="Employee no." value={payslip.employeeNo} />
            <Pair label="Designation" value={payslip.designation ?? "—"} />
            <Pair label="Mode" value={titleCase(payslip.employmentMode)} />
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>DETAILS</Text>
            <Pair label="NIDA no." value={payslip.nidaNumber ?? "—"} />
            <Pair label="NSSF no." value={payslip.nssfNumber ?? "—"} />
            <Pair label="Bank" value={payslip.bankName ?? "—"} />
            <Pair label="Account no." value={payslip.bankAccountNo ?? "—"} />
          </View>
        </View>

        <View style={[styles.row, styles.gap]}>
          <View style={styles.col}>
            <Pair label="Days worked" value={String(payslip.daysWorked)} />
          </View>
          <View style={styles.col}>
            <Pair label="Earned leave" value={String(payslip.earnedLeaveDays)} />
          </View>
          <View style={styles.col}>
            <Pair label="Sick leave" value={String(payslip.sickLeaveDays)} />
          </View>
        </View>

        {/* Earnings and deductions, side by side as on the original */}
        <View style={styles.row}>
          <View style={[styles.col, { marginRight: 12 }]}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 1 }]}>EARNINGS</Text>
              <Text style={[styles.th, styles.right, { width: 80 }]}>TZS</Text>
            </View>
            {earnings.map(([label, value]) => (
              <View key={label} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 1 }]}>{label}</Text>
                <Text style={[styles.td, styles.right, { width: 80 }]}>{value}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={[styles.td, styles.bold, { flex: 1 }]}>Gross earnings</Text>
              <Text style={[styles.td, styles.bold, styles.right, { width: 80 }]}>
                {money(payslip.grossEarnings)}
              </Text>
            </View>
          </View>

          <View style={styles.col}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 1 }]}>DEDUCTIONS</Text>
              <Text style={[styles.th, styles.right, { width: 80 }]}>TZS</Text>
            </View>
            {deductions.map(([label, value]) => (
              <View key={label} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 1 }]}>{label}</Text>
                <Text style={[styles.td, styles.right, { width: 80 }]}>{value}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={[styles.td, styles.bold, { flex: 1 }]}>Total deductions</Text>
              <Text style={[styles.td, styles.bold, styles.right, { width: 80 }]}>
                {money(payslip.totalDeductions)}
              </Text>
            </View>
          </View>
        </View>

        {/* What actually reaches the bank */}
        <View
          style={{
            marginTop: 18,
            padding: 12,
            backgroundColor: BRAND.soft,
            borderLeftWidth: 3,
            borderLeftColor: BRAND.green,
          }}
        >
          <SummaryLine label="Net pay (gross less deductions)" value={money(payslip.netPay)} />
          <SummaryLine
            label="Untaxable allowance (transport)"
            value={money(payslip.untaxableAllowance)}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderTopColor: BRAND.line,
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>SALARY PAYABLE</Text>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND.green }}>
              TZS {money(payslip.totalEarning)}
            </Text>
          </View>
        </View>

        {/* Employer-borne statutory cost — informational, not deducted */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>EMPLOYER STATUTORY CONTRIBUTIONS (NOT DEDUCTED)</Text>
          <View style={styles.row}>
            <MiniFact label="NSSF (employer)" value={money(payslip.nssfEmployer)} />
            <MiniFact label="SDL" value={money(payslip.sdl)} />
            <MiniFact label="WCF" value={money(payslip.wcf)} />
            <MiniFact label="Total cost" value={money(payslip.employerTotalCost)} />
          </View>
        </View>

        {payslip.notes ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.muted}>{payslip.notes}</Text>
          </View>
        ) : null}

        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={styles.col}>
            <Text style={styles.signature}>Employer&apos;s signature</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.signature}>Employee&apos;s signature</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            This is a computer-generated payslip. Issued {pdfDate(run.finalisedAt ?? run.createdAt)}.
          </Text>
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

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
      <Text>{label}</Text>
      <Text style={styles.bold}>{value}</Text>
    </View>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.col}>
      <Text style={{ fontSize: 7.5, color: BRAND.muted }}>{label}</Text>
      <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold" }}>{value}</Text>
    </View>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
