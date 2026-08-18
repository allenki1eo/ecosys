"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, PenLine, Play, Truck } from "lucide-react";
import { toast } from "sonner";

import {
  addJobPhotoAction,
  advanceStatusAction,
  signOffJobAction,
  updateChecklistAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/misc";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ChecklistItem, JobStatus } from "@db/schema";

type ConsumableOption = { id: string; name: string; unit: string };

/**
 * The technician's working surface: single column, large hit targets, and one
 * obvious next action for the current pipeline stage.
 */
export function JobExecution({
  jobId,
  status,
  checklist,
  consumables,
  canExecute,
  canSignOff,
}: {
  jobId: string;
  status: JobStatus;
  checklist: ChecklistItem[];
  consumables: ConsumableOption[];
  canExecute: boolean;
  canSignOff: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState<ChecklistItem[]>(checklist);
  const [summary, setSummary] = React.useState("");
  const [usage, setUsage] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });

  const toggleItem = (id: string, done: boolean) => {
    const next = items.map((item) => (item.id === id ? { ...item, done } : item));
    setItems(next);
    startTransition(async () => {
      const result = await updateChecklistAction(jobId, next);
      if (!result.ok) toast.error(result.error);
    });
  };

  const completeJob = () => {
    const consumption = Object.entries(usage)
      .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

    run(
      () => advanceStatusAction(jobId, "completed", { reportSummary: summary, consumption }),
      "Job completed — stock deducted and certificate issued where applicable",
    );
  };

  const allDone = items.length > 0 && items.every((item) => item.done);

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Checklist</CardTitle>
            <span className="font-data text-xs text-muted-foreground">
              {items.filter((item) => item.done).length}/{items.length}
            </span>
          </CardHeader>
          <CardContent className="space-y-1">
            {items.map((item) => (
              <label
                key={item.id}
                className={cn(
                  "flex items-start gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-accent/40",
                  !canExecute && "pointer-events-none opacity-70",
                )}
              >
                <Checkbox
                  checked={Boolean(item.done)}
                  onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                  disabled={!canExecute || status === "signed_off"}
                  className="mt-0.5"
                />
                <span className={cn(item.done && "text-muted-foreground line-through")}>
                  {item.label}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canExecute && status === "in_progress" ? (
        <Card>
          <CardHeader>
            <CardTitle>Complete this job</CardTitle>
            <p className="text-xs text-muted-foreground">
              Chemicals entered here are deducted from stock and logged against this job.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary">Report summary (visible to the client)</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Findings, treatments applied, follow-up needed…"
              />
            </div>

            {consumables.length > 0 ? (
              <div className="space-y-2">
                <Label>Chemicals used</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {consumables.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        inputMode="decimal"
                        value={usage[item.id] ?? ""}
                        onChange={(event) =>
                          setUsage((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        className="h-8 w-24"
                        placeholder="0"
                      />
                      <span className="w-8 text-xs text-muted-foreground">{item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!allDone && items.length > 0 ? (
              <p className="text-xs text-amber-500">
                {items.filter((item) => !item.done).length} checklist item(s) still open.
              </p>
            ) : null}

            <Button onClick={completeJob} disabled={pending} className="w-full sm:w-auto">
              <CheckCircle2 /> Mark completed
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canExecute && status === "scheduled" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => advanceStatusAction(jobId, "en_route"), "Marked en route")}
          >
            <Truck /> Mark en route
          </Button>
        ) : null}

        {canExecute && (status === "scheduled" || status === "en_route") ? (
          <Button
            disabled={pending}
            onClick={() => run(() => advanceStatusAction(jobId, "in_progress"), "Job started")}
          >
            <Play /> Start job
          </Button>
        ) : null}

        {canExecute && status !== "completed" && status !== "signed_off" && status !== "cancelled" ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => advanceStatusAction(jobId, "cancelled"), "Job cancelled")}
          >
            Cancel job
          </Button>
        ) : null}
      </div>

      {canSignOff && status === "completed" ? (
        <SignOffCard jobId={jobId} pending={pending} onDone={() => router.refresh()} />
      ) : null}

      {canExecute && status !== "signed_off" ? (
        <PhotoCard jobId={jobId} onDone={() => router.refresh()} />
      ) : null}
    </div>
  );
}

function SignOffCard({
  jobId,
  pending,
  onDone,
}: {
  jobId: string;
  pending: boolean;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client sign-off</CardTitle>
        <p className="text-xs text-muted-foreground">
          Capture the name of the site representative who accepted the work.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="signedOffBy">Signed off by</Label>
          <Input
            id="signedOffBy"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. J. Mwanri, QA Officer"
          />
        </div>
        <Button
          disabled={pending || isPending || name.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await signOffJobAction(jobId, name.trim());
              if (result.ok) {
                toast.success("Sign-off recorded");
                onDone();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          <PenLine /> Record sign-off
        </Button>
      </CardContent>
    </Card>
  );
}

function PhotoCard({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [url, setUrl] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add evidence photo</CardTitle>
        <p className="text-xs text-muted-foreground">
          Paste the uploaded file URL (object storage upload happens on the device).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="photoUrl">Photo URL</Label>
          <Input
            id="photoUrl"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="photoCaption">Caption</Label>
          <Input
            id="photoCaption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Loading bay bait station"
          />
        </div>
        <Button
          variant="outline"
          disabled={isPending || url.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await addJobPhotoAction(jobId, url.trim(), caption.trim() || undefined);
              if (result.ok) {
                toast.success("Photo attached");
                setUrl("");
                setCaption("");
                onDone();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          <Camera /> Attach
        </Button>
      </CardContent>
    </Card>
  );
}
