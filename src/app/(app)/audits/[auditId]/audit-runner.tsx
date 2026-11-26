"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { PhotoUpload } from "@/components/photo-upload"
import { Badge } from "@/components/ui/badge"
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
  const [items, setItems] = useState<ChecklistRow[]>(() => {
    if (typeof window === "undefined") return initialItems
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return initialItems
      const parsed = JSON.parse(saved) as Record<
        string,
        { result: ChecklistRow["result"]; note: string }
      >
      return initialItems.map((row) =>
        parsed[row.itemId] ? { ...row, ...parsed[row.itemId] } : row,
      )
    } catch {
      return initialItems
    }
  })
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])

  function updateItem(itemId: string, patch: Partial<Pick<ChecklistRow, "result" | "note">>) {
    setItems((prev) => {
      const next = prev.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r))
      try {
        const draft = Object.fromEntries(
          next.map((r) => [r.itemId, { result: r.result, note: r.note }]),
        )
        localStorage.setItem(storageKey, JSON.stringify(draft))
      } catch {
        // Ignore storage quota errors
      }
      return next
    })
    setDirty(true)
    setMessage(null)
  }

  function syncDraft() {
    setMessage(null)
    startTransition(async () => {
      const res = await saveChecklistAction(
        auditId,
        items.map((i) => ({ itemId: i.itemId, result: i.result, note: i.note })),
      )
      if (res && res.ok) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // Ignore
        }
        setDirty(false)
        setMessage(
          `Synced! Current score: ${res.data.scorePct === null ? "pending" : `${res.data.scorePct}%`}`,
        )
      } else if (res) {
        setMessage(res.error.message)
      }
    })
  }

  function finishAudit() {
    startTransition(async () => {
      await saveChecklistAction(
        auditId,
        items.map((i) => ({ itemId: i.itemId, result: i.result, note: i.note })),
      )
      const res = await completeAuditAction(auditId)
      if (res && res.ok) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // Ignore
        }
        setDirty(false)
        setMessage("Audit marked completed.")
      } else if (res) {
        setMessage(res.error.message)
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
              onChange={(e) => updateItem(row.itemId, { note: e.target.value })}
              placeholder="Observation note (optional)…"
              className="mt-3 h-10 text-sm"
            />
          </li>
        ))}
      </ul>

      {message && <p className="text-sm font-medium text-success">{message}</p>}

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
  const [state, action] = useActionState(createFindingAction, null)
  return (
    <form action={action} className="space-y-4 rounded-xl border bg-muted/20 p-4">
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
  rcaId,
}: {
  auditId: string
  findingId: string
  rcaId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (rcaId) {
    return (
      <Badge
        variant="success"
        className="cursor-pointer"
        onClick={() => router.push(`/rca/${rcaId}`)}
      >
        RCA linked →
      </Badge>
    )
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await convertFindingToRcaAction(auditId, findingId)
          if (res && res.ok) router.push(`/rca/${res.data.rcaId}`)
        })
      }
    >
      <Icon name="rca" data-icon="inline-start" /> Create NCR / RCA
    </Button>
  )
}
