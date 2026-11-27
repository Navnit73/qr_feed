"use client"

import { useActionState, useEffect, useState } from "react"
import { CheckboxGroup, FormField, FormMessage, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  createUserAction,
  inviteAction,
  revokeInviteAction,
  setMemberStatusAction,
  updateAccessAction,
} from "./actions"

export type Option = { value: string; label: string; description?: string }

/** Sidebar menus the person will see. Dashboard is always on; roles still gate each page. */
function MenuAccessField({
  menus,
  defaultValue,
  state,
}: {
  menus: Option[]
  defaultValue: string[]
  state: Parameters<typeof CheckboxGroup>[0]["state"]
}) {
  return (
    <CheckboxGroup
      legend="Sidebar menus"
      name="menus"
      options={menus}
      defaultValue={defaultValue}
      state={state}
      hint="Dashboard is always shown. A menu only appears if their roles also allow that page; switched-off menus can't be opened by URL either."
    />
  )
}

function AccessFields({
  roles,
  branches,
  menus,
  state,
}: {
  roles: Option[]
  branches: Option[]
  menus: Option[]
  state: Parameters<typeof CheckboxGroup>[0]["state"]
}) {
  return (
    <>
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
      <MenuAccessField menus={menus} defaultValue={menus.map((m) => m.value)} state={state} />
    </>
  )
}

function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
        Cancel
      </Button>
      <SubmitButton>{submit}</SubmitButton>
    </div>
  )
}

/** 16 characters from an unambiguous alphabet; the admin passes it on out of band. */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?"
  const bytes = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("")
}

function PasswordUserForm({
  roles,
  branches,
  menus,
  onDone,
}: {
  roles: Option[]
  branches: Option[]
  menus: Option[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createUserAction, null)
  const [password, setPassword] = useState("")
  const [copied, setCopied] = useState(false)

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <Icon name="check" />
          <AlertTitle>User created</AlertTitle>
          <AlertDescription>
            {state.data.email} can sign in now with the password you set. Share it with them
            privately; they can change it later with &ldquo;Forgot password&rdquo;.
          </AlertDescription>
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="xl"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `Email: ${state.data.email}\nPassword: ${password}\nSign in: ${location.origin}/sign-in`,
                )
                setCopied(true)
              } catch {
                // Clipboard access denied or unavailable
              }
            }}
          >
            {copied ? "Copied" : "Copy sign-in details"}
          </Button>
          <Button size="xl" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <FormField label="Full name" name="name" autoComplete="off" required state={state} />
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="name@company.com"
        autoComplete="off"
        required
        state={state}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        revealable
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 10 characters."
        labelAction={
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setPassword(generatePassword())}
          >
            Generate
          </Button>
        }
        state={state}
      />
      <AccessFields roles={roles} branches={branches} menus={menus} state={state} />
      <FormMessage state={state} />
      <FormActions onCancel={onDone} submit="Create user" />
    </form>
  )
}

function InviteForm({
  roles,
  branches,
  menus,
  onDone,
}: {
  roles: Option[]
  branches: Option[]
  menus: Option[]
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
                try {
                  await navigator.clipboard.writeText(state.data.link)
                  setCopied(true)
                } catch {
                  // Clipboard access denied or unavailable
                }
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
      <AccessFields roles={roles} branches={branches} menus={menus} state={state} />
      <FormMessage state={state} />
      <FormActions onCancel={onDone} submit="Send invite" />
    </form>
  )
}

type AddMode = "password" | "invite"
const ADD_MODES: { value: AddMode; label: string; description: string }[] = [
  { value: "password", label: "Set a password", description: "They can sign in right away." },
  { value: "invite", label: "Send invite link", description: "They choose their own password." },
]

export function AddUserDialog({
  roles,
  branches,
  menus,
}: {
  roles: Option[]
  branches: Option[]
  menus: Option[]
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AddMode>("password")
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setMode("password")
      }}
      size="lg"
      title="Add user"
      description="Give them access to this organisation with the roles and menus you pick."
      trigger={
        <Button size="xl">
          <Icon name="users" data-icon="inline-start" /> Add user
        </Button>
      }
    >
      {open && (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="How to add them" className="grid gap-2 sm:grid-cols-2">
            {ADD_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "min-h-11 rounded-lg border p-3 text-left text-sm transition-colors",
                  mode === m.value ? "border-primary bg-primary/5" : "hover:bg-accent",
                )}
              >
                <span className="block font-medium">{m.label}</span>
                <span className="block text-muted-foreground">{m.description}</span>
              </button>
            ))}
          </div>
          {mode === "password" ? (
            <PasswordUserForm
              roles={roles}
              branches={branches}
              menus={menus}
              onDone={() => setOpen(false)}
            />
          ) : (
            <InviteForm
              roles={roles}
              branches={branches}
              menus={menus}
              onDone={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

function AccessForm({
  memberId,
  current,
  roles,
  branches,
  menus,
  onDone,
}: {
  memberId: string
  current: { roles: string[]; branchIds: string[]; phone?: string; menus: string[] }
  roles: Option[]
  branches: Option[]
  menus: Option[]
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
      <MenuAccessField menus={menus} defaultValue={current.menus} state={state} />
      <FormField
        label="Phone (optional, for SMS/WhatsApp escalations)"
        name="phone"
        type="tel"
        defaultValue={current.phone ?? ""}
        placeholder="+91 98765 43210"
        state={state}
      />
      <FormMessage state={state} />
      <FormActions onCancel={onDone} submit="Save access" />
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
  menus,
}: {
  memberId: string
  name: string
  status: "active" | "inactive"
  current: { roles: string[]; branchIds: string[]; phone?: string; menus: string[] }
  roles: Option[]
  branches: Option[]
  menus: Option[]
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
            menus={menus}
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
