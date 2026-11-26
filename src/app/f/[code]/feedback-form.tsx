"use client"

import Script from "next/script"
import { useState, useTransition, type FormEvent } from "react"
import { FormField, FormMessage, FormTextarea, RadioCards, RatingInput } from "@/components/form"
import { PhotoUpload } from "@/components/photo-upload"
import { Button } from "@/components/ui/button"
import type { ApiResponse } from "@/lib/api/errors"
import {
  getGuestStrings,
  isRtlLocale,
  SUPPORTED_LOCALES,
  translateCategoryLabel,
  type LocaleCode,
} from "@/lib/i18n"
import { useHydrated } from "@/lib/use-hydrated"
import { cn } from "@/lib/utils"
import { submitFeedbackAction } from "./actions"

type State = ApiResponse<unknown> | null

export function FeedbackForm({
  code,
  categories,
  sensitive,
  initialLocale,
  turnstileSiteKey,
  disclaimer,
}: {
  code: string
  categories: { id: string; key: string; label: string }[]
  /** Hospitals and clinics: remind people not to share medical details. */
  sensitive: boolean
  initialLocale: LocaleCode
  turnstileSiteKey?: string
  disclaimer?: string
}) {
  const [locale, setLocale] = useState<LocaleCode>(initialLocale)
  const [state, setState] = useState<State>(null)
  const [pending, startTransition] = useTransition()
  const hydrated = useHydrated()
  const t = getGuestStrings(locale)
  const dir = isRtlLocale(locale) ? "rtl" : "ltr"

  // Submit by hand rather than via <form action>: React resets a form after its action runs,
  // which would wipe a guest's typing when we only want to show a validation message.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    data.set("lang", locale)
    startTransition(async () => setState(await submitFeedbackAction(code, data)))
  }

  return (
    <div dir={dir} lang={locale}>
      {/* Compact language switcher for guests */}
      <div
        className="mb-5 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t.languageLabel}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            aria-pressed={locale === l.code}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors",
              locale === l.code
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {l.native}
          </button>
        ))}
      </div>

      <p className="mb-6 text-pretty text-muted-foreground">{t.subtitle}</p>

      {/* method="post" + disabled until hydrated, so an early tap never sends fields in the URL (BUG-005). */}
      <form onSubmit={onSubmit} method="post" className="space-y-6" noValidate>
        <input type="hidden" name="lang" value={locale} />
        <RadioCards
          legend={t.whatsItAbout}
          name="categoryId"
          state={state}
          options={categories.map((c) => ({
            value: c.id,
            label: translateCategoryLabel(locale, c.key, c.label),
          }))}
        />
        <RatingInput label={t.howWasIt} name="rating" state={state} />
        <FormTextarea
          label={t.whatHappened}
          name="description"
          placeholder={t.descriptionPlaceholder}
          maxLength={2000}
          state={state}
        />
        <RadioCards
          legend={t.howUrgent}
          name="urgency"
          defaultValue="normal"
          state={state}
          options={[
            { value: "normal", label: t.canWait },
            { value: "urgent", label: t.urgent },
          ]}
        />

        <PhotoUpload
          mode="public"
          shortCode={code}
          maxFiles={3}
          label={t.addPhotos}
          hint={t.photosHint}
          removeLabel={t.removePhoto}
          uploadingLabel={t.uploadingPhoto}
        />

        <details className="group rounded-xl border p-4">
          <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between text-sm font-medium">
            {t.contactSummary}
            <span
              aria-hidden
              className="text-muted-foreground transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <FormField label={t.name} name="name" autoComplete="name" state={state} />
            <FormField
              label={t.email}
              name="email"
              type="email"
              autoComplete="email"
              state={state}
            />
            <FormField label={t.phone} name="phone" type="tel" autoComplete="tel" state={state} />
          </div>
        </details>

        {disclaimer && (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            {disclaimer}
          </p>
        )}

        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" name="consent" className="mt-0.5 size-5 accent-(--primary)" />
          <span>
            {t.consentBase}
            {sensitive && ` ${t.consentSensitive}`}
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
          {t.sendFeedback}
        </Button>
      </form>
    </div>
  )
}
