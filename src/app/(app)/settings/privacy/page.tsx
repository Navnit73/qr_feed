import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requireTenantContext } from "@/server/auth/session"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { PrivacyControls } from "./privacy-controls"

export const metadata: Metadata = { title: "Data & Privacy · QR Feed" }

export default async function PrivacySettingsPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "tenant:manage")) redirect("/settings")
  const tenant = await getTenant(ctx.tenantId)

  return (
    <>
      <PageHeader
        title="Data Governance (GDPR & DPDP)"
        description="Export all organisation records, configure retention & PII anonymisation, or request tenant deletion."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Privacy" },
        ]}
        actions={
          <a href="/api/tenant/export" className={buttonVariants({ size: "lg" })}>
            <Icon name="download" data-icon="inline-start" /> Download full JSON export
          </a>
        }
      />

      <PanelCard title="Retention, anonymisation & deletion">
        <PrivacyControls
          retentionDays={tenant?.settings?.retentionDays ?? 365}
          slug={tenant?.slug ?? ""}
        />
      </PanelCard>
    </>
  )
}
