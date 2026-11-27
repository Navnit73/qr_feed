import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { requireTenantContext } from "@/server/auth/session"
import { canMutateSurvey, listSurveys } from "@/server/modules/surveys"
import { getTenant } from "@/server/modules/tenants"
import { publicSurveyUrl } from "@/server/public-url"
import { can } from "@/server/rbac/ability"
import { SurveyQrButton, SurveyStatusButton } from "./survey-controls"

export const metadata: Metadata = { title: "Surveys · QR Feed" }

const fmtDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default async function SurveysPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "qr:read")) redirect("/dashboard")

  const canCreate = can(ctx, "qr:create")
  const canRevoke = can(ctx, "qr:revoke")
  const [surveyList, tenant] = await Promise.all([listSurveys(ctx), getTenant(ctx.tenantId)])
  const customDomain = tenant?.branding?.customDomain

  const activeCount = surveyList.filter((s) => s.status === "active").length
  const totalScans = surveyList.reduce((acc, s) => acc + s.scanCount, 0)
  const totalResponses = surveyList.reduce((acc, s) => acc + s.responseCount, 0)
  const responseRate =
    totalScans > 0 ? `${Math.min(100, Math.round((totalResponses / totalScans) * 100))}%` : "–"

  return (
    <>
      <PageHeader
        title="Custom Surveys"
        description="Build custom QR feedback forms — like Patient Satisfaction, OPD Pulse, or Discharge surveys — and collect responses instantly."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Surveys" }]}
        actions={
          canCreate && (
            <Link href="/surveys/new" className={buttonVariants({ size: "xl" })}>
              <Icon name="plus" data-icon="inline-start" /> Create survey
            </Link>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active surveys" value={activeCount} icon="feedback" />
        <StatCard label="Total QR scans" value={totalScans.toLocaleString()} icon="qr" />
        <StatCard
          label="Responses collected"
          value={totalResponses.toLocaleString()}
          icon="check"
        />
        <StatCard label="Scan → response rate" value={responseRate} icon="report" />
      </div>

      {surveyList.length === 0 ? (
        <EmptyState
          icon="feedback"
          title="No custom surveys yet"
          description="Create a Patient Satisfaction Survey or any custom form in seconds — QR codes, printable posters, and live response analytics are generated automatically."
          action={
            canCreate ? (
              <Link href="/surveys/new" className={buttonVariants({ size: "xl" })}>
                <Icon name="plus" data-icon="inline-start" /> Create your first survey
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {surveyList.map((s) => {
            const id = s._id.toHexString()
            const url = publicSurveyUrl(s.shortCode, customDomain)
            return (
              <li
                key={id}
                className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={s.status === "active" ? "success" : "warning"}
                        className="capitalize"
                      >
                        {s.status}
                      </Badge>
                      {s.scopeLabel && <Badge variant="muted">{s.scopeLabel}</Badge>}
                      <Badge variant="outline" className="tabular-nums">
                        {s.questions.length} {s.questions.length === 1 ? "question" : "questions"}
                      </Badge>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      /s/{s.shortCode}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={`/surveys/${id}`}
                      className="text-lg font-semibold tracking-tight hover:text-primary hover:underline"
                    >
                      {s.title}
                    </Link>
                    {s.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="qr" className="size-3.5" /> {s.scanCount.toLocaleString()} scans
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Icon name="feedback" className="size-3.5 text-primary" />{" "}
                      {s.responseCount.toLocaleString()}{" "}
                      {s.responseCount === 1 ? "response" : "responses"}
                    </span>
                    <span>Created {fmtDate.format(s.createdAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-3.5">
                  <SurveyQrButton
                    survey={{
                      id,
                      title: s.title,
                      shortCode: s.shortCode,
                      url,
                      scanCount: s.scanCount,
                    }}
                    canRegenerate={canCreate && canRevoke && canMutateSurvey(ctx, s)}
                    size="sm"
                  />
                  <Link
                    href={`/print/surveys/${id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Icon name="print" data-icon="inline-start" /> Poster
                  </Link>
                  <a
                    href={`/s/${s.shortCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Icon name="eye" data-icon="inline-start" /> Preview
                  </a>
                  {canCreate && canMutateSurvey(ctx, s) && (
                    <SurveyStatusButton surveyId={id} status={s.status} size="sm" />
                  )}
                  <Link
                    href={`/surveys/${id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto")}
                  >
                    Responses &amp; analytics →
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
