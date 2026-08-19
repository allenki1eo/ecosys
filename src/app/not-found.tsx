import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="rounded-full bg-muted p-3">
        <FileQuestion className="size-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page does not exist, or it belongs to a company you do not have access to.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Back to your dashboard</Link>
      </Button>
    </div>
  );
}
