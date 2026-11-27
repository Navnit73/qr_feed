"use client"

import { useRouter } from "next/navigation"
import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { PhotoUpload } from "@/components/photo-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  completeAuditAction,
  convertFindingToRcaAction,
  createFindingAction,
  saveChecklistAction,
} from "../actions"

export type ChecklistRow = {
  itemId: string
  clause: string
  section: string
  question: string
  result: "pending" | "pass" | "fail" | "na"
  note: string
}

type DraftMap = Record<string, { result: ChecklistRow["result"]; note: string }>

const draftListeners = new Set<() => void>()
function notifyDraftListeners() {
  for (const cb of draftListeners) cb()
}

function subscribeDraft(cb: () => void) {
  draftListeners.add(cb)
  const onStorage = () => cb()
  window.addEventListener("storage", onStorage)
  return () => {
    draftListeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * Mobile-friendly audit checklist runner with localStorage offline draft auto-save (F-7.2).
 * Registers the PWA service worker on mount when supported.
 */
export function AuditChecklistRunner({
  auditId,
  initialItems,
  editable,
  completed,
}: {
  auditId: string
  initialItems: ChecklistRow[]
  editable: boolean
  completed: boolean
}) {
  const storageKey = `qrfeed.audit.draft.${auditId}`
  const readDraft = useCallback(() => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }, [storageKey])
  const draftRaw = useSyncExternalStore(subscribeDraft, readDraft, () => null)

  let parsedDraft: DraftMap | null = null
  if (!completed && draftRaw) {
    try {
      parsedDraft = JSON.parse(draftRaw) as DraftMap
    } catch {
      parsedDraft = null
    }
  }

  const items: ChecklistRow[] = parsedDraft
    ? initialItems.map((row) =>
        parsedDraft[row.itemId] ? { ...row, ...parsedDraft[row.itemId] } : row,
      )
    : initialItems
  const dirty = !completed && parsedDraft !== null

  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])

  // Auto-sync any pending offline draft as soon as connectivity returns.
  useEffect(() => {
    if (!dirty || !editable || completed) return
    const onOnline = () => {
      startTransition(async () => {
        try {
          const res = await saveChecklistAction(
            auditId,
            items.map((i) => ({ itemId: i.itemId, result: i.result, note: i.note })),
          )
          if (res?.ok) {
            try {
              localStorage.removeItem(storageKey)
            } catch {
              // Ignore storage errors
            }
            notifyDraftListeners()
            setMessage({
              text: `Reconnected and synced! Score: ${res.data.scorePct === null ? "pending" : `${res.data.scorePct}%`}`,
              isError: false,
            })
          }
        } catch {
          // Still offline; keep local draft intact
        }
      })
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [auditId, completed, dirty, editable, items, storageKey])

  function clearLocalDraft() {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore storage errors
    }
    notifyDraftListeners()
  }

  function updateItem(itemId: string, patch: Partial<Pick<ChecklistRow, "result" | "note">>) {
    const next = items.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r))
    try {
      const draft: DraftMap = Object.fromEntries(
        next.map((r) => [r.itemId, { result: r.result, note: r.note }]),
      )
      localStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      // Ignore storage quota errors
    }
    notifyDraftListeners()
    setMessage(null)
  }

  function syncDraft() {
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await saveChecklistAction(
          auditId,
          items.map((i) => ({ itemId: i.itemId, result: i.result, note: i.note })),
        )
        if (res && res.ok) {
          clearLocalDraft()
          setMessage({
            text: `Synced! Current score: ${res.data.scorePct === null ? "pending" : `${res.data.scorePct}%`}`,
            isError: false,
          })
        } else if (res) {
          setMessage({ text: res.error.message, isError: true })
        }
      } catch {
        setMessage({
          text: "Offline or network error — draft stays saved locally.",
          isError: true,
        })
      }
    })
  }

  function finishAudit() {
    setMessage(null)
    startTransition(async () => {
      try {
        const saved = await saveChecklistAction(
          auditId,
          items.map((i) => ({ itemId: i.itemId, result: i.result, note: i.note })),
        )
        if (!saved?.ok) {
          setMessage({
            text: saved?.error.message ?? "Could not save checklist before completing.",
            isError: true,
          })
          return
        }
        const res = await completeAuditAction(auditId)
        if (res && res.ok) {
          clearLocalDraft()
          setMessage({ text: "Audit marked completed.", isError: false })
        } else if (res) {
          setMessage({ text: res.error.message, isError: true })
        }
      } catch {
        setMessage({
          text: "Could not reach server to complete audit. Draft remains saved locally.",
          isError: true,
        })
      }
    })
  }

  return (
    <div className="space-y-4">
      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <span>Offline draft saved locally. Sync when ready.</span>
          <Button size="sm" loading={pending} onClick={syncDraft}>
            Sync now
          </Button>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((row) => (
          <li key={row.itemId} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{row.clause}</span> · {row.section}
                </p>
                <p className="mt-0.5 font-medium">{row.question}</p>
              </div>
              <div
                className="flex shrink-0 gap-1.5"
                role="group"
                aria-label={`Score ${row.clause}`}
              >
                {(["pass", "fail", "na"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={!editable || completed}
                    onClick={() => updateItem(row.itemId, { result: opt })}
                    className={cn(
                      "min-h-10 min-w-12 rounded-lg border px-3 text-xs font-semibold uppercase transition-colors",
                      row.result === opt &&
                        opt === "pass" &&
                        "border-success bg-success text-success-foreground",
                      row.result === opt &&
                        opt === "fail" &&
                        "border-destructive bg-destructive text-destructive-foreground",
                      row.result === opt &&
                        opt === "na" &&
                        "border-foreground bg-foreground text-background",
                      row.result !== opt && "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {opt === "na" ? "N/A" : opt}
                  </button>
                ))}
              </div>
            </div>
            <Input
              value={row.note}
              disabled={!editable || completed}
              aria-label={`Observation note for clause ${row.clause}`}
              onChange={(e) => updateItem(row.itemId, { note: e.target.value })}
              placeholder="Observation note (optional)…"
              className="mt-3 h-10 text-sm"
            />
          </li>
        ))}
      </ul>

      {message && (
        <p
          className={cn(
            "text-sm font-medium",
            message.isError ? "text-destructive" : "text-success",
          )}
        >
          {message.text}
        </p>
      )}

      {editable && !completed && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="lg" loading={pending} onClick={syncDraft}>
            Save &amp; sync checklist
          </Button>
          <Button size="lg" loading={pending} onClick={finishAudit}>
            <Icon name="verify" data-icon="inline-start" /> Complete audit
          </Button>
        </div>
      )}
    </div>
  )
}

export function AddFindingForm({ auditId, branchId }: { auditId: string; branchId: string }) {
  const [resetKey, setResetKey] = useState(0)
  const [state, action] = useActionState(
    async (prev: Awaited<ReturnType<typeof createFindingAction>>, fd: FormData) => {
      const res = await createFindingAction(prev, fd)
      if (res?.ok) setResetKey((k) => k + 1)
      return res
    },
    null,
  )
  return (
    <form key={resetKey} action={action} className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <input type="hidden" name="auditId" value={auditId} />
      <p className="text-sm font-semibold">Log a finding / NCR</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Severity"
          name="severity"
          defaultValue="minor"
          options={[
            { value: "observation", label: "Observation" },
            { value: "minor", label: "Minor non-conformity" },
            { value: "major", label: "Major non-conformity" },
            { value: "critical", label: "Critical non-conformity" },
          ]}
          state={state}
        />
        <FormField
          label="Clause reference"
          name="clause"
          placeholder="e.g. 7.1.5"
          required
          state={state}
        />
      </div>
      <FormTextarea
        label="Description"
        name="description"
        placeholder="Describe the objective evidence of the finding…"
        required
        state={state}
      />
      <PhotoUpload
        mode="staff"
        scope="audit"
        branchId={branchId}
        entityId={auditId}
        maxFiles={3}
        label="Evidence photos"
      />
      <FormMessage state={state} success="Finding recorded." />
      <SubmitButton size="lg">Add finding</SubmitButton>
    </form>
  )
}

export function ConvertFindingButton({
  auditId,
  findingId,
}: {
  auditId: string
  findingId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await convertFindingToRcaAction(auditId, findingId)
            if (res && res.ok) router.push(`/rca/${res.data.rcaId}`)
            else if (res) setError(res.error.message)
          })
        }}
      >
        <Icon name="rca" data-icon="inline-start" /> Create NCR / RCA
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
