"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { childTypes, LOCATION_TYPE_LABELS, type LocationType } from "@/lib/location-tree"
import {
  archiveLocationAction,
  createBranchAction,
  createLocationAction,
  renameLocationAction,
} from "./actions"

/** Closes the dialog once the action succeeds. Forms mount fresh on every open. */
function useCloseOnSuccess(state: { ok: boolean } | null, onDone: () => void) {
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
}

function DialogButtons({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
        Cancel
      </Button>
      <SubmitButton>{submit}</SubmitButton>
    </div>
  )
}

function AddBranchForm({ timeZones, onDone }: { timeZones: string[]; onDone: () => void }) {
  const [state, action] = useActionState(createBranchAction, null)
  useCloseOnSuccess(state, onDone)
  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Branch name"
        name="name"
        placeholder="Hotel Mumbai"
        required
        state={state}
      />
      <FormSelect
        label="Time zone"
        name="timezone"
        defaultValue="Asia/Kolkata"
        state={state}
        options={timeZones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
      />
      <FormField label="Address (optional)" name="address" state={state} />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Add branch" />
    </form>
  )
}

export function AddBranchDialog({ timeZones }: { timeZones: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add branch"
      description="A branch is one site: a hotel, clinic, mall or plant."
      trigger={
        <Button size="xl">
          <Icon name="branch" data-icon="inline-start" /> Add branch
        </Button>
      }
    >
      {open && <AddBranchForm timeZones={timeZones} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

export type ParentOption = { id: string; label: string; type: LocationType }

function AddLocationForm({
  branchId,
  parents,
  onDone,
}: {
  branchId: string
  parents: ParentOption[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createLocationAction, null)
  useCloseOnSuccess(state, onDone)
  const [parentId, setParentId] = useState("")
  const parentType = parents.find((p) => p.id === parentId)?.type ?? null
  const types = useMemo(() => childTypes(parentType), [parentType])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <FormSelect
        label="Inside"
        name="parentId"
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        state={state}
        options={[
          { value: "", label: "Top level (the branch itself)" },
          ...parents
            .filter((p) => childTypes(p.type).length)
            .map((p) => ({ value: p.id, label: p.label })),
        ]}
      />
      <FormSelect
        // Remount when the parent changes so the first allowed type is selected.
        key={parentType ?? "root"}
        label="Type"
        name="type"
        state={state}
        options={types.map((t) => ({ value: t, label: LOCATION_TYPE_LABELS[t] }))}
      />
      <FormField label="Name" name="name" placeholder="Washroom F2" required state={state} />
      <FormField
        label="Code (optional)"
        name="code"
        placeholder="WC-F2"
        hint="A short ID printed under the QR code."
        state={state}
      />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Add location" />
    </form>
  )
}

export function AddLocationDialog({
  branchId,
  parents,
}: {
  branchId: string
  parents: ParentOption[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add location"
      description="Buildings hold floors, floors hold departments, and any of them can hold locations."
      trigger={
        <Button size="xl">
          <Icon name="location" data-icon="inline-start" /> Add location
        </Button>
      }
    >
      {open && (
        <AddLocationForm branchId={branchId} parents={parents} onDone={() => setOpen(false)} />
      )}
    </Modal>
  )
}

function RenameForm({
  id,
  branchId,
  name,
  onDone,
}: {
  id: string
  branchId: string
  name: string
  onDone: () => void
}) {
  const [state, action] = useActionState(renameLocationAction, null)
  useCloseOnSuccess(state, onDone)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="branchId" value={branchId} />
      <FormField label="Name" name="name" defaultValue={name} required state={state} />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Rename" />
    </form>
  )
}

/** Rename and archive controls for one tree node. */
export function LocationActions({
  id,
  branchId,
  name,
}: {
  id: string
  branchId: string
  name: string
}) {
  const [open, setOpen] = useState(false)
  const swal = useSweetAlert()
  return (
    <div className="flex shrink-0 gap-1">
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Rename ${name}`}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Rename ${name}`}>
            Rename
          </Button>
        }
      >
        {open && (
          <RenameForm id={id} branchId={branchId} name={name} onDone={() => setOpen(false)} />
        )}
      </Modal>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Archive ${name}`}
        onClick={() =>
          swal.fire({
            tone: "warning",
            title: `Archive ${name}?`,
            text: "It disappears from the tree. Its history stays in the audit log.",
            confirmText: "Archive",
            cancelText: "Keep it",
            confirmVariant: "destructive",
            onConfirm: async () => {
              const res = await archiveLocationAction(id, branchId)
              if (res && !res.ok) throw new Error(res.error.message)
            },
          })
        }
      >
        Archive
      </Button>
    </div>
  )
}
