"use client"

import { useActionState, useEffect, useState } from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { updateTenantPlanAction } from "./actions"

const PLANS = [
  { value: "trial", label: "Trial" },
  { value: "starter", label: "Starter ($39/mo)" },
  { value: "growth", label: "Growth ($79/mo)" },
  { value: "business", label: "Business ($149/mo)" },
  { value: "enterprise", label: "Enterprise (Custom)" },
]

function PlanForm({
  tenantId,
  plan,
  limits,
  onDone,
}: {
  tenantId: string
  plan: string
  limits: { branches: number; users: number; locations: number; monthlyTickets?: number }
  onDone: () => void
}) {
  const [state, action] = useActionState(updateTenantPlanAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <FormSelect label="Plan" name="plan" defaultValue={plan} options={PLANS} state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Branch limit"
          name="branches"
          type="number"
          min={1}
          defaultValue={limits.branches}
          required
          state={state}
        />
        <FormField
          label="User limit"
          name="users"
          type="number"
          min={1}
          defaultValue={limits.users}
          required
          state={state}
        />
        <FormField
          label="Location limit"
          name="locations"
          type="number"
          min={1}
          defaultValue={limits.locations}
          required
          state={state}
        />
        <FormField
          label="Monthly tickets limit"
          name="monthlyTickets"
          type="number"
          min={10}
          defaultValue={limits.monthlyTickets ?? 500}
          required
          state={state}
        />
      </div>
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save limits</SubmitButton>
      </div>
    </form>
  )
}

export function TenantPlanDialog({
  id,
  name,
  plan,
  limits,
}: {
  id: string
  name: string
  plan: string
  limits: { branches: number; users: number; locations: number; monthlyTickets?: number }
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`Plan & limits · ${name}`}
      description="Changes take effect immediately and are recorded in the tenant's audit log."
      trigger={
        <Button variant="ghost" size="sm">
          Edit limits
        </Button>
      }
    >
      {open && <PlanForm tenantId={id} plan={plan} limits={limits} onDone={() => setOpen(false)} />}
    </Modal>
  )
}
