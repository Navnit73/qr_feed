import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { Icon } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"
import { recordScan, resolvePublicQr } from "@/server/modules/qr-codes"
import { FeedbackForm } from "./feedback-form"

export const metadata: Metadata = { title: "Report an issue", robots: { index: false } }

/** What a guest sees after scanning. No login, mobile first, fast on poor networks. */
export default function FeedbackPage({ params }: PageProps<"/f/[code]">) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <Feedback params={params} />
      </Suspense>
    </main>
  )
}

async function Feedback({ params }: Pick<PageProps<"/f/[code]">, "params">) {
  // Per-request: every view counts a scan and reads live data, so never prerender it.
  await connection()
  const { code } = await params
  const qr = await resolvePublicQr(code)

  if (!qr) {
    return (
      <div className="mt-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
          <Icon name="qr" className="size-7 text-muted-foreground" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">This QR code is no longer active</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          It may have been replaced. Please tell a member of staff, or look for a newer code nearby.
        </p>
      </div>
    )
  }

  await recordScan(qr.qrId)
  const parents = qr.locationPath.slice(0, -1)

  return (
    <>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          {qr.tenantName} · {qr.branchName}
          {parents.length > 0 && ` · ${parents.join(" › ")}`}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-balance">{qr.locationName}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Spotted a problem here? Tell us and the right person gets it straight away.
        </p>
      </header>
      <FeedbackForm
        code={code}
        categories={qr.categories.map((c) => ({ id: c.id, label: c.label }))}
        sensitive={qr.industry === "hospital" || qr.industry === "clinic"}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}
      />
      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="qr" className="size-3.5" /> Powered by QR Feed
      </p>
    </>
  )
}
