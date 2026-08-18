"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatMonthLabel, formatNumber } from "@/lib/format";

/**
 * Categorical series colours, taken in fixed order from the validated chart
 * tokens. Never cycle past the end — an extra series becomes "Other" or a
 * second chart instead.
 */
export const SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

const AXIS_PROPS = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
  valueFormatter: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-mono tabular-nums text-foreground">
            {valueFormatter(Number(entry.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export type MonthPoint = { month: string; value: number };

/**
 * Change over time, single series. No legend — the card title names the series;
 * hover gives the exact value rather than labelling every point.
 */
export function TrendChart({
  data,
  seriesName,
  colorIndex = 0,
  format = "number",
  className,
}: {
  data: MonthPoint[];
  seriesName: string;
  colorIndex?: number;
  format?: "number" | "currency";
  className?: string;
}) {
  const color = SERIES_COLORS[colorIndex % SERIES_COLORS.length];
  const valueFormatter = format === "currency" ? formatCompactCurrency : (v: number) => formatNumber(v);
  const gradientId = React.useId();

  return (
    <div className={cn("h-[200px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonthLabel} {...AXIS_PROPS} />
          <YAxis width={48} tickFormatter={valueFormatter} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
            labelFormatter={(label) => (typeof label === "string" ? formatMonthLabel(label) : label)}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Magnitude comparison across categories. Bars are horizontal when the labels
 * are names (they read better) and carry one colour — identity comes from the
 * axis label, not the hue.
 */
export function CategoryBarChart({
  data,
  format = "number",
  colorIndex = 1,
  className,
}: {
  data: { name: string; value: number }[];
  format?: "number" | "currency";
  colorIndex?: number;
  className?: string;
}) {
  const valueFormatter = format === "currency" ? formatCompactCurrency : (v: number) => formatNumber(v);
  const color = SERIES_COLORS[colorIndex % SERIES_COLORS.length];

  return (
    <div className={cn("h-[200px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tickFormatter={valueFormatter} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" width={132} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          <Bar dataKey="value" name="Value" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Multi-series magnitude by category, e.g. revenue split by service type.
 * A legend is always present for two or more series so identity is never
 * carried by colour alone.
 */
export function GroupedBarChart({
  data,
  series,
  format = "number",
  className,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  format?: "number" | "currency";
  className?: string;
}) {
  const valueFormatter = format === "currency" ? formatCompactCurrency : (v: number) => formatNumber(v);

  return (
    <div className={cn("h-[220px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis width={48} tickFormatter={valueFormatter} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          {series.length > 1 ? (
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
            />
          ) : null}
          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES_COLORS[index % SERIES_COLORS.length]}
              radius={[4, 4, 0, 0]}
              barSize={18}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Composition of a small, fixed set of categories. Rendered as a stacked bar
 * rather than a pie — angles are hard to compare, lengths are not.
 */
export function CompositionBar({
  segments,
  className,
}: {
  segments: { label: string; value: number }[];
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No activity yet.</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: SERIES_COLORS[index % SERIES_COLORS.length],
            }}
            title={`${segment.label}: ${formatNumber(segment.value)}`}
          />
        ))}
      </div>
      <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">{segment.label}</span>
            <span className="ml-auto font-mono tabular-nums">
              {Math.round((segment.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Cell };
