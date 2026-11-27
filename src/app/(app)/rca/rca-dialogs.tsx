"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { createRcaAction } from "./actions"

export function CreateRcaDialog({
  defaultOpen = false,
  sourceTicket,
}: {
  defaultOpen?: boolean
  sourceTicket?: { id: string; number: string; title: string; description: string } | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [activeTicket, setActiveTicket] = useState(sourceTicket ?? null)
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setActiveTicket(null)
      }}
      size="lg"
      title={activeTicket ? `Convert ${activeTicket.number} to RCA` : "New Root Cause Analysis"}
      description="Investigate systemic or repeat issues with 5 Whys, Fishbone (6M) and CAPA actions."
      trigger={
        <Button size="xl">
          <Icon name="rca" data-icon="inline-start" /> New RCA
        </Button>
      }
    >
      {open && (
        <CreateRcaForm
          sourceTicket={activeTicket}
          onDone={(id) => {
            setOpen(false)
            setActiveTicket(null)
            if (id) router.push(`/rca/${id}`)
          }}
        />
      )}
    </Modal>
  )
}

function CreateRcaForm({
  sourceTicket,
  onDone,
}: {
  sourceTicket?: { id: string; number: string; title: string; description: string } | null
  onDone: (id?: string) => void
}) {
  const [state, action] = useActionState(createRcaAction, null)
  useEffect(() => {
    if (state?.ok) onDone(state.data.id)
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {sourceTicket && <input type="hidden" name="sourceTicketId" value={sourceTicket.id} />}
      <FormField
        label="Title"
        name="title"
        defaultValue={sourceTicket?.title ?? ""}
        placeholder="e.g. Recurring wet floor outside OT-2"
        required
        state={state}
      />
      <FormSelect
        label="Analysis method"
        name="method"
        defaultValue="5why"
        options={[
          { value: "5why", label: "5 Whys" },
          { value: "fishbone", label: "Fishbone (Ishikawa 6M)" },
          { value: "8d", label: "8D Problem Solving" },
        ]}
        state={state}
      />
      <FormTextarea
        label="Problem statement"
        name="problemStatement"
        defaultValue={sourceTicket?.description ?? ""}
        placeholder="What happened, where, how often, and what was the impact?"
        required
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <SubmitButton>Create RCA</SubmitButton>
      </div>
    </form>
  )
}
