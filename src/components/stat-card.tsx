import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single headline figure. No plot, so no hover layer — the number is the
 * whole point and the caption carries the context.
 */
export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon?: LucideIcon;
  href?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  const body = (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon
            className={cn(
              "size-4",
              tone === "positive" && "text-brand-green",
              tone === "warning" && "text-amber-500",
              tone === "critical" && "text-destructive",
              tone === "neutral" && "text-muted-foreground",
            )}
          />
        ) : null}
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
