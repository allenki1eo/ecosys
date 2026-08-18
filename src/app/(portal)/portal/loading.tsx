import { CardSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b pb-5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
      <div className="rounded-lg border">
        <TableSkeleton rows={4} columns={4} />
      </div>
    </div>
  );
}
