import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { CopyButton } from "@/components/copy-button"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { canMutateSurvey, getSurveyDetailWithAnalytics } from "@/server/modules/surveys"
import { getTenant } from "@/server/modules/tenants"
import { publicSurveyUrl } from "@/server/public-url"
import { can } from "@/server/rbac/ability"
import { ArchiveSurveyButton, SurveyQrButton, SurveyStatusButton } from "../survey-controls"

export const metadata: Metadata = { title: "Survey Analytics · QR Feed" }

const fmtDateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

function formatValue(val: string | number | boolean | string[] | null): string {
  if (val === null || val === undefined || val === "") return "–"
  if (typeof val === "boolean") return val ? "Yes" : "No"
  if (Array.isArray(val)) return val.join(", ")
  return String(val)
}

export default async function SurveyDetailPage({ params }: PageProps<"/surveys/[surveyId]">) {
  const { surveyId } = await params
  const ctx = await requireTenantContext()
  if (!can(ctx, "qr:read")) redirect("/dashboard")

  const [detail, tenant] = await Promise.all([
    getSurveyDetailWithAnalytics(ctx, surveyId).catch((err) => {
      if (err instanceof ApiError) notFound()
      throw err
    }),
    getTenant(ctx.tenantId),
  ])

  const { survey, stats, breakdowns, recentResponses } = detail
  const id = survey._id.toHexString()
  const url = publicSurveyUrl(survey.shortCode, tenant?.branding?.customDomain)
  const canMutate = canMutateSurvey(ctx, survey)
  const canEdit = can(ctx, "qr:create") && canMutate
  const canRevoke = can(ctx, "qr:revoke") && canMutate
  const canExport = can(ctx, "report:export")

  return (
    <>
      <PageHeader
        title={survey.title}
        description={survey.description || "Scan the QR code below to collect structured feedback."}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Surveys", href: "/surveys" },
          { label: survey.title },
        ]}
        actions={
          <>
            <SurveyQrButton
              survey={{
                id,
                title: survey.title,
                shortCode: survey.shortCode,
                url,
                scanCount: survey.scanCount,
              }}
              canRegenerate={canEdit && canRevoke}
              size="lg"
            />
            <Link
              href={`/print/surveys/${id}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Icon name="print" data-icon="inline-start" /> Print poster
            </Link>
            <a
              href={`/s/${survey.shortCode}`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Icon name="eye" data-icon="inline-start" /> Open patient form
            </a>
            {canEdit && (
              <Link
                href={`/surveys/${id}/edit`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <Icon name="edit" data-icon="inline-start" /> Edit
              </Link>
            )}
            {canEdit && <SurveyStatusButton surveyId={id} status={survey.status} />}
            {canExport && (
              <a
                href={`/api/surveys/${id}/export`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <Icon name="download" data-icon="inline-start" /> Export CSV
              </a>
            )}
            {canRevoke && survey.status !== "archived" && (
              <ArchiveSurveyButton surveyId={id} title={survey.title} />
            )}
          </>
        }
      />

      {/* Quick QR & Public Link Strip */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={survey.status === "active" ? "success" : "warning"}
            className="capitalize"
          >
            {survey.status}
          </Badge>
          {survey.scopeLabel && <Badge variant="muted">{survey.scopeLabel}</Badge>}
          <span className="font-mono text-xs text-muted-foreground">{url}</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={url} label="Copy public link" />
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total responses"
          value={stats.totalResponses.toLocaleString()}
          icon="feedback"
        />
        <StatCard
          label="QR scans"
          value={stats.scanCount.toLocaleString()}
          footer={
            <span className="text-muted-foreground">
              {stats.completionPct !== null
                ? `${stats.completionPct}% completion rate`
                : "Share QR to track scans"}
            </span>
          }
          icon="qr"
        />
        <StatCard
          label="Average star rating"
          value={stats.avgRating !== null ? `${stats.avgRating} / 5` : "–"}
          icon="rating"
        />
        <StatCard
          label="Net Promoter Score (NPS)"
          value={
            stats.npsScore !== null ? `${stats.npsScore > 0 ? "+" : ""}${stats.npsScore}` : "–"
          }
          footer={
            <span className="text-muted-foreground">
              {stats.npsScore !== null ? "Range: −100 to +100" : "Add an NPS question to track"}
            </span>
          }
          icon="report"
        />
      </div>

      {/* Per-Question Analytics Breakdown */}
      <section className="mb-6 space-y-4">
        <h2 className="text-base font-semibold">Question breakdown</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {breakdowns.map((b, idx) => (
            <PanelCard
              key={b.questionId}
              title={`${idx + 1}. ${b.label}`}
              description={`${b.answered} ${b.answered === 1 ? "answer" : "answers"}`}
            >
              {b.type === "rating" && (
                <div className="space-y-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {b.average !== null ? b.average.toFixed(1) : "–"}
                    </span>
                    <span className="text-xs text-muted-foreground">out of 5 stars</span>
                  </div>
                  <div className="space-y-1.5">
                    {b.distribution.map((row) => (
                      <div key={row.star} className="flex items-center gap-2 text-xs">
                        <span className="w-10 shrink-0 font-medium tabular-nums">{row.star} ★</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                          {row.count} ({row.pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {b.type === "nps" && (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {b.nps !== null ? `${b.nps > 0 ? "+" : ""}${b.nps}` : "–"}
                    </span>
                    <span className="text-xs text-muted-foreground">NPS score</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg border bg-emerald-500/10 p-2">
                      <p className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                        {b.promoters}
                      </p>
                      <p className="text-muted-foreground">Promoters (9–10)</p>
                    </div>
                    <div className="rounded-lg border bg-amber-500/10 p-2">
                      <p className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                        {b.passives}
                      </p>
                      <p className="text-muted-foreground">Passives (7–8)</p>
                    </div>
                    <div className="rounded-lg border bg-destructive/10 p-2">
                      <p className="font-semibold text-destructive tabular-nums">{b.detractors}</p>
                      <p className="text-muted-foreground">Detractors (0–6)</p>
                    </div>
                  </div>
                </div>
              )}

              {(b.type === "single_choice" || b.type === "multi_choice" || b.type === "yes_no") && (
                <div className="space-y-2">
                  {b.options.map((opt) => (
                    <div key={opt.label} className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {opt.count} ({opt.pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${opt.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(b.type === "short_text" || b.type === "long_text") && (
                <div className="space-y-2">
                  {b.samples.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No written responses yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {b.samples.map((s, sIdx) => (
                        <li key={sIdx} className="rounded-lg border bg-muted/30 p-2.5 text-xs">
                          <p className="text-foreground">“{s.text}”</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            — {s.respondent} · {fmtDateTime.format(new Date(s.submittedAt))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </PanelCard>
          ))}
        </div>
      </section>

      {/* Individual Responses Table */}
      <PanelCard
        title={`Recent responses (${recentResponses.length})`}
        description="Every submission captured when patients or guests scan this survey's QR code."
      >
        {recentResponses.length === 0 ? (
          <EmptyState
            icon="qr"
            title="Waiting for the first response"
            description="Open the patient form or print the QR poster and scan it from your phone to test submitting feedback."
            action={
              <a
                href={`/s/${survey.shortCode}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "lg" })}
              >
                <Icon name="eye" data-icon="inline-start" /> Open live survey form
              </a>
            }
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Submitted
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Respondent
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Rating / NPS
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Answers
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentResponses.map((r) => (
                  <tr key={r._id.toHexString()} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {fmtDateTime.format(r.submittedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {r.respondent.anonymous ? (
                        <span className="text-muted-foreground">Anonymous</span>
                      ) : (
                        <div>
                          <p className="font-medium">{r.respondent.name || "Respondent"}</p>
                          {r.respondent.email && (
                            <p className="text-muted-foreground">{r.respondent.email}</p>
                          )}
                          {r.respondent.phone && (
                            <p className="text-muted-foreground">{r.respondent.phone}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1.5">
                        {typeof r.overallRating === "number" && (
                          <Badge variant="secondary" className="tabular-nums">
                            {r.overallRating} ★
                          </Badge>
                        )}
                        {typeof r.npsScore === "number" && (
                          <Badge
                            variant={
                              r.npsScore >= 9
                                ? "success"
                                : r.npsScore >= 7
                                  ? "warning"
                                  : "destructive"
                            }
                            className="tabular-nums"
                          >
                            NPS {r.npsScore}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <dl className="grid gap-1.5 sm:grid-cols-2">
                        {r.answers.map((a) => (
                          <div key={a.questionId} className="min-w-0">
                            <dt className="truncate font-medium text-muted-foreground">
                              {a.questionLabel}
                            </dt>
                            <dd className="text-foreground">{formatValue(a.value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </>
  )
}
