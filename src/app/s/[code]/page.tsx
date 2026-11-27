import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense, type CSSProperties } from "react"
import { Icon } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"
import { recordSurveyScan, resolvePublicSurvey } from "@/server/modules/surveys"
import { PublicSurveyForm } from "./survey-form"

export const metadata: Metadata = { title: "Survey · QR Feed", robots: { index: false } }

/** Public mobile-first survey form opened when a patient or guest scans a survey QR code. */
export default function SurveyScanPage(props: PageProps<"/s/[code]">) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg sm:py-6">
      <Suspense fallback={<Skeleton className="m-4 h-[32rem]" />}>
        <SurveyView {...props} />
      </Suspense>
    </main>
  )
}

async function SurveyView({ params }: PageProps<"/s/[code]">) {
  await connection()
  const { code } = await params
  const survey = await resolvePublicSurvey(code)

  if (!survey) {
    return (
      <div className="mt-16 px-4 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
          <Icon name="qr" className="size-7 text-muted-foreground" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Survey not available</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          This QR code is inactive or has been replaced. Please scan the latest poster at the desk.
        </p>
      </div>
    )
  }

  if (survey.status !== "active") {
    return (
      <div className="mt-16 px-4 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
          <Icon name="pause" className="size-7 text-muted-foreground" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{survey.title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          This survey is temporarily paused and not accepting responses right now.
        </p>
      </div>
    )
  }

  await recordSurveyScan(survey.surveyId)

  const brandStyle = survey.branding?.primaryColor
    ? ({
        "--primary": survey.branding.primaryColor,
        "--primary-hover": survey.branding.primaryColor,
        "--ring": survey.branding.primaryColor,
      } as CSSProperties)
    : undefined

  return (
    <div style={brandStyle}>
      <PublicSurveyForm
        code={code}
        tenantName={survey.tenantName}
        scopeLabel={survey.scopeLabel}
        logoUrl={survey.branding?.logoUrl}
        title={survey.title}
        description={survey.description}
        questions={survey.questions}
        collectContact={survey.collectContact}
        sensitive={survey.industry === "hospital" || survey.industry === "clinic"}
        disclaimer={survey.branding?.publicDisclaimer}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}
      />
    </div>
  )
}
