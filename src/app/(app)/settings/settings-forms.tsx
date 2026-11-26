"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { CheckboxGroup, FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import {
  createAssignmentRuleAction,
  createCategoryAction,
  createSlaPolicyAction,
  deleteAssignmentRuleAction,
  deleteSlaPolicyAction,
  runSlaSweepNowAction,
  toggleAssignmentRuleAction,
  updateAutomationSettingsAction,
  updateCategoryAction,
} from "./actions"

type Opt = { value: string; label: string }

export function CreateSlaPolicyDialog({
  branches,
  categories,
}: {
  branches: Opt[]
  categories: Opt[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New SLA policy"
      description="Configure L1 → L2 → L3 acceptance, resolution and escalation targets."
      trigger={
        <Button size="lg">
          <Icon name="plus" data-icon="inline-start" /> New SLA policy
        </Button>
      }
    >
      {open && (
        <SlaPolicyForm branches={branches} categories={categories} onDone={() => setOpen(false)} />
      )}
    </Modal>
  )
}

function SlaPolicyForm({
  branches,
  categories,
  onDone,
}: {
  branches: Opt[]
  categories: Opt[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createSlaPolicyAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  const roleOpts = [
    { value: "l1_staff", label: "L1 staff" },
    { value: "l2_supervisor", label: "L2 supervisor" },
    { value: "l3_manager", label: "L3 manager" },
    { value: "dept_manager", label: "Department manager" },
    { value: "branch_admin", label: "Branch admin" },
    { value: "org_admin", label: "Org admin" },
  ]
  const actionOpts = [
    { value: "both", label: "Notify + transfer" },
    { value: "notify", label: "Notify only" },
    { value: "transfer", label: "Transfer only" },
  ]

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Policy name"
          name="name"
          placeholder="e.g. Standard Hospital SLA"
          required
          state={state}
        />
        <FormSelect
          label="Clock mode"
          name="businessHoursMode"
          defaultValue="business_hours"
          options={[
            { value: "business_hours", label: "Branch business hours" },
            { value: "24x7", label: "24×7 clock" },
          ]}
          state={state}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormSelect
          label="Branch (optional)"
          name="branchId"
          options={[{ value: "", label: "All branches" }, ...branches]}
          state={state}
        />
        <FormSelect
          label="Category (optional)"
          name="categoryId"
          options={[{ value: "", label: "All categories" }, ...categories]}
          state={state}
        />
        <FormSelect
          label="Severity (optional)"
          name="severity"
          options={[
            { value: "", label: "All severities" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
          state={state}
        />
      </div>

      {/* Visual L1 -> L2 -> L3 escalation ladder */}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Escalation ladder (minutes)
        </p>
        {[
          { k: "l1", title: "L1 · First response", acc: 15, res: 180, role: "l1_staff" },
          {
            k: "l2",
            title: "L2 · Supervisor escalation",
            acc: 30,
            res: 300,
            role: "l2_supervisor",
          },
          { k: "l3", title: "L3 · Final escalation", acc: 60, res: 480, role: "l3_manager" },
        ].map((lvl) => (
          <div key={lvl.k} className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-semibold">{lvl.title}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <FormField
                label="Accept (min)"
                name={`${lvl.k}Accept`}
                type="number"
                min={1}
                defaultValue={lvl.acc}
                state={state}
              />
              <FormField
                label="Resolve (min)"
                name={`${lvl.k}Resolve`}
                type="number"
                min={5}
                defaultValue={lvl.res}
                state={state}
              />
              <FormSelect
                label="Target role"
                name={`${lvl.k}Role`}
                defaultValue={lvl.role}
                options={roleOpts}
                state={state}
              />
              <FormSelect
                label="Action"
                name={`${lvl.k}Action`}
                defaultValue="both"
                options={actionOpts}
                state={state}
              />
            </div>
          </div>
        ))}
      </div>

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save policy</SubmitButton>
      </div>
    </form>
  )
}

export function DeleteSlaPolicyButton({ id, name }: { id: string; name: string }) {
  const swal = useSweetAlert()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        swal.fire({
          tone: "warning",
          title: `Delete SLA policy "${name}"?`,
          text: "Existing tickets keep their calculated deadlines; new tickets won't match this policy.",
          confirmText: "Delete",
          cancelText: "Keep it",
          confirmVariant: "destructive",
          onConfirm: async () => {
            const res = await deleteSlaPolicyAction(id)
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      Delete
    </Button>
  )
}

export function RunSweepButton() {
  const [pending, startTransition] = useTransition()
  const [summary, setSummary] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="lg"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await runSlaSweepNowAction()
            if (res && res.ok) {
              setSummary(
                `Checked ${res.data.checked} · ${res.data.warned} warned · ${res.data.escalated} escalated`,
              )
            } else if (res) {
              setSummary(res.error.message)
            }
          })
        }
      >
        <Icon name="sla" data-icon="inline-start" /> Run SLA check now
      </Button>
      {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
    </div>
  )
}

export function CreateAssignmentRuleDialog({
  branches,
  categories,
  members,
}: {
  branches: Opt[]
  categories: Opt[]
  members: Opt[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New auto-assignment rule"
      description="Rules run in priority order (lowest number first); the first match assigns the ticket."
      trigger={
        <Button size="lg">
          <Icon name="plus" data-icon="inline-start" /> New rule
        </Button>
      }
    >
      {open && (
        <AssignmentRuleForm
          branches={branches}
          categories={categories}
          members={members}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}

function AssignmentRuleForm({
  branches,
  categories,
  members,
  onDone,
}: {
  branches: Opt[]
  categories: Opt[]
  members: Opt[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createAssignmentRuleAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          label="Rule name"
          name="name"
          placeholder="e.g. Housekeeping rotation"
          required
          state={state}
          className="sm:col-span-2"
        />
        <FormField
          label="Priority"
          name="priority"
          type="number"
          min={1}
          defaultValue={10}
          state={state}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormSelect
          label="Branch"
          name="branchId"
          options={[{ value: "", label: "Any branch" }, ...branches]}
          state={state}
        />
        <FormSelect
          label="Category"
          name="categoryId"
          options={[{ value: "", label: "Any category" }, ...categories]}
          state={state}
        />
        <FormSelect
          label="Severity"
          name="severity"
          options={[
            { value: "", label: "Any severity" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
          state={state}
        />
      </div>
      <FormSelect
        label="Strategy"
        name="strategy"
        defaultValue="round_robin"
        options={[
          { value: "round_robin", label: "Round-robin rotation" },
          { value: "least_loaded", label: "Least-loaded teammate" },
          { value: "fixed", label: "Fixed primary owner" },
        ]}
        state={state}
      />
      <CheckboxGroup legend="Eligible teammates" name="userIds" options={members} state={state} />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save rule</SubmitButton>
      </div>
    </form>
  )
}

export function AssignmentRuleActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() => startTransition(() => void toggleAssignmentRuleAction(id, !active))}
      >
        {active ? "Pause" : "Enable"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() => startTransition(() => void deleteAssignmentRuleAction(id))}
      >
        Delete
      </Button>
    </div>
  )
}

export function CreateCategoryDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="New feedback category"
      trigger={
        <Button size="lg">
          <Icon name="plus" data-icon="inline-start" /> Add category
        </Button>
      }
    >
      {open && <CategoryForm onDone={() => setOpen(false)} />}
    </Modal>
  )
}

export function EditCategoryDialog({
  category,
}: {
  category: {
    id: string
    label: string
    defaultSeverity: string
    requiresRCA: boolean
    requiresResolutionEvidence: boolean
    active: boolean
  }
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`Edit ${category.label}`}
      trigger={
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      }
    >
      {open && <CategoryForm initial={category} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function CategoryForm({
  initial,
  onDone,
}: {
  initial?: {
    id: string
    label: string
    defaultSeverity: string
    requiresRCA: boolean
    requiresResolutionEvidence: boolean
    active: boolean
  }
  onDone: () => void
}) {
  const [state, action] = useActionState(
    initial ? updateCategoryAction : createCategoryAction,
    null,
  )
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormField
        label="Category label"
        name="label"
        defaultValue={initial?.label}
        required
        state={state}
      />
      <FormSelect
        label="Default severity"
        name="defaultSeverity"
        defaultValue={initial?.defaultSeverity ?? "medium"}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "critical", label: "Critical" },
        ]}
        state={state}
      />
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresRCA"
          defaultChecked={initial?.requiresRCA ?? false}
          className="size-4 accent-(--primary)"
        />
        <span>Flag tickets in this category for Root Cause Analysis (RCA)</span>
      </label>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresResolutionEvidence"
          defaultChecked={initial?.requiresResolutionEvidence ?? false}
          className="size-4 accent-(--primary)"
        />
        <span>Require photo evidence before submitting for verification</span>
      </label>
      {initial && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
            className="size-4 accent-(--primary)"
          />
          <span>Show on public QR feedback forms</span>
        </label>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>{initial ? "Save changes" : "Add category"}</SubmitButton>
      </div>
    </form>
  )
}

export function AutomationSettingsForm({
  autoCloseDays,
  repeatRcaThreshold,
}: {
  autoCloseDays: number
  repeatRcaThreshold: number
}) {
  const [state, action] = useActionState(updateAutomationSettingsAction, null)
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormField
        label="Auto-close pending verification after (days)"
        name="autoCloseDays"
        type="number"
        min={0}
        max={90}
        defaultValue={autoCloseDays}
        hint="Set to 0 to disable auto-close. Verifiers can always close manually."
        state={state}
      />
      <FormField
        label="Repeat-issue RCA trigger threshold (tickets / 30 days)"
        name="repeatRcaThreshold"
        type="number"
        min={2}
        max={20}
        defaultValue={repeatRcaThreshold}
        hint="Recommend an RCA whenever the same spot + category repeats this many times."
        state={state}
      />
      <FormMessage state={state} success="Automation settings saved." />
      <SubmitButton size="lg">Save automation</SubmitButton>
    </form>
  )
}
