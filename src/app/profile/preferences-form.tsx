"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

import { updatePreferencesAction } from "@/app/(internal)/admin/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save preferences"}
    </Button>
  );
}

export function PreferencesForm({
  notifyBySms,
  notifyByEmail,
}: {
  notifyBySms: boolean;
  notifyByEmail: boolean;
}) {
  const [state, formAction] = useFormState(
    updatePreferencesAction,
    undefined as ActionResult | undefined,
  );
  const [sms, setSms] = React.useState(notifyBySms);
  const [email, setEmail] = React.useState(notifyByEmail);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("Preferences saved");
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {/* Switches are controlled; hidden inputs carry the value into the action. */}
      <label className="flex items-center justify-between gap-4 rounded-md border p-3">
        <span className="text-sm">
          SMS reminders
          <span className="block text-xs text-muted-foreground">
            Job reminders sent to your phone before a scheduled visit.
          </span>
        </span>
        <Switch checked={sms} onCheckedChange={setSms} />
      </label>
      {sms ? <input type="hidden" name="notifyBySms" value="true" /> : null}

      <label className="flex items-center justify-between gap-4 rounded-md border p-3">
        <span className="text-sm">
          Email notifications
          <span className="block text-xs text-muted-foreground">
            Reports, invoices and certificate renewal alerts.
          </span>
        </span>
        <Switch checked={email} onCheckedChange={setEmail} />
      </label>
      {email ? <input type="hidden" name="notifyByEmail" value="true" /> : null}

      <Save />
    </form>
  );
}
