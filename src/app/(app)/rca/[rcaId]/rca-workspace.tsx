"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  closeRcaAction,
  createCapaAction,
  linkTicketToRcaAction,
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

const FISHBONE_BRANCHES: {
  key: keyof RcaWorkspaceData["fishbone"]
  label: string
  short: string
}[] = [
  { key: "man", label: "Man (People)", short: "Man" },
  { key: "machine", label: "Machine (Equipment)", short: "Machine" },
  { key: "method", label: "Method (Process/SOP)", short: "Method" },
  { key: "material", label: "Material (Supplies)", short: "Material" },
  { key: "measurement", label: "Measurement (Checks)", short: "Measurement" },
  { key: "environment", label: "Environment (Space)", short: "Environment" },
]

export function AnalysisForm({ data, editable }: { data: RcaWorkspaceData; editable: boolean }) {
  const [state, action] = useActionState(updateRcaAnalysisAction, null)
  const [whys, setWhys] = useState<string[]>(() => {
    const initial = data.whys.length >= 5 ? [...data.whys] : [...data.whys]
    while (initial.length < 5) initial.push("")
    return initial
  })
  const [fbText, setFbText] = useState<Record<keyof RcaWorkspaceData["fishbone"], string>>(() => ({
    man: data.fishbone.man.join("\n"),
    machine: data.fishbone.machine.join("\n"),
    method: data.fishbone.method.join("\n"),
    material: data.fishbone.material.join("\n"),
    measurement: data.fishbone.measurement.join("\n"),
    environment: data.fishbone.environment.join("\n"),
  }))

  const hasAnyBone = Object.values(fbText).some((v) => v.trim().length > 0)

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

      {/* Dynamic 5 Whys builder (up to 10 levels) */}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">2. 5 Whys analysis</p>
          {editable && whys.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setWhys((prev) => [...prev, ""])}
            >
              + Add Why #{whys.length + 1}
            </Button>
          )}
        </div>
        <div className="space-y-2.5">
          {whys.map((val, idx) => (
            <div key={idx} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FormField
                  label={`Why #${idx + 1}`}
                  name="whys"
                  value={val}
                  onChange={(e) =>
                    setWhys((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))
                  }
                  disabled={!editable}
                  placeholder={idx === 0 ? "Why did the issue occur?" : "And why did that happen?"}
                  state={state}
                />
              </div>
              {editable && whys.length > 5 && idx === whys.length - 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove Why #${idx + 1}`}
                  onClick={() => setWhys((prev) => prev.slice(0, -1))}
                  className="mb-0.5 text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fishbone 6M visual diagram + editor */}
      <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">3. Fishbone (Ishikawa 6M)</p>

        {/* Visual cause-and-effect spine diagram */}
        {hasAnyBone && (
          <div className="rounded-xl border bg-card p-4" aria-label="Fishbone cause diagram">
            <div className="grid gap-3 md:grid-cols-3">
              {FISHBONE_BRANCHES.slice(0, 3).map((b) => {
                const causes = fbText[b.key]
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                return (
                  <div key={b.key} className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-xs font-bold tracking-wider text-primary uppercase">
                      {b.short}
                    </p>
                    {causes.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                        {causes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="my-3 flex items-center gap-2">
              <div className="h-0.5 flex-1 bg-primary/40" />
              <Badge variant="inverse" className="shrink-0">
                Effect · Root Problem
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {FISHBONE_BRANCHES.slice(3, 6).map((b) => {
                const causes = fbText[b.key]
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                return (
                  <div key={b.key} className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-xs font-bold tracking-wider text-primary uppercase">
                      {b.short}
                    </p>
                    {causes.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                        {causes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FISHBONE_BRANCHES.map((cat) => (
            <FormTextarea
              key={cat.key}
              label={cat.label}
              name={`fb_${cat.key}`}
              rows={3}
              value={fbText[cat.key]}
              onChange={(e) => setFbText((prev) => ({ ...prev, [cat.key]: e.target.value }))}
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

export function LinkTicketDialog({ rcaId }: { rcaId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Link ticket to this RCA"
      description="Connect related tickets by ticket number (e.g. TKT-2026-000012)."
      trigger={
        <Button variant="outline" size="sm">
          + Link ticket
        </Button>
      }
    >
      {open && <LinkTicketForm rcaId={rcaId} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function LinkTicketForm({ rcaId, onDone }: { rcaId: string; onDone: () => void }) {
  const [state, action] = useActionState(linkTicketToRcaAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rcaId" value={rcaId} />
      <FormField
        label="Ticket number"
        name="ticketRef"
        placeholder="TKT-2026-000012"
        required
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Link ticket</SubmitButton>
      </div>
    </form>
  )
}

export function CloseRcaButton({ rcaId, number }: { rcaId: string; number: string }) {
  const swal = useSweetAlert()
  return (
    <Button
      size="lg"
      onClick={() =>
        swal.fire({
          tone: "question",
          title: `Close ${number}?`,
          text: "Closing locks the analysis, CAPA actions and approvals permanently for audit compliance.",
          confirmText: "Close RCA",
          cancelText: "Cancel",
          onConfirm: async () => {
            const res = await closeRcaAction(rcaId)
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      <Icon name="verify" data-icon="inline-start" /> Close RCA
    </Button>
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
      description="Create correction, corrective or preventive actions with per-action owners, due dates and effectiveness checks."
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
  const defaultOwner = members[0]?.value ?? ""
  const [rows, setRows] = useState<
    { id: number; title: string; ownerId: string; dueDate: string }[]
  >(() => [{ id: 1, title: "", ownerId: defaultOwner, dueDate: defaultDue }])

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

      {/* Per-action owner + due date builder */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Action items</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: (prev.at(-1)?.id ?? 0) + 1,
                  title: "",
                  ownerId: defaultOwner,
                  dueDate: defaultDue,
                },
              ])
            }
          >
            + Add action
          </Button>
        </div>
        {rows.map((row, idx) => (
          <div key={row.id} className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Input
                name="actionTitle"
                value={row.title}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, title: e.target.value } : r)),
                  )
                }
                placeholder={`Action #${idx + 1} (e.g. Stock spare dry mops on Floor 2)`}
                required
                className="h-10 flex-1"
              />
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove action"
                >
                  <Icon name="close" className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                name="actionOwnerId"
                aria-label={`Owner for action ${idx + 1}`}
                value={row.ownerId}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, ownerId: e.target.value } : r)),
                  )
                }
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {members.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Input
                name="actionDueDate"
                type="date"
                aria-label={`Due date for action ${idx + 1}`}
                value={row.dueDate}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, dueDate: e.target.value } : r)),
                  )
                }
                required
                className="h-9"
              />
            </div>
          </div>
        ))}
      </div>

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
  const [error, setError] = useState<string | null>(null)
  if (status === "completed" || status === "verified") {
    return <Badge variant="success">{status}</Badge>
  }
  const next = status === "open" ? "in_progress" : "completed"
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={next === "completed" ? "default" : "outline"}
        loading={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await setCapaActionStatusAction(rcaId, capaId, actionId, next)
            if (res && !res.ok) setError(res.error.message)
          })
        }}
      >
        {next === "in_progress" ? "Start" : "Mark complete"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
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

export function ApprovalSignForm({
  rcaId,
  canManage,
  canApprove,
}: {
  rcaId: string
  canManage: boolean
  canApprove: boolean
}) {
  const [state, action] = useActionState(signApprovalAction, null)
  const stageOptions = [
    ...(canManage
      ? [
          { value: "owner", label: "Owner sign-off" },
          { value: "reviewer", label: "Reviewer sign-off" },
        ]
      : []),
    ...(canApprove ? [{ value: "approver", label: "Final Approver sign-off" }] : []),
  ]
  if (stageOptions.length === 0) return null
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <input type="hidden" name="rcaId" value={rcaId} />
      <p className="text-sm font-semibold">Record approval signature</p>
      <p className="text-xs text-muted-foreground">
        Sign-offs follow Owner → Reviewer → Approver order and are recorded in the immutable audit
        trail.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect label="Stage" name="stage" options={stageOptions} state={state} />
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
