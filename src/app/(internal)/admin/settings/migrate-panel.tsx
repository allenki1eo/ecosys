"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Database, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Result = {
  ok?: boolean;
  message?: string;
  error?: string;
  applied?: string[];
  alreadyApplied?: string[];
};

/**
 * Brings the live database's schema up to the code's. A deploy carrying new
 * tables fails on every page that reads them until this has run, and the person
 * who needs to run it is not always at a terminal.
 */
export function MigratePanel() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  const run = async () => {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/migrate", { method: "POST" });
      const body: Result = await response.json();
      setResult(body);
      if (response.ok) {
        toast.success(body.message ?? "Schema is up to date");
        router.refresh();
      } else {
        toast.error(body.error ?? "Migration failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach the server";
      setResult({ error: message });
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" /> Database schema
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Applies any migrations this deployment carries that the database has not run yet. Safe to
          press at any time — a migration already applied is skipped, and nothing is deleted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Run this after every deploy that adds a feature. If a page reports{" "}
          <span className="font-medium text-foreground">Something went wrong</span> shortly after a
          release, a schema that is behind the code is the usual cause.
        </p>

        <Button onClick={run} disabled={pending}>
          {pending ? "Applying…" : "Apply pending migrations"}
        </Button>

        {result ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            {result.error ? (
              <p className="flex items-start gap-2 text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{result.error}</span>
              </p>
            ) : (
              <p className="text-brand-green">{result.message}</p>
            )}
            {result.applied && result.applied.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Applied now</p>
                <ul className="font-data text-xs">
                  {result.applied.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.alreadyApplied && result.alreadyApplied.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {result.alreadyApplied.length} migration
                {result.alreadyApplied.length === 1 ? "" : "s"} were already applied.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
