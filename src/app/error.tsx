"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface the digest so it can be matched against server logs.
    console.error("Unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-5 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      {error.digest ? (
        <p className="font-data text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
