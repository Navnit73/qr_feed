"use client"

import Script from "next/script"
import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import { FormField, FormMessage, FormTextarea, RadioCards, RatingInput } from "@/components/form"
import { Icon } from "@/components/icons"
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
import { categoryIcon } from "./category-icon"

type State = ApiResponse<unknown> | null

export type Place = {
  tenantName: string
  branchName: string
  /** Location ancestors, outermost first (e.g. ["Main Block", "Floor 2"]). */
  parents: string[]
  locationName: string
  logoUrl?: string
}

export function FeedbackForm({
  code,
  place,
  categories,
  sensitive,
  initialLocale,
  turnstileSiteKey,
  disclaimer,
}: {
  code: string
  place: Place
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
    startTransition(async () => {
      try {
        const res = await submitFeedbackAction(code, data)
        setState(res)
        if (res && !res.ok) {
          ;(window as { turnstile?: { reset?: () => void } }).turnstile?.reset?.()
        }
      } catch {
        setState({
          ok: false,
          error: { code: "NETWORK", message: "Could not send feedback." },
        })
        ;(window as { turnstile?: { reset?: () => void } }).turnstile?.reset?.()
      }
    })
  }

  return (
    <div dir={dir} lang={locale}>
      <header className="relative overflow-hidden bg-primary px-4 pt-5 pb-12 text-primary-foreground sm:rounded-3xl sm:px-6">
        {/* Own element: tailwind-merge would drop bg-primary if bg-dots shared its cn() (BUG-001). */}
        <div
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-0 [--dot:color-mix(in_oklch,white_14%,transparent)]"
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            {place.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={place.logoUrl}
                alt=""
                className="h-9 w-auto max-w-32 rounded-lg bg-white object-contain p-1"
              />
            ) : (
              <span className="grid size-9 place-items-center rounded-lg bg-white/15">
                <Icon name="branch" className="size-4.5" />
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-semibold">{place.tenantName}</p>
          </div>

          {/* Compact language switcher for guests; scrolls sideways inside itself, never the page. */}
          <div
            className="-mx-4 mt-5 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
            role="group"
            aria-label={t.languageLabel}
          >
            <Icon name="globe" className="my-auto size-4 shrink-0 text-primary-foreground/60" />
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLocale(l.code)}
                aria-pressed={locale === l.code}
                className={cn(
                  "min-h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors focus-visible:outline-white",
                  locale === l.code
                    ? "bg-white text-primary"
                    : "bg-white/10 text-primary-foreground/85 hover:bg-white/20",
                )}
              >
                {l.native}
              </button>
            ))}
          </div>

          <p className="mt-6 flex items-start gap-1.5 text-xs font-medium text-primary-foreground/75">
            <Icon name="location" className="mt-px size-3.5 shrink-0" />
            <span>{[place.branchName, ...place.parents].join(" › ")}</span>
          </p>
          <h1 className="mt-1.5 text-[clamp(1.85rem,8vw,2.5rem)] leading-[1.08] font-bold tracking-tight text-balance">
            {place.locationName}
          </h1>
          <p className="mt-2 max-w-prose text-pretty text-primary-foreground/80">{t.subtitle}</p>
        </div>
      </header>

      {/* method="post" + disabled until hydrated, so an early tap never sends fields in the URL (BUG-005). */}
      <form
        onSubmit={onSubmit}
        method="post"
        className="relative -mt-6 space-y-3 px-3 sm:px-0"
        noValidate
      >
        <input type="hidden" name="lang" value={locale} />

        <Panel step={1}>
          <RadioCards
            legend={t.whatsItAbout}
            name="categoryId"
            state={state}
            options={categories.map((c) => ({
              value: c.id,
              label: translateCategoryLabel(locale, c.key, c.label),
              icon: categoryIcon(c.key),
            }))}
          />
        </Panel>

        <Panel step={2}>
          <div className="space-y-5">
            <RatingInput
              label={t.howWasIt}
              name="rating"
              state={state}
              starSingular={t.starSingular}
              starPlural={t.starPlural}
            />
            <FormTextarea
              label={t.whatHappened}
              name="description"
              placeholder={t.descriptionPlaceholder}
              maxLength={2000}
              state={state}
            />
          </div>
        </Panel>

        <Panel step={3}>
          <div className="space-y-5">
            <RadioCards
              legend={t.howUrgent}
              name="urgency"
              defaultValue="normal"
              state={state}
              options={[
                { value: "normal", label: t.canWait, icon: "clock" },
                { value: "urgent", label: t.urgent, icon: "warning", tone: "alert" },
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
          </div>
        </Panel>

        <details className="group rounded-2xl border bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <Icon name="mail" className="size-4" />
            </span>
            <span className="flex-1">{t.contactSummary}</span>
            <Icon
              name="expand"
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-4 px-4 pb-4">
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
          <p className="rounded-2xl border bg-muted/40 p-4 text-xs text-muted-foreground">
            {disclaimer}
          </p>
        )}

        <div className="rounded-2xl border bg-card p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 size-5 shrink-0 accent-(--primary)"
            />
            <span>
              {t.consentBase}
              {sensitive && ` ${t.consentSensitive}`}
            </span>
          </label>
          {state && !state.ok && state.error.details?.consent && (
            <p className="mt-2 text-sm text-destructive">{state.error.details.consent[0]}</p>
          )}
        </div>

        {turnstileSiteKey && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
          </>
        )}

        <FormMessage state={state} />

        {/* Sticky so the send button is always a thumb away on long forms. */}
        <div className="sticky bottom-0 z-10 -mx-3 border-t bg-background/85 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <Button type="submit" size="xl" className="w-full" loading={pending} disabled={!hydrated}>
            <Icon name="feedback" data-icon="inline-start" />
            {t.sendFeedback}
          </Button>
        </div>
      </form>
      <p className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
        <Icon name="qr" className="size-3.5" /> {t.poweredBy}
      </p>
    </div>
  )
}

/** One numbered step of the form, as a card. */
function Panel({ step, children }: { step: number; children: ReactNode }) {
  return (
    <section className="relative rounded-2xl border bg-card p-4">
      <span
        aria-hidden
        className="absolute end-4 top-4 grid size-6 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground tabular-nums"
      >
        {step}
      </span>
      {children}
    </section>
  )
}
