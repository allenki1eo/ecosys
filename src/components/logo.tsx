import { cn } from "@/lib/utils";

/**
 * Mark only — the green/blue pair is the one place brand colour appears at
 * any size, everything else stays neutral.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-green to-brand-blue text-sm font-bold text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      EH
    </div>
  );
}
