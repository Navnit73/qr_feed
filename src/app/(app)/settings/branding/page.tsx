import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { requireTenantContext } from "@/server/auth/session"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { BrandingForm } from "./branding-form"

export const metadata: Metadata = { title: "White-label Branding · QR Feed" }

export default async function BrandingPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "tenant:manage")) redirect("/settings")
  const tenant = await getTenant(ctx.tenantId)

  return (
    <>
      <PageHeader
        title="White-label branding"
        description="Customise your public QR intake form, colours, custom domain and email sender domain."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Branding" },
        ]}
      />
      <PanelCard title="Brand identity">
        <BrandingForm initial={tenant?.branding ?? {}} />
      </PanelCard>
    </>
  )
}
