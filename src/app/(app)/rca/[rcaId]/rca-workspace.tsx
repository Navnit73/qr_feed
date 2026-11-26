"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  createCapaAction,
  setCapaActionStatusAction,
  signApprovalAction,
  updateRcaAnalysisAction,
  verifyEffectivenessAction,
} from "../actions"

export type RcaWorkspaceData = {
  id: string
  method: "5why" | "fishbone" | "8d"
  problemStatement: string
  whys: string[]
  fishbone: {
    man: string[]
    machine: string[]
    method: string[]
    material: string[]
    measurement: string[]
    environment: string[]
  }
  contributingFactors: string[]
  rootCause: string
}

export function AnalysisForm({ data, editable }: { data: RcaWorkspaceData; editable: boolean }) {
  const [state, action] = useActionState(updateRcaAnalysisAction, null)
  const categories: { key: keyof RcaWorkspaceData["fishbone"]; label: string }[] = [
    { key: "man", label: "Man (People)" },
    { key: "machine", label: "Machine (Equipment)" },
    { key: "method", label: "Method (Process/SOP)" },
    { key: "material", label: "Material (Supplies)" },
    { key: "measurement", label: "Measurement (Checks)" },
    { key: "environment", label: "Environment (Space)" },
  ]

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="rcaId" value={data.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          label="Primary method"
          name="method"
          defaultValue={data.method}
          disabled={!editable}
          options={[
            { value: "5why", label: "5 Whys" },
            { value: "fishbone", label: "Fishbone (Ishikawa 6M)" },
            { value: "8d", label: "8D Problem Solving" },
          ]}
          state={state}
        />
      </div>

      <FormTextarea
        label="1. Problem statement"
        name="problemStatement"
        defaultValue={data.problemStatement}
        disabled={!editable}
        required
        state={state}
      />

      {/* 5 Whys builder */}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">2. 5 Whys analysis</p>
        {[0, 1, 2, 3, 4].map((idx) => (
          <FormField
            key={idx}
            label={`Why #${idx + 1}`}
            name={`why${idx + 1}`}
            defaultValue={data.whys[idx] ?? ""}
            disabled={!editable}
            placeholder={idx === 0 ? "Why did the issue occur?" : "And why did that happen?"}
            state={state}
          />
        ))}
      </div>

      {/* Fishbone 6M builder */}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">3. Fishbone (Ishikawa 6M — one cause per line)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <FormTextarea
              key={cat.key}
              label={cat.label}
              name={`fb_${cat.key}`}
              rows={3}
              defaultValue={data.fishbone[cat.key].join("\n")}
              disabled={!editable}
              placeholder="One cause per line"
              state={state}
            />
          ))}
        </div>
      </div>

      <FormTextarea
        label="Contributing factors (one per line)"
        name="contributingFactors"
        rows={3}
        defaultValue={data.contributingFactors.join("\n")}
        disabled={!editable}
        state={state}
      />

      <FormTextarea
        label="4. Root cause statement"
        name="rootCause"
        rows={3}
        defaultValue={data.rootCause}
        disabled={!editable}
        placeholder="Summarise the verified underlying root cause…"
        state={state}
      />

      <FormMessage state={state} success="Analysis saved." />
      {editable && <SubmitButton size="lg">Save analysis</SubmitButton>}
    </form>
  )
}

export function AddCapaDialog({
  rcaId,
  members,
}: {
  rcaId: string
  members: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New CAPA plan"
      description="Create correction, corrective or preventive actions with owners, due dates and effectiveness checks."
      trigger={
        <Button size="lg">
          <Icon name="plus" data-icon="inline-start" /> Add CAPA
        </Button>
      }
    >
      {open && <AddCapaForm rcaId={rcaId} members={members} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function AddCapaForm({
  rcaId,
  members,
  onDone,
}: {
  rcaId: string
  members: { value: string; label: string }[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createCapaAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  const [defaultDue] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  )

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rcaId" value={rcaId} />
      <FormField
        label="CAPA title"
        name="title"
        placeholder="e.g. Dry-pass SOP & extra microfibre stock"
        required
        state={state}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Type"
          name="type"
          defaultValue="corrective"
          options={[
            { value: "correction", label: "Correction (immediate containment)" },
            { value: "corrective", label: "Corrective action" },
            { value: "preventive", label: "Preventive action" },
          ]}
          state={state}
        />
        <FormSelect label="Action owner" name="ownerId" options={members} state={state} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Action due date"
          name="dueDate"
          type="date"
          defaultValue={defaultDue}
          required
          state={state}
        />
        <FormField
          label="Effectiveness check in (days)"
          name="effectivenessDueDays"
          type="number"
          min={1}
          max={365}
          defaultValue={30}
          state={state}
        />
      </div>
      <FormField
        label="Effectiveness verification method"
        name="effectivenessMethod"
        defaultValue="30-day recurrence check + spot inspection"
        state={state}
      />
      <FormTextarea
        label="Action items (one per line)"
        name="actionTitles"
        placeholder={
          "Stock spare dry mops on Floor 2\nTrain shift supervisors on post-mop checklist"
        }
        required
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Create CAPA</SubmitButton>
      </div>
    </form>
  )
}

export function CapaActionStatusButton({
  rcaId,
  capaId,
  actionId,
  status,
}: {
  rcaId: string
  capaId: string
  actionId: string
  status: "open" | "in_progress" | "completed" | "verified"
}) {
  const [pending, startTransition] = useTransition()
  if (status === "completed" || status === "verified") {
    return <Badge variant="success">{status}</Badge>
  }
  const next = status === "open" ? "in_progress" : "completed"
  return (
    <Button
      size="sm"
      variant={next === "completed" ? "default" : "outline"}
      loading={pending}
      onClick={() =>
        startTransition(() => void setCapaActionStatusAction(rcaId, capaId, actionId, next))
      }
    >
      {next === "in_progress" ? "Start" : "Mark complete"}
    </Button>
  )
}

export function EffectivenessDialog({
  rcaId,
  capaId,
  capaNumber,
  suggestedRecurrenceCount,
}: {
  rcaId: string
  capaId: string
  capaNumber: string
  suggestedRecurrenceCount: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`Verify effectiveness · ${capaNumber}`}
      description={`System recurrence check found ${suggestedRecurrenceCount} repeat ticket(s) at the same location/category since creation.`}
      trigger={
        <Button size="sm" variant="secondary">
          <Icon name="verify" data-icon="inline-start" /> Verify effectiveness
        </Button>
      }
    >
      {open && (
        <EffectivenessForm
          rcaId={rcaId}
          capaId={capaId}
          defaultRecurred={suggestedRecurrenceCount > 0}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}

function EffectivenessForm({
  rcaId,
  capaId,
  defaultRecurred,
  onDone,
}: {
  rcaId: string
  capaId: string
  defaultRecurred: boolean
  onDone: () => void
}) {
  const [state, action] = useActionState(verifyEffectivenessAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rcaId" value={rcaId} />
      <input type="hidden" name="capaId" value={capaId} />
      <FormSelect
        label="Did the issue recur?"
        name="recurred"
        defaultValue={defaultRecurred ? "yes" : "no"}
        options={[
          { value: "no", label: "No — zero recurrence" },
          { value: "yes", label: "Yes — issue recurred" },
        ]}
        state={state}
      />
      <FormSelect
        label="Effectiveness verdict"
        name="result"
        defaultValue={defaultRecurred ? "ineffective" : "effective"}
        options={[
          { value: "effective", label: "Effective (verify & close CAPA)" },
          { value: "ineffective", label: "Ineffective (needs further action)" },
        ]}
        state={state}
      />
      <FormTextarea
        label="Verification evidence & notes"
        name="evidence"
        required
        placeholder="Audit observations, zero repeat complaints over 30 days…"
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Record sign-off</SubmitButton>
      </div>
    </form>
  )
}

export function ApprovalSignForm({ rcaId, canApprove }: { rcaId: string; canApprove: boolean }) {
  const [state, action] = useActionState(signApprovalAction, null)
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <input type="hidden" name="rcaId" value={rcaId} />
      <p className="text-sm font-semibold">Record approval signature</p>
      <p className="text-xs text-muted-foreground">
        Logs your name, timestamp, stage and comment in the immutable audit trail.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Stage"
          name="stage"
          options={[
            { value: "owner", label: "Owner sign-off" },
            { value: "reviewer", label: "Reviewer sign-off" },
            ...(canApprove ? [{ value: "approver", label: "Final Approver sign-off" }] : []),
          ]}
          state={state}
        />
        <FormSelect
          label="Decision"
          name="decision"
          options={[
            { value: "approved", label: "Approve" },
            { value: "rejected", label: "Request revisions" },
          ]}
          state={state}
        />
      </div>
      <FormField
        label="Comment (optional)"
        name="comment"
        placeholder="Reviewed evidence and CAPA plan"
        state={state}
      />
      <FormMessage state={state} success="Signature recorded." />
      <SubmitButton size="lg">Sign off</SubmitButton>
    </form>
  )
}
