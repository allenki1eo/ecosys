"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  inviteUserAction,
  setUserActiveAction,
  setUserRoleAction,
  updateUserAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { ActionResult } from "@/lib/actions";
import type { UserRole } from "@db/schema";

const CLIENT_ROLES: UserRole[] = ["client_admin", "client_viewer"];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Inviting…" : "Send invite"}
    </Button>
  );
}

export function InviteUserSheet({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<UserRole>("field_technician");
  const router = useRouter();
  const [state, formAction] = useFormState(
    inviteUserAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("User invited");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  const needsClient = CLIENT_ROLES.includes(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <UserPlus /> Invite user
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invite a user</SheetTitle>
          <SheetDescription>
            Client-portal users are locked to one client company and can never see another
            tenant&apos;s data.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input id="user-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-phone">Phone (for SMS reminders)</Label>
              <Input id="user-phone" name="phone" placeholder="+255…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {needsClient ? (
              <div className="space-y-2">
                <Label htmlFor="user-client">Client company</Label>
                <select
                  id="user-client"
                  name="clientId"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select a client…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="user-password">Temporary password</Label>
              <Input id="user-password" name="password" type="text" minLength={8} required />
              <p className="text-xs text-muted-foreground">
                Share it out-of-band; the user should change it after first sign-in.
              </p>
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Name, email and phone. Role, access and password have their own paths. */
export function EditUserSheet({
  user,
}: {
  user: { id: string; name: string; email: string; phone: string | null };
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    updateUserAction.bind(null, user.id),
    undefined as ActionResult | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("User updated");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Edit
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription>
            Their contact details. Role and access are changed from the row itself, and a password
            reset is done by re-running the admin script.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" name="name" defaultValue={user.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={user.email}
                required
              />
              <p className="text-xs text-muted-foreground">This is what they sign in with.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                name="phone"
                defaultValue={user.phone ?? ""}
                placeholder="+255…"
              />
            </div>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function UserRowControls({
  userId,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  role: UserRole;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="flex items-center justify-end gap-3">
      <select
        value={role}
        disabled={pending || isSelf}
        onChange={(event) =>
          startTransition(async () => {
            const result = await setUserRoleAction(userId, event.target.value);
            if (result.ok) {
              toast.success("Role updated");
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm disabled:opacity-50"
      >
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <Switch
        checked={isActive}
        disabled={pending || isSelf}
        aria-label={isActive ? "Deactivate user" : "Activate user"}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            const result = await setUserActiveAction(userId, checked);
            if (result.ok) {
              toast.success(checked ? "User activated" : "User deactivated");
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      />
    </div>
  );
}
