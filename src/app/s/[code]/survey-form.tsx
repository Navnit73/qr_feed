"use client"

import Script from "next/script"
import { useState, useTransition, type FormEvent } from "react"
import { FormField, FormMessage, RatingInput } from "@/components/form"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import type { ApiResponse } from "@/lib/api/errors"
import type { SurveyQuestionDraft } from "@/lib/survey-templates"
import { useHydrated } from "@/lib/use-hydrated"
import { cn } from "@/lib/utils"
import { submitSurveyAction } from "./actions"

type SubmitState = ApiResponse<{ responseId: string; thankYouMessage: string }> | null

function fieldError(state: SubmitState, field: string): string | undefined {
  return state && !state.ok ? state.error.details?.[field]?.[0] : undefined
}

export function PublicSurveyForm({
  code,
  tenantName,
  scopeLabel,
  logoUrl,
  title,
  description,
  questions,
  collectContact,
  sensitive,
  disclaimer,
  turnstileSiteKey,
}: {
  code: string
  tenantName: string
  scopeLabel: string
  logoUrl?: string
  title: string
  description: string
  questions: SurveyQuestionDraft[]
  collectContact: boolean
  sensitive: boolean
  disclaimer?: string
  turnstileSiteKey?: string
}) {
  const [state, setState] = useState<SubmitState>(null)
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [pending, startTransition] = useTransition()
  const hydrated = useHydrated()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const res = await submitSurveyAction(code, data)
        setState(res)
        if (res && res.ok) {
          setSubmittedMsg(res.data.thankYouMessage)
          window.scrollTo({ top: 0, behavior: "smooth" })
        } else {
          ;(window as { turnstile?: { reset?: () => void } }).turnstile?.reset?.()
          requestAnimationFrame(() => {
            document
              .querySelector('[data-field-error="true"], [aria-invalid="true"]')
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          })
        }
      } catch {
        setState({
          ok: false,
          error: { code: "NETWORK", message: "Could not send your response. Please try again." },
        })
      }
    })
  }

  if (submittedMsg) {
    return (
      <div className="px-4 py-12 text-center sm:px-6">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Icon name="success" className="size-9" />
        </span>
        <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {tenantName}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance">
          Thank you for your feedback!
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-sm text-pretty text-muted-foreground">
          {submittedMsg}
        </p>
        <div className="mt-8">
          <Button
            type="button"
            variant="outline"
            size="xl"
            onClick={() => {
              setSubmittedMsg(null)
              setState(null)
              setFormKey((k) => k + 1)
            }}
          >
            Submit another response
          </Button>
        </div>
        <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="qr" className="size-3.5" /> Powered by QR Feed
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="relative overflow-hidden bg-primary px-4 pt-5 pb-12 text-primary-foreground sm:rounded-3xl sm:px-6">
        <div
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-0 [--dot:color-mix(in_oklch,white_14%,transparent)]"
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-9 w-auto max-w-32 rounded-lg bg-white object-contain p-1"
              />
            ) : (
              <span className="grid size-9 place-items-center rounded-lg bg-white/15">
                <Icon name="branch" className="size-4.5" />
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-semibold">{tenantName}</p>
          </div>

          {scopeLabel && scopeLabel !== tenantName && (
            <p className="mt-5 flex items-start gap-1.5 text-xs font-medium text-primary-foreground/75">
              <Icon name="location" className="mt-px size-3.5 shrink-0" />
              <span>{scopeLabel}</span>
            </p>
          )}
          <h1 className="mt-2 text-[clamp(1.65rem,7vw,2.2rem)] leading-[1.12] font-bold tracking-tight text-balance">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-prose text-sm text-pretty text-primary-foreground/85">
              {description}
            </p>
          )}
        </div>
      </header>

      <form
        key={formKey}
        onSubmit={onSubmit}
        method="post"
        className="relative -mt-6 space-y-3 px-3 sm:px-0"
        noValidate
      >
        {questions.map((q, idx) => {
          const name = `q_${q.id}`
          const err = fieldError(state, name)

          return (
            <section
              key={q.id}
              data-field-error={err ? "true" : undefined}
              className={cn(
                "relative rounded-2xl border bg-card p-4 transition-colors",
                err && "border-destructive/60",
              )}
            >
              <span
                aria-hidden
                className="absolute end-4 top-4 grid size-6 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground tabular-nums"
              >
                {idx + 1}
              </span>

              {q.type === "rating" && (
                <div>
                  <div className="[&_p]:pr-8">
                    <RatingInput
                      label={`${q.label}${q.required ? " *" : ""}`}
                      name={name}
                      state={state}
                    />
                  </div>
                  {q.helpText && <p className="mt-1 text-xs text-muted-foreground">{q.helpText}</p>}
                </div>
              )}

              {q.type === "nps" && (
                <fieldset className="space-y-2.5">
                  <legend className="pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </legend>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <div className="grid grid-cols-6 gap-1.5 pt-1 sm:grid-cols-11 sm:gap-1">
                    {Array.from({ length: 11 }, (_, score) => (
                      <label
                        key={score}
                        className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border bg-background text-xs font-semibold tabular-nums transition-colors hover:border-primary/60 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                      >
                        <input
                          type="radio"
                          name={name}
                          value={score}
                          className="sr-only"
                          aria-label={`${score} out of 10`}
                        />
                        {score}
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>0 · Not likely</span>
                    <span>10 · Extremely likely</span>
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </fieldset>
              )}

              {q.type === "yes_no" && (
                <fieldset className="space-y-2.5">
                  <legend className="pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </legend>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {[
                      { value: "yes", label: "Yes", icon: "check" as const },
                      { value: "no", label: "No", icon: "close" as const },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                      >
                        <input type="radio" name={name} value={opt.value} className="sr-only" />
                        <Icon name={opt.icon} className="size-4" />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </fieldset>
              )}

              {q.type === "single_choice" && (
                <fieldset className="space-y-2.5">
                  <legend className="pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </legend>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <div className="grid gap-2 pt-1">
                    {(q.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3.5 py-2.5 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                      >
                        <input
                          type="radio"
                          name={name}
                          value={opt}
                          className="size-4 shrink-0 accent-(--primary)"
                        />
                        <span className="leading-snug">{opt}</span>
                      </label>
                    ))}
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </fieldset>
              )}

              {q.type === "multi_choice" && (
                <fieldset className="space-y-2.5">
                  <legend className="pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </legend>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <div className="grid gap-2 pt-1">
                    {(q.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3.5 py-2.5 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                      >
                        <input
                          type="checkbox"
                          name={name}
                          value={opt}
                          className="size-4 shrink-0 accent-(--primary)"
                        />
                        <span className="leading-snug">{opt}</span>
                      </label>
                    ))}
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </fieldset>
              )}

              {q.type === "short_text" && (
                <div className="space-y-2">
                  <label htmlFor={name} className="block pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <input
                    id={name}
                    name={name}
                    type="text"
                    maxLength={240}
                    placeholder="Type your answer…"
                    aria-invalid={err ? true : undefined}
                    className={cn(
                      "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
                      err && "border-destructive",
                    )}
                  />
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </div>
              )}

              {q.type === "long_text" && (
                <div className="space-y-2">
                  <label htmlFor={name} className="block pr-8 text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                  <textarea
                    id={name}
                    name={name}
                    rows={3}
                    maxLength={2000}
                    placeholder="Share your thoughts or suggestions…"
                    aria-invalid={err ? true : undefined}
                    className={cn(
                      "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
                      err && "border-destructive",
                    )}
                  />
                  {err && <p className="text-sm text-destructive">{err}</p>}
                </div>
              )}
            </section>
          )
        })}

        {collectContact && (
          <details className="group rounded-2xl border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <Icon name="mail" className="size-4" />
              </span>
              <span className="flex-1">Leave your contact details (optional)</span>
              <Icon
                name="expand"
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-4 px-4 pb-4">
              <FormField label="Your name" name="name" autoComplete="name" state={state} />
              <FormField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                state={state}
              />
              <FormField label="Phone" name="phone" type="tel" autoComplete="tel" state={state} />
            </div>
          </details>
        )}

        {disclaimer && (
          <p className="rounded-2xl border bg-muted/40 p-4 text-xs text-muted-foreground">
            {disclaimer}
          </p>
        )}

        <div className="rounded-2xl border bg-card p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              name="consent"
              defaultChecked
              className="mt-0.5 size-5 shrink-0 accent-(--primary)"
            />
            <span>
              I agree to share this feedback with {tenantName} to help improve service quality.
              {sensitive &&
                " Please do not include sensitive personal medical records or prescriptions."}
            </span>
          </label>
          {fieldError(state, "consent") && (
            <p className="mt-2 text-sm text-destructive">{fieldError(state, "consent")}</p>
          )}
        </div>

        {turnstileSiteKey && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
          </>
        )}

        <FormMessage state={state} />

        <div className="sticky bottom-0 z-10 -mx-3 border-t bg-background/85 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <Button type="submit" size="xl" className="w-full" loading={pending} disabled={!hydrated}>
            <Icon name="feedback" data-icon="inline-start" />
            Submit feedback
          </Button>
        </div>
      </form>
      <p className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
        <Icon name="qr" className="size-3.5" /> Powered by QR Feed
      </p>
    </div>
  )
}
