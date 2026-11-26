import type { Metadata } from "next"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { timeZoneOptions } from "@/lib/time-zones"
import { requireTenantContext } from "@/server/auth/session"
import { getNotificationPreferences } from "@/server/modules/reports"
import { NotificationPrefsForm } from "./prefs-form"

export const metadata: Metadata = { title: "Notification preferences · QR Feed" }

export default async function NotificationPrefsPage() {
  const ctx = await requireTenantContext()
  const prefs = await getNotificationPreferences(ctx)

  return (
    <>
      <PageHeader
        title="Notification preferences"
        description="Choose how and when you receive alerts, quiet hours and digests."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Notifications" },
        ]}
      />
      <PanelCard title="Personal alert settings">
        <NotificationPrefsForm prefs={prefs} timeZones={timeZoneOptions()} />
      </PanelCard>
    </>
  )
}
