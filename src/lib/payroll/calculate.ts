import type { PayrollRates } from "@db/schema";

/**
 * Tanzanian payroll arithmetic.
 *
 * These defaults reproduce the figures in Ecohygiene's existing payroll
 * spreadsheet exactly — every employee on the July 2026 sheet reconciles to the
 * shilling. They are snapshotted onto each payroll run (`payrollRuns.ratesJson`)
 * so a later change never rewrites a payslip that has already been issued.
 *
 * Note on the PAYE basis: the source spreadsheet applies the band to *basic
 * pay*, not to basic less the employee's NSSF contribution. TRA's own guidance
 * assesses PAYE on taxable income after the statutory pension deduction, which
 * would produce a slightly smaller figure. `payeOnBasic` keeps the sheet's
 * behaviour as the default so the two agree; set it to false to assess on
 * taxable income instead.
 */
export const DEFAULT_RATES: PayrollRates = {
  nssfEmployee: 0.1,
  nssfEmployer: 0.2,
  sdl: 0.04,
  wcf: 0.005,
  // Monthly PAYE bands. Income above `from` is taxed at `rate`, and each band
  // applies only to the portion of income within it.
  payeBands: [
    { from: 0, rate: 0 },
    { from: 270_000, rate: 0.09 },
    { from: 520_000, rate: 0.2 },
    { from: 760_000, rate: 0.25 },
    { from: 1_000_000, rate: 0.3 },
  ],
};

export type PayrollInput = {
  basicSalary: number;
  untaxableAllowance?: number;
  responsibilityAllowance?: number;
  daysWorked?: number;
  monthlyHours?: number;
  overtimeNormalHours?: number;
  publicHolidayHours?: number;
  loanDeduction?: number;
  otherDeductions?: number;
};

export type PayrollResult = {
  hourlyRate: number;
  overtimeNormalAmount: number;
  publicHolidayAmount: number;
  responsibilityAllowance: number;
  untaxableAllowance: number;
  grossEarnings: number;
  taxableSalary: number;
  paye: number;
  nssfEmployee: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  totalEarning: number;
  nssfEmployer: number;
  sdl: number;
  wcf: number;
  employerTotalCost: number;
};

/** Money is whole shillings; round once, at the point each figure is produced. */
const tzs = (value: number) => Math.round(value);

/**
 * Progressive PAYE. Each band taxes only the slice of income that falls inside
 * it, so a raise never costs more tax than it earns.
 */
export function calculatePaye(income: number, bands: PayrollRates["payeBands"]): number {
  if (income <= 0) return 0;

  const ordered = [...bands].sort((a, b) => a.from - b.from);
  let tax = 0;

  for (let i = 0; i < ordered.length; i++) {
    const band = ordered[i];
    if (income <= band.from) break;
    const ceiling = ordered[i + 1]?.from ?? Number.POSITIVE_INFINITY;
    const slice = Math.min(income, ceiling) - band.from;
    tax += slice * band.rate;
  }

  return tzs(tax);
}

/** Overtime multipliers set by the Employment and Labour Relations Act. */
export const OVERTIME_MULTIPLIER = 1.5;
export const PUBLIC_HOLIDAY_MULTIPLIER = 2;

export function calculatePayslip(
  input: PayrollInput,
  rates: PayrollRates,
  options: { payeOnBasic?: boolean } = {},
): PayrollResult {
  const { payeOnBasic = true } = options;

  const basic = Math.max(0, input.basicSalary);
  const monthlyHours = input.monthlyHours && input.monthlyHours > 0 ? input.monthlyHours : 195;
  const hourlyRate = tzs(basic / monthlyHours);

  const overtimeNormalAmount = tzs(
    (input.overtimeNormalHours ?? 0) * hourlyRate * OVERTIME_MULTIPLIER,
  );
  const publicHolidayAmount = tzs(
    (input.publicHolidayHours ?? 0) * hourlyRate * PUBLIC_HOLIDAY_MULTIPLIER,
  );
  const responsibilityAllowance = tzs(input.responsibilityAllowance ?? 0);
  const untaxableAllowance = tzs(input.untaxableAllowance ?? 0);

  // Everything that PAYE and NSSF are assessed on. The untaxable allowance is
  // deliberately excluded and added back after deductions.
  const grossEarnings = basic + overtimeNormalAmount + publicHolidayAmount + responsibilityAllowance;

  const nssfEmployee = tzs(grossEarnings * rates.nssfEmployee);
  const taxableSalary = grossEarnings - nssfEmployee;
  const paye = calculatePaye(payeOnBasic ? grossEarnings : taxableSalary, rates.payeBands);

  const loanDeduction = tzs(input.loanDeduction ?? 0);
  const otherDeductions = tzs(input.otherDeductions ?? 0);
  const totalDeductions = paye + nssfEmployee + loanDeduction + otherDeductions;

  const netPay = grossEarnings - totalDeductions;
  const totalEarning = netPay + untaxableAllowance;

  const nssfEmployer = tzs(grossEarnings * rates.nssfEmployer);
  const sdl = tzs(grossEarnings * rates.sdl);
  const wcf = tzs(grossEarnings * rates.wcf);
  const employerTotalCost = nssfEmployer + paye + sdl + wcf;

  return {
    hourlyRate,
    overtimeNormalAmount,
    publicHolidayAmount,
    responsibilityAllowance,
    untaxableAllowance,
    grossEarnings,
    taxableSalary,
    paye,
    nssfEmployee,
    loanDeduction,
    otherDeductions,
    totalDeductions,
    netPay,
    totalEarning,
    nssfEmployer,
    sdl,
    wcf,
    employerTotalCost,
  };
}

/** "2026-07" → "July 2026", for payslip headings and run labels. */
export function formatPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
