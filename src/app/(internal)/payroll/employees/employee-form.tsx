"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { createEmployeeAction, setEmployeeActiveAction, updateEmployeeAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { calculatePayslip, DEFAULT_RATES } from "@/lib/payroll/calculate";
import { formatCurrency } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";
import type { EmploymentMode } from "@db/schema";

export type EmployeeFormValues = {
  id: string;
  employeeNo: string;
  name: string;
  designation: string | null;
  department: string | null;
  employmentMode: EmploymentMode;
  nidaNumber: string | null;
  nssfNumber: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  phone: string | null;
  email: string | null;
  basicSalary: number;
  untaxableAllowance: number;
  responsibilityAllowance: number;
  monthlyHours: number;
  notes: string | null;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function EmployeeFormSheet({ employee }: { employee?: EmployeeFormValues }) {
  const editing = Boolean(employee);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const action = editing ? updateEmployeeAction.bind(null, employee!.id) : createEmployeeAction;
  const [state, formAction] = useFormState(
    action as (
      prev: ActionResult<string> | undefined,
      data: FormData,
    ) => Promise<ActionResult<string>>,
    undefined as ActionResult<string> | undefined,
  );

  // Live preview so whoever sets the salary sees the take-home it produces.
  const [basic, setBasic] = React.useState(employee?.basicSalary ?? 0);
  const [untaxable, setUntaxable] = React.useState(employee?.untaxableAllowance ?? 0);
  const [responsibility, setResponsibility] = React.useState(
    employee?.responsibilityAllowance ?? 0,
  );

  const preview = React.useMemo(
    () =>
      calculatePayslip(
        {
          basicSalary: Number(basic) || 0,
          untaxableAllowance: Number(untaxable) || 0,
          responsibilityAllowance: Number(responsibility) || 0,
        },
        DEFAULT_RATES,
      ),
    [basic, untaxable, responsibility],
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(editing ? "Employee updated" : "Employee added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, editing, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <UserPlus /> Add employee
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? employee!.name : "Add an employee"}</SheetTitle>
          <SheetDescription>
            Salary details here are used to generate payslips. Changing them never alters payslips
            already issued — each one keeps its own snapshot.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employeeNo">Employee no.</Label>
                <Input
                  id="employeeNo"
                  name="employeeNo"
                  defaultValue={employee?.employeeNo}
                  placeholder="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" defaultValue={employee?.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  name="designation"
                  defaultValue={employee?.designation ?? ""}
                  placeholder="Site Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employmentMode">Mode of employment</Label>
                <select
                  id="employmentMode"
                  name="employmentMode"
                  defaultValue={employee?.employmentMode ?? "specified"}
                  className={selectClass}
                >
                  <option value="specified">Specified</option>
                  <option value="unspecified">Unspecified</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Pay</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="basicSalary">Basic salary (TZS)</Label>
                  <Input
                    id="basicSalary"
                    name="basicSalary"
                    type="number"
                    min={0}
                    step="any"
                    value={basic}
                    onChange={(event) => setBasic(Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="untaxableAllowance">Transport allowance (untaxed)</Label>
                  <Input
                    id="untaxableAllowance"
                    name="untaxableAllowance"
                    type="number"
                    min={0}
                    step="any"
                    value={untaxable}
                    onChange={(event) => setUntaxable(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responsibilityAllowance">Responsibility allowance</Label>
                  <Input
                    id="responsibilityAllowance"
                    name="responsibilityAllowance"
                    type="number"
                    min={0}
                    step="any"
                    value={responsibility}
                    onChange={(event) => setResponsibility(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyHours">Monthly hours</Label>
                  <Input
                    id="monthlyHours"
                    name="monthlyHours"
                    type="number"
                    min={1}
                    defaultValue={employee?.monthlyHours ?? 195}
                  />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-4">
                <Preview label="PAYE" value={formatCurrency(preview.paye)} />
                <Preview label="NSSF (10%)" value={formatCurrency(preview.nssfEmployee)} />
                <Preview label="Net pay" value={formatCurrency(preview.netPay)} />
                <Preview label="Payable" value={formatCurrency(preview.totalEarning)} strong />
              </dl>
              <p className="text-xs text-muted-foreground">
                Employer cost on top: {formatCurrency(preview.employerTotalCost)} (NSSF 20%, SDL 4%,
                WCF 0.5%).
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nidaNumber">NIDA number</Label>
                <Input id="nidaNumber" name="nidaNumber" defaultValue={employee?.nidaNumber ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nssfNumber">NSSF number</Label>
                <Input id="nssfNumber" name="nssfNumber" defaultValue={employee?.nssfNumber ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank</Label>
                <Input id="bankName" name="bankName" defaultValue={employee?.bankName ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountNo">Bank account no.</Label>
                <Input
                  id="bankAccountNo"
                  name="bankAccountNo"
                  defaultValue={employee?.bankAccountNo ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={employee?.email ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={employee?.phone ?? ""} placeholder="+255…" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Payslips are sent to the email if there is one, otherwise by SMS to the phone.
            </p>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={employee?.notes ?? ""} />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Add employee"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Preview({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={strong ? "truncate font-data font-semibold text-brand-green" : "truncate font-data"}>
        {value}
      </dd>
    </div>
  );
}

export function EmployeeActiveToggle({
  employeeId,
  isActive,
}: {
  employeeId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      aria-label={isActive ? "Deactivate employee" : "Activate employee"}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await setEmployeeActiveAction(employeeId, checked);
          if (result.ok) {
            toast.success(checked ? "Employee activated" : "Employee deactivated");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    />
  );
}
