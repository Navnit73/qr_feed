import type { Metadata } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { Suspense, type CSSProperties } from "react"
import { Icon } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"
import { detectLocale, getGuestStrings, isRtlLocale } from "@/lib/i18n"
import { recordScan, resolvePublicQr } from "@/server/modules/qr-codes"
import { FeedbackForm } from "./feedback-form"

export const metadata: Metadata = { title: "Report an issue", robots: { index: false } }

/** What a guest sees after scanning. No login, mobile first, fast on poor networks. */
export default function FeedbackPage(props: PageProps<"/f/[code]">) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <Feedback {...props} />
      </Suspense>
    </main>
  )
}

async function Feedback({ params, searchParams }: PageProps<"/f/[code]">) {
  // Per-request: every view counts a scan and reads live data, so never prerender it.
  await connection()
  const [{ code }, query, hdrs] = await Promise.all([params, searchParams, headers()])
  const locale = detectLocale(
    hdrs.get("accept-language"),
    typeof query.lang === "string" ? query.lang : null,
  )
  const t = getGuestStrings(locale)
  const qr = await resolvePublicQr(code)

  if (!qr) {
    return (
      <div className="mt-16 text-center" dir={isRtlLocale(locale) ? "rtl" : "ltr"}>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
          <Icon name="qr" className="size-7 text-muted-foreground" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.inactiveTitle}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{t.inactiveBody}</p>
      </div>
    )
  }

  await recordScan(qr.qrId)
  const parents = qr.locationPath.slice(0, -1)
  const brandStyle = qr.branding?.primaryColor
    ? ({ "--primary": qr.branding.primaryColor } as CSSProperties)
    : undefined

  return (
    <div style={brandStyle}>
      <header className="mb-4">
        {qr.branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr.branding.logoUrl}
            alt={qr.tenantName}
            className="mb-3 h-8 w-auto max-w-40 object-contain"
          />
        )}
        <p className="text-sm text-muted-foreground">
          {qr.tenantName} · {qr.branchName}
          {parents.length > 0 && ` · ${parents.join(" › ")}`}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-balance">{qr.locationName}</h1>
      </header>
      <FeedbackForm
        code={code}
        categories={qr.categories.map((c) => ({ id: c.id, key: c.key, label: c.label }))}
        sensitive={qr.industry === "hospital" || qr.industry === "clinic"}
        initialLocale={locale}
        disclaimer={qr.branding?.publicDisclaimer}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}
      />
      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="qr" className="size-3.5" /> {t.poweredBy}
      </p>
    </div>
  )
}
