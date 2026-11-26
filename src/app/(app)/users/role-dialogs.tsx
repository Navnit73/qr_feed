"use client"

import { useActionState, useEffect, useState } from "react"
import { CheckboxGroup, FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { createRoleAction, deleteRoleAction, updateRoleAction } from "./actions"
import type { Option } from "./user-dialogs"

type RoleData = {
  id: string
  name: string
  description: string
  scope: "tenant" | "branch"
  permissions: string[]
}

function RoleForm({
  initial,
  permissions,
  allowTenantScope,
  onDone,
}: {
  initial?: RoleData
  permissions: Option[]
  allowTenantScope: boolean
  onDone: () => void
}) {
  const [state, action] = useActionState(initial ? updateRoleAction : createRoleAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormField
        label="Role name"
        name="name"
        defaultValue={initial?.name}
        placeholder="e.g. Housekeeping Lead"
        required
        state={state}
      />
      <FormField
        label="Description (optional)"
        name="description"
        defaultValue={initial?.description}
        placeholder="Short summary of what this role does"
        state={state}
      />
      <FormSelect
        label="Scope"
        name="scope"
        defaultValue={initial?.scope ?? "branch"}
        state={state}
        options={
          allowTenantScope
            ? [
                { value: "branch", label: "Branch-scoped (assigned branches only)" },
                { value: "tenant", label: "Organisation-wide (all branches)" },
              ]
            : [{ value: "branch", label: "Branch-scoped (assigned branches only)" }]
        }
      />
      <div className="max-h-60 overflow-y-auto rounded-lg border p-3">
        <CheckboxGroup
          legend="Permissions"
          name="permissions"
          options={permissions}
          defaultValue={initial?.permissions ?? ["ticket:read"]}
          state={state}
        />
      </div>
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>{initial ? "Save role" : "Create role"}</SubmitButton>
      </div>
    </form>
  )
}

export function CreateRoleDialog({
  permissions,
  allowTenantScope,
}: {
  permissions: Option[]
  allowTenantScope: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New custom role"
      description="Bundle permissions you hold into a reusable role for your team."
      trigger={
        <Button variant="outline" size="xl">
          <Icon name="plus" data-icon="inline-start" /> New role
        </Button>
      }
    >
      {open && (
        <RoleForm
          permissions={permissions}
          allowTenantScope={allowTenantScope}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}

export function CustomRoleActions({
  role,
  permissions,
  allowTenantScope,
}: {
  role: RoleData
  permissions: Option[]
  allowTenantScope: boolean
}) {
  const [open, setOpen] = useState(false)
  const swal = useSweetAlert()
  return (
    <div className="flex justify-end gap-1">
      <Modal
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`Edit ${role.name}`}
        trigger={
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        }
      >
        {open && (
          <RoleForm
            initial={role}
            permissions={permissions}
            allowTenantScope={allowTenantScope}
            onDone={() => setOpen(false)}
          />
        )}
      </Modal>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          swal.fire({
            tone: "warning",
            title: `Delete ${role.name}?`,
            text: "You can only delete roles that aren't assigned to any members or pending invites.",
            confirmText: "Delete",
            cancelText: "Keep it",
            confirmVariant: "destructive",
            onConfirm: async () => {
              const res = await deleteRoleAction(role.id)
              if (res && !res.ok) throw new Error(res.error.message)
            },
          })
        }
      >
        Delete
      </Button>
    </div>
  )
}
