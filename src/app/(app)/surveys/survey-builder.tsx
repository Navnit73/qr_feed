"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { FormMessage } from "@/components/form"
import { Icon } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApiResponse } from "@/lib/api/errors"
import {
  QUESTION_TYPE_META,
  SURVEY_TEMPLATES,
  type SurveyQuestionDraft,
  type SurveyQuestionType,
} from "@/lib/survey-templates"
import { cn } from "@/lib/utils"
import { createSurveyAction, updateSurveyAction } from "./actions"

export type BranchOption = { value: string; label: string }
export type LocationOption = { value: string; label: string; branchId: string }

type InitialSurvey = {
  id: string
  title: string
  description: string
  branchId: string
  locationId: string
  collectContact: boolean
  thankYouMessage: string
  questions: SurveyQuestionDraft[]
}

let uidSeq = 1
function nextQuestionId() {
  uidSeq += 1
  return `q_${Date.now().toString(36)}_${uidSeq}`
}

const QUESTION_TYPES = Object.keys(QUESTION_TYPE_META) as SurveyQuestionType[]

export function SurveyBuilder({
  mode,
  tenantName,
  canScopeAllBranches = true,
  branches,
  locations,
  initial,
}: {
  mode: "create" | "edit"
  tenantName: string
  canScopeAllBranches?: boolean
  branches: BranchOption[]
  locations: LocationOption[]
  initial?: InitialSurvey
}) {
  const router = useRouter()
  const defaultTemplate = SURVEY_TEMPLATES[0]
  const [activeTemplate, setActiveTemplate] = useState<string>(
    mode === "create" ? defaultTemplate.key : "",
  )
  const [title, setTitle] = useState(initial?.title ?? defaultTemplate.title)
  const [description, setDescription] = useState(
    initial?.description ?? defaultTemplate.description,
  )
  const [branchId, setBranchId] = useState(
    initial?.branchId ?? (!canScopeAllBranches ? (branches[0]?.value ?? "") : ""),
  )
  const [locationId, setLocationId] = useState(initial?.locationId ?? "")
  const [collectContact, setCollectContact] = useState(
    initial?.collectContact ?? defaultTemplate.collectContact,
  )
  const [thankYouMessage, setThankYouMessage] = useState(
    initial?.thankYouMessage ?? defaultTemplate.thankYouMessage,
  )
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>(
    initial?.questions ??
      defaultTemplate.questions.map((q) => ({
        ...q,
        options: q.options ? [...q.options] : undefined,
      })),
  )
  const [state, setState] = useState<ApiResponse<unknown> | null>(null)
  const [pending, startTransition] = useTransition()

  const filteredLocations = branchId ? locations.filter((l) => l.branchId === branchId) : locations

  function applyTemplate(key: string) {
    const tpl = SURVEY_TEMPLATES.find((t) => t.key === key)
    if (!tpl) return
    setActiveTemplate(key)
    setTitle(tpl.title)
    setDescription(tpl.description)
    setCollectContact(tpl.collectContact)
    setThankYouMessage(tpl.thankYouMessage)
    setQuestions(
      tpl.questions.map((q) => ({
        ...q,
        id: nextQuestionId(),
        options: q.options ? [...q.options] : undefined,
      })),
    )
    setState(null)
  }

  function addQuestion(type: SurveyQuestionType = "rating") {
    const needsOptions = QUESTION_TYPE_META[type].hasOptions
    setQuestions((prev) => [
      ...prev,
      {
        id: nextQuestionId(),
        type,
        label: "",
        helpText: "",
        required: false,
        ...(needsOptions ? { options: ["Option 1", "Option 2"] } : {}),
      },
    ])
  }

  function updateQuestion(idx: number, patch: Partial<SurveyQuestionDraft>) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q
        const next = { ...q, ...patch }
        if (patch.type) {
          const needsOptions = QUESTION_TYPE_META[patch.type].hasOptions
          if (needsOptions && (!next.options || next.options.length < 2)) {
            next.options = ["Option 1", "Option 2"]
          } else if (!needsOptions) {
            delete next.options
          }
        }
        return next
      }),
    )
  }

  function moveQuestion(idx: number, delta: -1 | 1) {
    setQuestions((prev) => {
      const target = idx + delta
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  function duplicateQuestion(idx: number) {
    setQuestions((prev) => {
      const src = prev[idx]
      if (!src) return prev
      const clone: SurveyQuestionDraft = {
        ...src,
        id: nextQuestionId(),
        options: src.options ? [...src.options] : undefined,
      }
      const copy = [...prev]
      copy.splice(idx + 1, 0, clone)
      return copy
    })
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q
        const opts = [...(q.options ?? [])]
        opts[oIdx] = value
        return { ...q, options: opts }
      }),
    )
  }

  function addOption(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q
        const opts = [...(q.options ?? [])]
        if (opts.length >= 15) return q
        opts.push(`Option ${opts.length + 1}`)
        return { ...q, options: opts }
      }),
    )
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q
        const opts = (q.options ?? []).filter((_, j) => j !== oIdx)
        return { ...q, options: opts }
      }),
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setState(null)
    const payload = {
      title,
      description: description || undefined,
      branchId: branchId || null,
      locationId: locationId || null,
      collectContact,
      thankYouMessage: thankYouMessage || undefined,
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        label: q.label,
        helpText: q.helpText || undefined,
        required: q.required,
        ...(QUESTION_TYPE_META[q.type].hasOptions
          ? { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
          : {}),
      })),
    }

    startTransition(async () => {
      const res =
        mode === "edit" && initial
          ? await updateSurveyAction(initial.id, payload)
          : await createSurveyAction(payload)
      setState(res)
      if (res && res.ok) {
        router.push(`/surveys/${res.data.id}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <form onSubmit={onSubmit} className="space-y-6 lg:col-span-7">
        {/* Quick-start templates (Create mode) */}
        {mode === "create" && (
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Start from a template</h2>
                <p className="text-xs text-muted-foreground">
                  Pick a ready-made survey or start blank — every question can be customised below.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SURVEY_TEMPLATES.map((tpl) => {
                const selected = activeTemplate === tpl.key
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyTemplate(tpl.key)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-primary/40 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{tpl.name}</span>
                      <Badge variant={selected ? "secondary" : "muted"} className="shrink-0">
                        {tpl.badge}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {tpl.questions.length} {tpl.questions.length === 1 ? "question" : "questions"}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Basic survey details */}
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Survey details</h2>
          <div className="space-y-2">
            <Label htmlFor="survey-title">Survey title *</Label>
            <Input
              id="survey-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Patient Satisfaction Survey"
              required
              maxLength={120}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="survey-desc">Intro message (shown under title)</Label>
            <textarea
              id="survey-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Tell patients or guests why their feedback matters…"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="survey-branch">Branch scope (optional)</Label>
              <select
                id="survey-branch"
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value)
                  setLocationId("")
                }}
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {canScopeAllBranches && <option value="">All branches</option>}
                {branches.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="survey-location">Specific spot / ward (optional)</Label>
              <select
                id="survey-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Whole branch / general</option>
                {filteredLocations.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="survey-thanks">Thank-you message after submission</Label>
            <Input
              id="survey-thanks"
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder="Thank you for your feedback!"
              maxLength={300}
              className="h-10"
            />
          </div>

          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={collectContact}
              onChange={(e) => setCollectContact(e.target.checked)}
              className="size-4 accent-(--primary)"
            />
            <span>Include optional contact fields (Name, Email, Phone) for follow-up</span>
          </label>
        </section>

        {/* Questions builder */}
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Questions ({questions.length})</h2>
              <p className="text-xs text-muted-foreground">
                Mix star ratings, 0–10 NPS, multiple choice, yes/no, and open text comments.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion("rating")}>
              <Icon name="plus" data-icon="inline-start" /> Add question
            </Button>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => {
              const meta = QUESTION_TYPE_META[q.type]
              return (
                <div key={q.id} className="space-y-3 rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <span className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground tabular-nums">
                        {idx + 1}
                      </span>
                      <span>Question {idx + 1}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={idx === 0}
                        aria-label={`Move question ${idx + 1} up`}
                        onClick={() => moveQuestion(idx, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={idx === questions.length - 1}
                        aria-label={`Move question ${idx + 1} down`}
                        onClick={() => moveQuestion(idx, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => duplicateQuestion(idx)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={questions.length <= 1}
                        className="text-destructive"
                        aria-label={`Remove question ${idx + 1}`}
                        onClick={() => removeQuestion(idx)}
                      >
                        <Icon name="close" className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`q-label-${q.id}`}>Question prompt *</Label>
                      <Input
                        id={`q-label-${q.id}`}
                        value={q.label}
                        onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                        placeholder="e.g. How satisfied were you with nursing care?"
                        required
                        maxLength={240}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`q-type-${q.id}`}>Answer type</Label>
                      <select
                        id={`q-type-${q.id}`}
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(idx, { type: e.target.value as SurveyQuestionType })
                        }
                        className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {QUESTION_TYPE_META[t].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
                    <div className="sm:col-span-2">
                      <Input
                        value={q.helpText ?? ""}
                        onChange={(e) => updateQuestion(idx, { helpText: e.target.value })}
                        placeholder="Optional hint text shown beneath the question"
                        aria-label={`Help text for question ${idx + 1}`}
                        maxLength={300}
                        className="h-9 text-xs"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                        className="size-4 accent-(--primary)"
                      />
                      <span>Required question</span>
                    </label>
                  </div>

                  {meta.hasOptions && (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Answer options
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => addOption(idx)}
                        >
                          + Add option
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        {(q.options ?? []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                              placeholder={`Option ${oIdx + 1}`}
                              aria-label={`Question ${idx + 1} option ${oIdx + 1}`}
                              maxLength={120}
                              className="h-9 text-xs"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              disabled={(q.options ?? []).length <= 2}
                              aria-label={`Remove option ${oIdx + 1}`}
                              onClick={() => removeOption(idx, oIdx)}
                            >
                              <Icon name="close" className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion("rating")}>
              + Star rating
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion("nps")}>
              + NPS (0–10)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion("single_choice")}
            >
              + Single choice
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion("multi_choice")}
            >
              + Multi choice
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion("yes_no")}>
              + Yes / No
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion("long_text")}
            >
              + Comment box
            </Button>
          </div>
        </section>

        <FormMessage state={state} />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={mode === "edit" && initial ? `/surveys/${initial.id}` : "/surveys"}
            className={buttonVariants({ variant: "ghost", size: "xl" })}
          >
            Cancel
          </Link>
          <Button type="submit" size="xl" loading={pending}>
            <Icon name="qr" data-icon="inline-start" />
            {mode === "edit" ? "Save changes" : "Create survey & generate QR"}
          </Button>
        </div>
      </form>

      {/* Live Mobile Patient Preview */}
      <aside className="lg:col-span-5">
        <div className="sticky top-22 rounded-3xl border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Live mobile scan preview
            </span>
            <Badge variant="outline">Patient view</Badge>
          </div>
          <div className="shadow-sm mx-auto max-w-sm overflow-hidden rounded-[2rem] border bg-background">
            <div className="bg-primary px-5 pt-5 pb-7 text-primary-foreground">
              <p className="text-xs font-semibold text-primary-foreground/80">{tenantName}</p>
              <h3 className="mt-2 text-lg leading-snug font-bold">
                {title.trim() || "Untitled survey"}
              </h3>
              {description.trim() && (
                <p className="mt-1 text-xs text-primary-foreground/80">{description}</p>
              )}
            </div>
            <div className="max-h-[34rem] space-y-3 overflow-y-auto p-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="space-y-2 rounded-xl border bg-card p-3">
                  <p className="text-xs font-semibold">
                    {idx + 1}. {q.label.trim() || "Question prompt…"}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </p>
                  {q.helpText && <p className="text-[11px] text-muted-foreground">{q.helpText}</p>}
                  {q.type === "rating" && (
                    <div className="flex gap-1 text-amber-500">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Icon key={n} name="rating" className="size-5 fill-current opacity-60" />
                      ))}
                    </div>
                  )}
                  {q.type === "nps" && (
                    <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
                      {Array.from({ length: 11 }, (_, n) => (
                        <span
                          key={n}
                          className="rounded border py-1 font-medium text-muted-foreground tabular-nums"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {q.type === "yes_no" && (
                    <div className="grid grid-cols-2 gap-1.5 text-center text-xs font-medium">
                      <span className="rounded-lg border py-1.5">Yes</span>
                      <span className="rounded-lg border py-1.5">No</span>
                    </div>
                  )}
                  {(q.type === "single_choice" || q.type === "multi_choice") && (
                    <div className="flex flex-wrap gap-1.5">
                      {(q.options ?? []).map((opt, oIdx) => (
                        <span
                          key={oIdx}
                          className="rounded-lg border px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          {opt || `Option ${oIdx + 1}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {(q.type === "short_text" || q.type === "long_text") && (
                    <div
                      className={cn(
                        "rounded-lg border border-dashed bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground",
                        q.type === "long_text" && "h-14",
                      )}
                    >
                      Patient types response here…
                    </div>
                  )}
                </div>
              ))}
              {collectContact && (
                <div className="rounded-xl border border-dashed p-3 text-[11px] text-muted-foreground">
                  Optional contact details (Name, Email, Phone)
                </div>
              )}
              <div className="rounded-xl bg-primary py-2.5 text-center text-xs font-semibold text-primary-foreground">
                Submit feedback
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
