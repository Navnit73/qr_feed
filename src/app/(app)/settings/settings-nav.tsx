import Link from "next/link"
import { cn } from "@/lib/utils"
import type { TenantContext } from "@/server/db/tenant-context"
import { can } from "@/server/rbac/ability"

export type SettingsTab = { key: string; label: string; href: string; inline: boolean }

/**
 * One source of truth for the Settings tabs, so `/settings` and every `/settings/*` sub-page
 * show the same bar. `inline` tabs render inside `/settings?tab=…`; the rest are own routes.
 */
export function settingsTabs(ctx: TenantContext): SettingsTab[] {
  const canManageSla = can(ctx, "settings:sla")
  const canManageSettings = can(ctx, "settings:manage")
  const canManageTenant = can(ctx, "tenant:manage")
  const canBill = can(ctx, "billing:manage") || canManageTenant

  return [
    ...(canManageSla || canManageSettings || canManageTenant
      ? [{ key: "sla", label: "SLA & Escalation", href: "/settings?tab=sla", inline: true }]
      : []),
    ...(canManageSettings || can(ctx, "ticket:assign")
      ? [
          {
            key: "assignment",
            label: "Assignment rules",
            href: "/settings?tab=assignment",
            inline: true,
          },
        ]
      : []),
    ...(canManageSettings || canManageTenant
      ? [
          {
            key: "categories",
            label: "Categories",
            href: "/settings?tab=categories",
            inline: true,
          },
          {
            key: "automation",
            label: "Automation",
            href: "/settings?tab=automation",
            inline: true,
          },
        ]
      : []),
    {
      key: "notifications",
      label: "Notifications",
      href: "/settings/notifications",
      inline: false,
    },
    ...(canManageTenant
      ? [{ key: "branding", label: "Branding", href: "/settings/branding", inline: false }]
      : []),
    ...(canBill
      ? [{ key: "billing", label: "Billing & Plan", href: "/settings/billing", inline: false }]
      : []),
    ...(canManageSettings
      ? [
          {
            key: "integrations",
            label: "API & Webhooks",
            href: "/settings/integrations",
            inline: false,
          },
        ]
      : []),
    ...(canManageTenant
      ? [{ key: "privacy", label: "Data & Privacy", href: "/settings/privacy", inline: false }]
      : []),
  ]
}

export function SettingsNav({ tabs, active }: { tabs: SettingsTab[]; active: string }) {
  // A lone tab (e.g. a member who can only reach Notifications) is just noise.
  if (tabs.length < 2) return null
  return (
    <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-1.5 border-b pb-3">
      {tabs.map((t) => {
        const isActive = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
