import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense, type CSSProperties } from "react"
import { CopyButton } from "@/components/copy-button"
import { Icon } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { detectLocale, getGuestStrings, isRtlLocale, SUPPORTED_LOCALES } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { getPublicTicket } from "@/server/modules/intake"
import { ClosureFeedbackForm } from "./closure-feedback-form"

export const metadata: Metadata = { title: "Your report", robots: { index: false } }

const STEP_OF: Record<string, number> = {
  new: 0,
  assigned: 1,
  accepted: 1,
  in_progress: 1,
  on_hold: 1,
  reopened: 1,
  pending_verification: 2,
  closed: 3,
  cancelled: 3,
}
const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

/** The reporter's private tracking page. Only the holder of the link can see it. */
export default function TrackingPage(props: PageProps<"/t/[token]">) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Tracking {...props} />
      </Suspense>
    </main>
  )
}

async function Tracking({ params, searchParams }: PageProps<"/t/[token]">) {
  await connection() // live ticket status, never prerendered
  const [{ token }, query, hdrs] = await Promise.all([params, searchParams, headers()])
  const locale = detectLocale(
    hdrs.get("accept-language"),
    typeof query.lang === "string" ? query.lang : null,
  )
  const t = getGuestStrings(locale)
  const dir = isRtlLocale(locale) ? "rtl" : "ltr"
  const ticket = await getPublicTicket(token)

  if (!ticket) {
    return (
      <div className="mt-16 text-center" dir={dir}>
        <h1 className="text-2xl font-bold tracking-tight">{t.notFoundTitle}</h1>
        <p className="mt-2 text-muted-foreground">{t.notFoundBody}</p>
      </div>
    )
  }

  const steps = [t.stepReceived, t.stepInProgress, t.stepVerifying, t.stepResolved] as const
  const current = STEP_OF[ticket.status] ?? 0
  const brandStyle = ticket.branding?.primaryColor
    ? ({ "--primary": ticket.branding.primaryColor } as CSSProperties)
    : undefined

  return (
    <div dir={dir} lang={locale} style={brandStyle}>
      <div className="mb-4 flex flex-wrap justify-center gap-1.5">
        {SUPPORTED_LOCALES.map((l) => (
          <Link
            key={l.code}
            href={`/t/${token}?lang=${l.code}${query.new ? "&new=1" : ""}${query.dup ? "&dup=1" : ""}`}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              locale === l.code
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {l.native}
          </Link>
        ))}
      </div>

      {query.new && (
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 animate-in place-items-center rounded-full bg-success/10 text-success ring-8 ring-success/5 duration-300 zoom-in-50">
            <Icon name="success" className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.thanksNewTitle}</h1>
          <p className="mt-1 text-muted-foreground">
            {ticket.tenantName} · {t.thanksNewSubtitle}
          </p>
        </div>
      )}
      {query.dup && (
        <div className="mb-6">
          <h1 className="mb-3 text-2xl font-bold tracking-tight">{t.thanksDupTitle}</h1>
          <Alert variant="info">
            <Icon name="info" />
            <AlertTitle>{t.dupAlertTitle}</AlertTitle>
            <AlertDescription>{t.dupAlertBody}</AlertDescription>
          </Alert>
        </div>
      )}

      <section aria-labelledby="ticket-heading" className="rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {query.new || query.dup ? t.yourTicket : ticket.tenantName}
        </p>
        <h2
          id="ticket-heading"
          className="mt-0.5 font-mono text-xl font-semibold"
          data-testid="ticket-number"
        >
          {ticket.number}
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t.where}</dt>
          <dd>{ticket.locationPath.join(" › ")}</dd>
          <dt className="text-muted-foreground">{t.about}</dt>
          <dd>{ticket.categoryName}</dd>
          <dt className="text-muted-foreground">{t.reported}</dt>
          <dd className="tabular-nums">{when.format(new Date(ticket.createdAt))} UTC</dd>
          {ticket.reportCount > 1 && (
            <>
              <dt className="text-muted-foreground">{t.reportsCount}</dt>
              <dd className="tabular-nums">
                {ticket.reportCount} {t.people}
              </dd>
            </>
          )}
        </dl>

        <ol aria-label={t.progressLabel} className="mt-6 space-y-3">
          {steps.map((step, i) => (
            <li
              key={step}
              aria-current={i === current ? "step" : undefined}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  i < current && "border-success bg-success text-success-foreground",
                  i === current && "border-primary bg-primary/10 text-primary",
                  i > current && "text-muted-foreground",
                )}
              >
                {i < current ? <Icon name="success" className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  i > current && "text-muted-foreground",
                  i === current && "font-semibold",
                )}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>

        {ticket.publicComments.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              {t.updatesHeading}
            </p>
            <ul className="space-y-2.5">
              {ticket.publicComments.map((c) => (
                <li key={c.id} className="rounded-xl border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    {c.authorName} · {when.format(new Date(c.createdAt))} UTC
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ticket.attachments.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              {t.photosHeading}
            </p>
            <div className="flex flex-wrap gap-2">
              {ticket.attachments.map((id) => (
                <a
                  key={id}
                  href={`/api/files/${id}?token=${encodeURIComponent(token)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block size-20 overflow-hidden rounded-lg border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${id}?token=${encodeURIComponent(token)}`}
                    alt={t.photosHeading}
                    className="size-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {ticket.status === "closed" &&
        (ticket.requesterFeedback ? (
          <div className="mt-6 rounded-2xl border border-success/40 bg-success/10 p-4 text-center text-sm font-medium text-success">
            {t.closureThanks}
          </div>
        ) : (
          <ClosureFeedbackForm token={token} strings={t} />
        ))}

      <p className="mt-6 text-center text-sm text-pretty text-muted-foreground">{t.bookmarkHint}</p>
      <div className="mt-3 flex justify-center">
        <CopyButton label={t.copyTrackingLink} />
      </div>
    </div>
  )
}
