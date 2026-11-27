import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getSurvey } from "@/server/modules/surveys"
import { getTenant } from "@/server/modules/tenants"
import { publicSurveyUrl } from "@/server/public-url"
import { qrSvg } from "@/server/qr-image"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = {
  title: "Print Survey QR Poster · QR Feed",
  robots: { index: false },
}

export default function PrintSurveyPage(props: PageProps<"/print/surveys/[surveyId]">) {
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-4 py-6 text-black print:max-w-none print:p-0">
      <Suspense fallback={<PageSkeleton />}>
        <Poster {...props} />
      </Suspense>
    </main>
  )
}

async function Poster({ params }: PageProps<"/print/surveys/[surveyId]">) {
  const { surveyId } = await params
  const ctx = await requireTenantContext()
  if (!can(ctx, "qr:read")) redirect("/dashboard")

  const [survey, tenant] = await Promise.all([
    getSurvey(ctx, surveyId).catch((err) => {
      if (err instanceof ApiError) notFound()
      throw err
    }),
    getTenant(ctx.tenantId),
  ])

  const url = publicSurveyUrl(survey.shortCode, tenant?.branding?.customDomain)
  const svg = await qrSvg(url)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Survey QR Poster</h1>
          <p className="text-sm text-gray-500">
            Print on A4 or standee paper for reception desks, waiting halls, wards, or counters.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/surveys/${surveyId}`}
            className="inline-flex h-11 items-center rounded-xl border border-gray-200 px-4 text-sm font-medium"
          >
            Back to survey
          </Link>
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto flex max-w-xl flex-col items-center rounded-3xl border-2 border-gray-900 p-10 text-center print:max-w-none print:border-2">
        <p className="text-xs font-bold tracking-[0.2em] text-gray-500 uppercase">
          {tenant?.name ?? "QR Feed"}
        </p>
        {survey.scopeLabel && (
          <p className="mt-1 text-sm font-medium text-gray-600">{survey.scopeLabel}</p>
        )}
        <h2 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight text-balance">
          {survey.title}
        </h2>
        {survey.description && (
          <p className="mt-2 max-w-md text-sm text-pretty text-gray-600">{survey.description}</p>
        )}

        <div
          role="img"
          aria-label={`QR code for ${survey.title}`}
          className="my-8 w-full max-w-72 rounded-2xl border border-gray-200 bg-white p-4 [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="text-lg font-bold">Scan with your phone camera</p>
        <p className="mt-1 text-sm text-gray-600">
          Takes less than a minute · No app or login required
        </p>
        <p className="mt-5 font-mono text-xs break-all text-gray-500">{url}</p>
      </article>
    </>
  )
}
