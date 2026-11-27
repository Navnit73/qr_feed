"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormMessage, FormTextarea, SubmitButton } from "@/components/form"
import { Modal } from "@/components/modal"
import { PhotoUpload } from "@/components/photo-upload"
import { Button } from "@/components/ui/button"
import { quickTransitionAction, transitionTicketAction } from "@/app/(app)/tickets/actions"

/** One-tap Accept / Start / Resume / Submit buttons for staff on /my-work (phase.md §8). */
export function MyWorkQuickButtons({
  ticketId,
  ticketNumber,
  branchId,
  status,
}: {
  ticketId: string
  ticketNumber: string
  branchId: string
  status: string
}) {
  const [pending, startTransition] = useTransition()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function act(type: "accept" | "start" | "resume") {
    setError(null)
    startTransition(async () => {
      const res = await quickTransitionAction(ticketId, { type })
      if (res && !res.ok) setError(res.error.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "new" || status === "assigned") && (
        <Button size="lg" loading={pending} onClick={() => act("accept")}>
          Accept
        </Button>
      )}
      {(status === "accepted" || status === "reopened") && (
        <Button size="lg" loading={pending} onClick={() => act("start")}>
          Start work
        </Button>
      )}
      {status === "on_hold" && (
        <Button size="lg" loading={pending} onClick={() => act("resume")}>
          Resume
        </Button>
      )}
      {status === "in_progress" && (
        <Modal
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          title={`Submit ${ticketNumber} for verification`}
          description="Summarise what was fixed and attach optional completion photos."
          trigger={<Button size="lg">Submit for verification</Button>}
        >
          {submitOpen && (
            <QuickSubmitForm
              ticketId={ticketId}
              branchId={branchId}
              onDone={() => setSubmitOpen(false)}
            />
          )}
        </Modal>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function QuickSubmitForm({
  ticketId,
  branchId,
  onDone,
}: {
  ticketId: string
  branchId: string
  onDone: () => void
}) {
  const [state, action] = useActionState(transitionTicketAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="type" value="submit" />
      <FormTextarea
        label="Resolution summary"
        name="note"
        required
        placeholder="What was repaired, cleaned or resolved?"
        state={state}
      />
      <PhotoUpload
        mode="staff"
        scope="ticket"
        branchId={branchId}
        entityId={ticketId}
        maxFiles={3}
        label="Resolution photos (optional)"
      />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Submit for verification</SubmitButton>
      </div>
    </form>
  )
}
