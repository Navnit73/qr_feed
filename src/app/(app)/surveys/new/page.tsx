import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"
import { SurveyBuilder } from "../survey-builder"

export const metadata: Metadata = { title: "Create Survey · QR Feed" }

export default async function NewSurveyPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "qr:create")) redirect("/surveys")

  const [tenant, branchDocs, locationDocs] = await Promise.all([
    getTenant(ctx.tenantId),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
    can(ctx, "location:read")
      ? locations.forTenant(ctx).find({ status: "active" }, { sort: { path: 1 }, limit: 200 })
      : [],
  ])

  return (
    <>
      <PageHeader
        title="Create custom survey"
        description="Design your questions, preview the mobile patient experience, and generate a scannable QR code immediately."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Surveys", href: "/surveys" },
          { label: "New survey" },
        ]}
      />
      <SurveyBuilder
        mode="create"
        tenantName={tenant?.name ?? "Your Organisation"}
        canScopeAllBranches={ctx.branchScope === "all"}
        branches={branchDocs.map((b) => ({ value: b._id.toHexString(), label: b.name }))}
        locations={locationDocs.map((l) => ({
          value: l._id.toHexString(),
          label: l.path.join(" › "),
          branchId: l.branchId.toHexString(),
        }))}
      />
    </>
  )
}
