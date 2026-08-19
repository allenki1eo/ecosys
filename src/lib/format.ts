import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";

/** Money is stored as whole TZS — never show decimals for it. */
export function formatCurrency(amount: number, currency = "TZS"): string {
  return new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

/** Compact form for KPI tiles: TSh 4.2M. */
export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `TSh ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `TSh ${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `TSh ${(amount / 1_000).toFixed(0)}K`;
  return `TSh ${amount}`;
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: fractionDigits,
  }).format(value ?? 0);
}

export function formatDate(date: Date | number | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy");
}

export function formatDateTime(date: Date | number | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy, HH:mm");
}

export function formatTime(date: Date | number | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "HH:mm");
}

/** "Today 08:00" / "Tomorrow 14:30" / "12 Sep, 09:00" — used on schedule rows. */
export function formatSchedule(date: Date | number | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm");
}

export function formatRelative(date: Date | number | null | undefined): string {
  if (!date) return "—";
  return `${formatDistanceToNowStrict(new Date(date))} ago`;
}

export function daysUntil(date: Date | number | null | undefined): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return format(new Date(Number(year), Number(m) - 1, 1), "MMM");
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
