"use client"

import { useActionState, useState } from "react"
import { FormField, FormMessage, SubmitButton } from "@/components/form"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { impersonateTenantAction } from "./actions"

function ImpersonateForm({ tenantId, onCancel }: { tenantId: string; onCancel: () => void }) {
  const [state, action] = useActionState(impersonateTenantAction, null)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <FormField
        label="Reason for impersonation"
        name="reason"
        placeholder="e.g. Investigating support ticket #4182 on SLA rules"
        required
        minLength={5}
        maxLength={300}
        hint="Recorded verbatim in the tenant's hash-chained audit log."
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="warning">Enter workspace</SubmitButton>
      </div>
    </form>
  )
}

export function ImpersonateDialog({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`Impersonate · ${name}`}
      description="Sessions expire after 2 hours and display a persistent banner. Every action is attributed to your Super Admin account."
      trigger={
        <Button variant="ghost" size="sm">
          Impersonate
        </Button>
      }
    >
      {open && <ImpersonateForm tenantId={id} onCancel={() => setOpen(false)} />}
    </Modal>
  )
}
