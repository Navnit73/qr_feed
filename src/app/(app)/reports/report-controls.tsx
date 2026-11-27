"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { createSavedReportAction, deleteSavedReportAction, sendDigestNowAction } from "./actions"

export function SaveReportDialog({
  branches,
  defaultDays,
  defaultBranchId,
}: {
  branches: { value: string; label: string }[]
  defaultDays: number
  defaultBranchId?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Save report & email digest"
      description="Save a filter configuration and optionally schedule daily or weekly email digests."
      trigger={
        <Button size="lg">
          <Icon name="plus" data-icon="inline-start" /> Save / Schedule report
        </Button>
      }
    >
      {open && (
        <SaveReportForm
          branches={branches}
          defaultDays={defaultDays}
          defaultBranchId={defaultBranchId}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}

function SaveReportForm({
  branches,
  defaultDays,
  defaultBranchId,
  onDone,
}: {
  branches: { value: string; label: string }[]
  defaultDays: number
  defaultBranchId?: string
  onDone: () => void
}) {
  const [state, action] = useActionState(createSavedReportAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Report name"
        name="name"
        placeholder="Weekly GM Digest"
        required
        state={state}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Window"
          name="rangeDays"
          defaultValue={String(defaultDays)}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
          state={state}
        />
        <FormSelect
          label="Branch"
          name="branchId"
          defaultValue={defaultBranchId ?? ""}
          options={[{ value: "", label: "All branches" }, ...branches]}
          state={state}
        />
      </div>
      <FormSelect
        label="Email schedule"
        name="schedule"
        defaultValue="weekly"
        options={[
          { value: "none", label: "Saved view only (no email)" },
          { value: "daily", label: "Daily email digest" },
          { value: "weekly", label: "Weekly email digest" },
        ]}
        state={state}
      />
      <FormField
        label="Recipients (comma-separated emails)"
        name="recipients"
        placeholder="gm@hotel.com, quality@hotel.com"
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save report</SubmitButton>
      </div>
    </form>
  )
}

export function SavedReportActions({
  id,
  hasRecipients,
  canExport,
}: {
  id: string
  hasRecipients: boolean
  canExport: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null)
  const swal = useSweetAlert()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasRecipients && canExport && (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => {
            setNote(null)
            startTransition(async () => {
              const res = await sendDigestNowAction(id)
              if (res?.ok) setNote({ text: `Sent (${res.data.sentTo})`, isError: false })
              else if (res) setNote({ text: res.error.message, isError: true })
            })
          }}
        >
          Send now
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          swal.fire({
            tone: "warning",
            title: "Delete saved report?",
            text: "Any scheduled email digest for this report will also stop.",
            confirmText: "Delete",
            cancelText: "Keep it",
            confirmVariant: "destructive",
            onConfirm: async () => {
              const res = await deleteSavedReportAction(id)
              if (res && !res.ok) throw new Error(res.error.message)
            },
          })
        }
      >
        Delete
      </Button>
      {note && (
        <span className={note.isError ? "text-xs text-destructive" : "text-xs text-success"}>
          {note.text}
        </span>
      )}
    </div>
  )
}
