import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { requireTenantContext } from "@/server/auth/session"
import { listApiKeys, listWebhooks } from "@/server/modules/platform"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import {
  ConnectorsAndSsoForm,
  CreateApiKeyDialog,
  CreateWebhookDialog,
  RevokeKeyButton,
  WebhookRowActions,
} from "./integrations-controls"

export const metadata: Metadata = { title: "API & Integrations · QR Feed" }

export default async function IntegrationsPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "settings:manage")) redirect("/settings")

  const [keys, { hooks, deliveries }, tenant] = await Promise.all([
    listApiKeys(ctx),
    listWebhooks(ctx),
    getTenant(ctx.tenantId),
  ])

  return (
    <>
      <PageHeader
        title="API, Webhooks & SSO"
        description="Connect QR Feed to BI tools, Slack, Microsoft Teams, WhatsApp and enterprise identity providers."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Integrations" },
        ]}
      />

      <div className="space-y-6">
        <PanelCard
          title="REST API keys"
          description="Endpoints: GET/POST /api/v1/tickets · GET /api/v1/locations"
          action={<CreateApiKeyDialog />}
        >
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys created yet.</p>
          ) : (
            <ul className="-mx-4 divide-y">
              {keys.map((k) => (
                <li
                  key={k._id.toHexString()}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {k.name}{" "}
                      <code className="ml-1 font-mono text-xs text-muted-foreground">
                        {k.prefix}…
                      </code>
                    </p>
                    <p className="text-xs text-muted-foreground">Scopes: {k.scopes.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={k.revokedAt ? "destructive" : "success"}>
                      {k.revokedAt ? "Revoked" : "Active"}
                    </Badge>
                    {!k.revokedAt && <RevokeKeyButton id={k._id.toHexString()} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          title="Webhooks"
          description="Receive signed HMAC-SHA256 HTTP callbacks on ticket and escalation events."
          action={<CreateWebhookDialog />}
        >
          {hooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhooks registered.</p>
          ) : (
            <ul className="-mx-4 divide-y">
              {hooks.map((h) => (
                <li
                  key={h._id.toHexString()}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{h.url}</p>
                    <p className="text-xs text-muted-foreground">
                      Events: {h.events.join(", ")} · Secret: {h.secretPreview}
                    </p>
                  </div>
                  <WebhookRowActions id={h._id.toHexString()} />
                </li>
              ))}
            </ul>
          )}
          {deliveries.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                Recent deliveries
              </p>
              <ul className="space-y-1 text-xs">
                {deliveries.slice(0, 5).map((d) => (
                  <li key={d._id.toHexString()} className="flex items-center justify-between">
                    <span className="font-mono">{d.event}</span>
                    <Badge variant={d.ok ? "success" : "destructive"}>
                      {d.statusCode || "ERR"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PanelCard>

        <PanelCard title="Slack, Teams, WhatsApp & Enterprise SSO">
          <ConnectorsAndSsoForm settings={tenant?.settings ?? {}} />
        </PanelCard>
      </div>
    </>
  )
}
