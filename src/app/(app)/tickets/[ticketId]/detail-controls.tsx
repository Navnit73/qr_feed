"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { PhotoUpload } from "@/components/photo-upload"
import { Button } from "@/components/ui/button"
import type { TicketEventType } from "@/lib/ticket-state-machine"
import {
  addCommentAction,
  quickTransitionAction,
  transitionTicketAction,
  updateTagsAction,
} from "../actions"

export function TicketActionToolbar({
  ticketId,
  branchId,
  events,
  requiresEvidence,
}: {
  ticketId: string
  branchId: string
  events: TicketEventType[]
  requiresEvidence: boolean
}) {
  const [modalEvent, setModalEvent] = useState<TicketEventType | null>(null)
  const [pending, startTransition] = useTransition()
  const [quickErr, setQuickErr] = useState<string | null>(null)

  function runQuick(type: "accept" | "start" | "resume") {
    setQuickErr(null)
    startTransition(async () => {
      const res = await quickTransitionAction(ticketId, { type })
      if (res && !res.ok) setQuickErr(res.error.message)
    })
  }

  const labelOf: Record<TicketEventType, string> = {
    assign: "Assign",
    accept: "Accept",
    reject: "Reject",
    start: "Start work",
    hold: "Put on hold",
    resume: "Resume work",
    submit: "Submit for verification",
    verify_close: "Approve & close",
    reopen: "Reopen",
    cancel: "Cancel ticket",
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {events.map((ev) => {
          if (ev === "accept" || ev === "start" || ev === "resume") {
            return (
              <Button
                key={ev}
                size="lg"
                variant={
                  ev === "accept" || ev === "start" || ev === "resume" ? "default" : "outline"
                }
                loading={pending}
                onClick={() => runQuick(ev)}
              >
                <Icon name={ev === "accept" ? "check" : "play"} data-icon="inline-start" />
                {labelOf[ev]}
              </Button>
            )
          }

          const variant =
            ev === "submit" || ev === "verify_close"
              ? "default"
              : ev === "cancel" || ev === "reject"
                ? "destructive"
                : ev === "hold" || ev === "reopen"
                  ? "warning"
                  : "outline"

          return (
            <Button key={ev} size="lg" variant={variant} onClick={() => setModalEvent(ev)}>
              {labelOf[ev]}
            </Button>
          )
        })}
      </div>

      {quickErr && <p className="text-sm text-destructive">{quickErr}</p>}

      <Modal
        open={modalEvent !== null}
        onOpenChange={(open) => {
          if (!open) setModalEvent(null)
        }}
        title={modalEvent ? labelOf[modalEvent] : ""}
      >
        {modalEvent && (
          <TransitionModalForm
            ticketId={ticketId}
            branchId={branchId}
            event={modalEvent}
            requiresEvidence={requiresEvidence}
            onDone={() => setModalEvent(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function TransitionModalForm({
  ticketId,
  branchId,
  event,
  requiresEvidence,
  onDone,
}: {
  ticketId: string
  branchId: string
  event: TicketEventType
  requiresEvidence: boolean
  onDone: () => void
}) {
  const [state, action] = useActionState(transitionTicketAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  const needsReason =
    event === "hold" || event === "reject" || event === "reopen" || event === "cancel"
  const needsNote = event === "submit" || event === "verify_close"

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="type" value={event} />

      {needsReason && (
        <FormTextarea
          label={event === "cancel" ? "Reason (optional)" : "Reason"}
          name="reason"
          required={event !== "cancel"}
          placeholder={
            event === "hold"
              ? "e.g. Waiting for replacement parts"
              : event === "reopen"
                ? "Explain what still needs fixing…"
                : "Give a clear reason…"
          }
          state={state}
        />
      )}

      {event === "cancel" && (
        <FormField
          label="Duplicate of ticket # (optional)"
          name="duplicateOf"
          placeholder="TKT-2026-000012"
          state={state}
        />
      )}

      {needsNote && (
        <FormTextarea
          label={event === "submit" ? "Resolution summary" : "Verification note (optional)"}
          name="note"
          required={event === "submit"}
          placeholder={
            event === "submit"
              ? "What was repaired, cleaned or resolved?"
              : "Confirmed fixed on inspection."
          }
          state={state}
        />
      )}

      {event === "submit" && (
        <PhotoUpload
          mode="staff"
          scope="ticket"
          branchId={branchId}
          entityId={ticketId}
          maxFiles={3}
          label={requiresEvidence ? "Resolution photos (required)" : "Resolution photos (optional)"}
          hint={
            requiresEvidence
              ? "This category requires at least one photo proving the fix."
              : "Optional proof of completion."
          }
        />
      )}

      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Confirm</SubmitButton>
      </div>
    </form>
  )
}

export function AssignDialog({
  ticketId,
  currentAssigneeId,
  members,
}: {
  ticketId: string
  currentAssigneeId: string | null
  members: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={currentAssigneeId ? "Reassign ticket" : "Assign ticket"}
      description={
        currentAssigneeId
          ? "Reassignment requires a reason and is recorded in the timeline."
          : "Choose who owns this ticket."
      }
      trigger={
        <Button variant="outline" size="sm">
          {currentAssigneeId ? "Reassign" : "Assign"}
        </Button>
      }
    >
      {open && (
        <AssignForm
          ticketId={ticketId}
          currentAssigneeId={currentAssigneeId}
          members={members}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}

function AssignForm({
  ticketId,
  currentAssigneeId,
  members,
  onDone,
}: {
  ticketId: string
  currentAssigneeId: string | null
  members: { value: string; label: string }[]
  onDone: () => void
}) {
  const [state, action] = useActionState(transitionTicketAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="type" value="assign" />
      <FormSelect
        label="Assignee"
        name="assigneeId"
        defaultValue={currentAssigneeId ?? ""}
        options={[{ value: "", label: "Select teammate…" }, ...members]}
        required
        state={state}
      />
      {currentAssigneeId && (
        <FormTextarea
          label="Reason for reassignment"
          name="reason"
          required
          placeholder="e.g. Shift change / specialist needed"
          state={state}
        />
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  )
}

export function CommentComposer({ ticketId, branchId }: { ticketId: string; branchId: string }) {
  const [resetKey, setResetKey] = useState(0)
  const [state, action] = useActionState(
    async (prev: Awaited<ReturnType<typeof addCommentAction>>, fd: FormData) => {
      const res = await addCommentAction(prev, fd)
      if (res?.ok) setResetKey((k) => k + 1)
      return res
    },
    null,
  )

  return (
    <form key={resetKey} action={action} className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormTextarea
        label="Add a remark"
        name="body"
        placeholder="Share progress notes, findings or an update for the reporter…"
        required
        state={state}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="visibility"
            value="internal"
            defaultChecked
            className="accent-(--primary)"
          />
          <span>Internal (staff only)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="visibility" value="public" className="accent-(--primary)" />
          <span>Public (visible on tracking link)</span>
        </label>
      </div>
      <PhotoUpload
        mode="staff"
        scope="comment"
        branchId={branchId}
        entityId={ticketId}
        maxFiles={3}
        label="Attach photos"
        hint="Optional images attached to this remark."
      />
      <FormMessage state={state} success="Remark added." />
      <div className="flex justify-end">
        <SubmitButton size="lg">Post remark</SubmitButton>
      </div>
    </form>
  )
}

export function TagsEditor({ ticketId, initial }: { ticketId: string; initial: string[] }) {
  const [state, action] = useActionState(updateTagsAction, null)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField
        label="Tags"
        name="tags"
        defaultValue={initial.join(", ")}
        placeholder="plumbing, urgent, vip"
        hint="Comma-separated"
        state={state}
      />
      <Button type="submit" variant="outline" size="sm">
        Update tags
      </Button>
    </form>
  )
}
