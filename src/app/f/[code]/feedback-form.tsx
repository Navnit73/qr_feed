"use client"

import Script from "next/script"
import { useState, useTransition, type FormEvent } from "react"
import { FormField, FormMessage, FormTextarea, RadioCards, RatingInput } from "@/components/form"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/lib/use-hydrated"
import type { ApiResponse } from "@/lib/api/errors"
import { submitFeedbackAction } from "./actions"

type State = ApiResponse<unknown> | null

export function FeedbackForm({
  code,
  categories,
  sensitive,
  turnstileSiteKey,
}: {
  code: string
  categories: { id: string; label: string }[]
  /** Hospitals and clinics: remind people not to share medical details. */
  sensitive: boolean
  turnstileSiteKey?: string
}) {
  const [state, setState] = useState<State>(null)
  const [pending, startTransition] = useTransition()
  const hydrated = useHydrated()

  // Submit by hand rather than via <form action>: React resets a form after its action runs,
  // which would wipe a guest's typing when we only want to show a validation message.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => setState(await submitFeedbackAction(code, data)))
  }

  return (
    // method="post" + disabled until hydrated, so an early tap never sends fields in the URL (BUG-005).
    <form onSubmit={onSubmit} method="post" className="space-y-6" noValidate>
      <RadioCards
        legend="What's it about?"
        name="categoryId"
        state={state}
        options={categories.map((c) => ({ value: c.id, label: c.label }))}
      />
      <RatingInput label="How was it?" name="rating" state={state} />
      <FormTextarea
        label="What happened?"
        name="description"
        placeholder="e.g. The floor is wet near the sinks and there are no paper towels."
        maxLength={2000}
        state={state}
      />
      <RadioCards
        legend="How urgent is it?"
        name="urgency"
        defaultValue="normal"
        state={state}
        options={[
          { value: "normal", label: "It can wait" },
          { value: "urgent", label: "Urgent" },
        ]}
      />

      <details className="group rounded-xl border p-4">
        <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between text-sm font-medium">
          Want updates? Add your contact (optional)
          <span
            aria-hidden
            className="text-muted-foreground transition-transform group-open:rotate-45"
          >
            +
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <FormField label="Name" name="name" autoComplete="name" state={state} />
          <FormField label="Email" name="email" type="email" autoComplete="email" state={state} />
          <FormField label="Phone" name="phone" type="tel" autoComplete="tel" state={state} />
        </div>
      </details>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5 size-5 accent-(--primary)" />
        <span>
          I&apos;m happy for this to be shared with the team.
          {sensitive && " I haven't included anyone's medical or personal details."}
        </span>
      </label>
      {state && !state.ok && state.error.details?.consent && (
        <p className="-mt-4 text-sm text-destructive">{state.error.details.consent[0]}</p>
      )}

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      <FormMessage state={state} />
      <Button type="submit" size="xl" className="w-full" loading={pending} disabled={!hydrated}>
        Send feedback
      </Button>
    </form>
  )
}
