"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import {
  createAuditTemplateAction,
  deleteAuditTemplateAction,
  scheduleAuditAction,
} from "./actions"

type Opt = { value: string; label: string }

export function CreateTemplateDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New audit checklist template"
      description="Enter one question per line using `Clause | Section | Question` format."
      trigger={
        <Button variant="outline" size="xl">
          <Icon name="plus" data-icon="inline-start" /> New template
        </Button>
      }
    >
      {open && <TemplateForm onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function TemplateForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createAuditTemplateAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Template name"
          name="name"
          placeholder="e.g. NABH Infection Control Walk"
          required
          state={state}
        />
        <FormField
          label="Standard"
          name="standard"
          placeholder="e.g. NABH / ISO 9001 / HACCP"
          required
          state={state}
        />
      </div>
      <FormField label="Description (optional)" name="description" state={state} />
      <FormTextarea
        label="Checklist items (one per line: Clause | Section | Question)"
        name="questions"
        rows={6}
        defaultValue={
          "7.1.5 | Equipment | Are calibration stickers current?\n8.5.1 | Operations | Are SOPs visible at the station?\n10.2 | Quality | Are non-conformities clearly quarantined?"
        }
        required
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save template</SubmitButton>
      </div>
    </form>
  )
}

export function ScheduleAuditDialog({
  branches,
  templates,
  auditors = [],
}: {
  branches: Opt[]
  templates: Opt[]
  auditors?: Opt[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (branches.length === 0 || templates.length === 0) return null

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Schedule audit"
      description="Run a standalone compliance or internal audit without any QR code involved."
      trigger={
        <Button size="xl">
          <Icon name="audit" data-icon="inline-start" /> Schedule audit
        </Button>
      }
    >
      {open && (
        <ScheduleAuditForm
          branches={branches}
          templates={templates}
          auditors={auditors}
          onDone={(id) => {
            setOpen(false)
            if (id) router.push(`/audits/${id}`)
          }}
        />
      )}
    </Modal>
  )
}

function ScheduleAuditForm({
  branches,
  templates,
  auditors,
  onDone,
}: {
  branches: Opt[]
  templates: Opt[]
  auditors: Opt[]
  onDone: (id?: string) => void
}) {
  const [state, action] = useActionState(scheduleAuditAction, null)
  useEffect(() => {
    if (state?.ok) onDone(state.data.id)
  }, [state, onDone])

  const today = new Date().toISOString().slice(0, 10)
  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Audit title"
        name="title"
        placeholder="e.g. Monthly Hygiene & Safety Audit"
        required
        state={state}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect label="Branch" name="branchId" options={branches} state={state} />
        <FormSelect
          label="Checklist template"
          name="templateId"
          options={templates}
          state={state}
        />
      </div>
      {auditors.length > 0 && (
        <FormSelect
          label="Assigned auditor"
          name="auditorId"
          options={[{ value: "", label: "Myself" }, ...auditors]}
          state={state}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Scheduled date"
          name="scheduledAt"
          type="date"
          defaultValue={today}
          required
          state={state}
        />
        <FormSelect
          label="Recurrence"
          name="recurrence"
          defaultValue="monthly"
          options={[
            { value: "once", label: "One-off" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
          ]}
          state={state}
        />
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <SubmitButton>Schedule audit</SubmitButton>
      </div>
    </form>
  )
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const swal = useSweetAlert()
  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground hover:text-destructive"
      onClick={() =>
        swal.fire({
          tone: "warning",
          title: `Delete template "${name}"?`,
          text: "Existing audit runs keep their snapshot checklist; this template won't appear for new audits.",
          confirmText: "Delete",
          cancelText: "Keep it",
          confirmVariant: "destructive",
          onConfirm: async () => {
            const res = await deleteAuditTemplateAction(id)
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      Delete
    </Button>
  )
}
