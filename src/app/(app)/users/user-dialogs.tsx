"use client"

import { useActionState, useEffect, useState } from "react"
import { CheckboxGroup, FormField, FormMessage, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  inviteAction,
  revokeInviteAction,
  setMemberStatusAction,
  updateAccessAction,
} from "./actions"

export type Option = { value: string; label: string; description?: string }

function InviteForm({
  roles,
  branches,
  onDone,
}: {
  roles: Option[]
  branches: Option[]
  onDone: () => void
}) {
  const [state, action] = useActionState(inviteAction, null)
  const [copied, setCopied] = useState(false)

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Send this link to your teammate. It works once and expires in 7 days.
        </p>
        <div className="space-y-2">
          <Label htmlFor="invite-link">Invite link</Label>
          <div className="flex gap-2">
            <Input
              id="invite-link"
              readOnly
              value={state.data.link}
              className="h-11 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="xl"
              onClick={async () => {
                await navigator.clipboard.writeText(state.data.link)
                setCopied(true)
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="xl" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="name@company.com"
        required
        state={state}
      />
      <CheckboxGroup legend="Roles" name="roles" options={roles} state={state} />
      {branches.length > 0 && (
        <CheckboxGroup
          legend="Branches"
          name="branchIds"
          options={branches}
          state={state}
          hint="Branch roles (L1–L3, branch admin) only see these branches."
        />
      )}
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Send invite</SubmitButton>
      </div>
    </form>
  )
}

export function InviteDialog({ roles, branches }: { roles: Option[]; branches: Option[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Invite people"
      description="They'll get access to this organisation with the roles you pick."
      trigger={
        <Button size="xl">
          <Icon name="users" data-icon="inline-start" /> Invite people
        </Button>
      }
    >
      {open && <InviteForm roles={roles} branches={branches} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function AccessForm({
  memberId,
  current,
  roles,
  branches,
  onDone,
}: {
  memberId: string
  current: { roles: string[]; branchIds: string[] }
  roles: Option[]
  branches: Option[]
  onDone: () => void
}) {
  const [state, action] = useActionState(updateAccessAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={memberId} />
      <CheckboxGroup
        legend="Roles"
        name="roles"
        options={roles}
        defaultValue={current.roles}
        state={state}
      />
      {branches.length > 0 && (
        <CheckboxGroup
          legend="Branches"
          name="branchIds"
          options={branches}
          defaultValue={current.branchIds}
          state={state}
        />
      )}
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save access</SubmitButton>
      </div>
    </form>
  )
}

export function MemberActions({
  memberId,
  name,
  status,
  current,
  roles,
  branches,
}: {
  memberId: string
  name: string
  status: "active" | "inactive"
  current: { roles: string[]; branchIds: string[] }
  roles: Option[]
  branches: Option[]
}) {
  const [open, setOpen] = useState(false)
  const swal = useSweetAlert()
  const deactivating = status === "active"
  return (
    <div className="flex justify-end gap-1">
      <Modal
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`Access for ${name}`}
        trigger={
          <Button variant="ghost" size="sm">
            Edit access
          </Button>
        }
      >
        {open && (
          <AccessForm
            memberId={memberId}
            current={current}
            roles={roles}
            branches={branches}
            onDone={() => setOpen(false)}
          />
        )}
      </Modal>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          swal.fire({
            tone: deactivating ? "warning" : "question",
            title: deactivating ? `Deactivate ${name}?` : `Reactivate ${name}?`,
            text: deactivating
              ? "They're signed out of this organisation at once. Their history stays."
              : "They get their previous roles back.",
            confirmText: deactivating ? "Deactivate" : "Reactivate",
            cancelText: "Cancel",
            confirmVariant: deactivating ? "destructive" : "default",
            onConfirm: async () => {
              const res = await setMemberStatusAction(
                memberId,
                deactivating ? "inactive" : "active",
              )
              if (res && !res.ok) throw new Error(res.error.message)
            },
          })
        }
      >
        {deactivating ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  )
}

export function RevokeInviteButton({ id, email }: { id: string; email: string }) {
  const swal = useSweetAlert()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        swal.fire({
          tone: "warning",
          title: `Revoke the invite for ${email}?`,
          text: "The link stops working straight away.",
          confirmText: "Revoke",
          cancelText: "Keep it",
          confirmVariant: "destructive",
          onConfirm: async () => {
            const res = await revokeInviteAction(id)
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      Revoke
    </Button>
  )
}
