import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { canMutateSurvey, getSurvey } from "@/server/modules/surveys"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"
import { SurveyBuilder } from "../../survey-builder"

export const metadata: Metadata = { title: "Edit Survey · QR Feed" }

export default async function EditSurveyPage({ params }: PageProps<"/surveys/[surveyId]/edit">) {
  const { surveyId } = await params
  const ctx = await requireTenantContext()
  if (!can(ctx, "qr:create")) redirect("/surveys")

  const [survey, tenant, branchDocs, locationDocs] = await Promise.all([
    getSurvey(ctx, surveyId).catch((err) => {
      if (err instanceof ApiError) notFound()
      throw err
    }),
    getTenant(ctx.tenantId),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
    can(ctx, "location:read")
      ? locations.forTenant(ctx).find({ status: "active" }, { sort: { path: 1 }, limit: 200 })
      : [],
  ])
  if (!canMutateSurvey(ctx, survey)) redirect(`/surveys/${surveyId}`)

  return (
    <>
      <PageHeader
        title={`Edit · ${survey.title}`}
        description="Update questions, choices, or thank-you text. Existing responses and QR links remain intact."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Surveys", href: "/surveys" },
          { label: survey.title, href: `/surveys/${surveyId}` },
          { label: "Edit" },
        ]}
      />
      <SurveyBuilder
        mode="edit"
        tenantName={tenant?.name ?? "Your Organisation"}
        canScopeAllBranches={ctx.branchScope === "all"}
        branches={branchDocs.map((b) => ({ value: b._id.toHexString(), label: b.name }))}
        locations={locationDocs.map((l) => ({
          value: l._id.toHexString(),
          label: l.path.join(" › "),
          branchId: l.branchId.toHexString(),
        }))}
        initial={{
          id: survey._id.toHexString(),
          title: survey.title,
          description: survey.description ?? "",
          branchId: survey.branchId?.toHexString() ?? "",
          locationId: survey.locationId?.toHexString() ?? "",
          collectContact: survey.collectContact,
          thankYouMessage: survey.thankYouMessage ?? "",
          questions: survey.questions.map((q) => ({
            id: q.id,
            type: q.type,
            label: q.label,
            helpText: q.helpText ?? "",
            required: q.required,
            ...(q.options ? { options: [...q.options] } : {}),
          })),
        }}
      />
    </>
  )
}
