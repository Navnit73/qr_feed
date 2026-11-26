"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormMessage, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { quickTransitionAction, transitionTicketAction } from "@/app/(app)/tickets/actions"

export function VerifyQueueControls({
  ticketId,
  ticketNumber,
}: {
  ticketId: string
  ticketNumber: string
}) {
  const [reopenOpen, setReopenOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function approve() {
    setError(null)
    startTransition(async () => {
      const res = await quickTransitionAction(ticketId, {
        type: "verify_close",
        note: "Verified and approved.",
      })
      if (res && !res.ok) setError(res.error.message)
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" loading={pending} onClick={approve}>
          <Icon name="verify" data-icon="inline-start" /> Approve &amp; close
        </Button>
        <Modal
          open={reopenOpen}
          onOpenChange={setReopenOpen}
          title={`Reopen ${ticketNumber}`}
          description="Give clear instructions so staff know what still needs work."
          trigger={
            <Button variant="warning" size="lg">
              <Icon name="reopen" data-icon="inline-start" /> Reopen
            </Button>
          }
        >
          {reopenOpen && <ReopenForm ticketId={ticketId} onDone={() => setReopenOpen(false)} />}
        </Modal>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ReopenForm({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const [state, action] = useActionState(transitionTicketAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="type" value="reopen" />
      <FormTextarea
        label="What still needs work?"
        name="reason"
        required
        placeholder="e.g. Floor is still slippery near stall 2; please dry and re-check."
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Reopen ticket</SubmitButton>
      </div>
    </form>
  )
}
