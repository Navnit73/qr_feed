import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { SEVERITY_BADGE } from "@/lib/ticket-display"
import { requireTenantContext } from "@/server/auth/session"
import { listAssignmentRules } from "@/server/modules/assignment"
import { listBranches } from "@/server/modules/branches"
import { listAllCategories } from "@/server/modules/categories"
import { listMembers } from "@/server/modules/members"
import { listCustomRoles } from "@/server/modules/roles"
import { listEscalationEvents, listSlaPolicies } from "@/server/modules/sla"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { locations as locationsRepo } from "@/server/repositories"
import {
  AssignmentRuleActions,
  AutomationSettingsForm,
  CreateAssignmentRuleDialog,
  CreateCategoryDialog,
  CreateSlaPolicyDialog,
  DeleteSlaPolicyButton,
  EditCategoryDialog,
  RunSweepButton,
} from "./settings-forms"
import { SettingsNav, settingsTabs } from "./settings-nav"

export const metadata: Metadata = { title: "Settings · QR Feed" }

const fmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const ctx = await requireTenantContext()
  const canManageSla = can(ctx, "settings:sla")
  const canManageSettings = can(ctx, "settings:manage")
  const canManageTenant = can(ctx, "tenant:manage")
  const canBill = can(ctx, "billing:manage") || canManageTenant
  if (!canManageSla && !canManageSettings && !canManageTenant && !canBill) {
    redirect("/dashboard")
  }

  const tabs = settingsTabs(ctx)

  const inlineKeys = tabs.filter((t) => t.inline).map((t) => t.key)
  if (inlineKeys.length === 0) {
    redirect(canBill ? "/settings/billing" : "/settings/notifications")
  }

  const sp = await searchParams
  const requestedTab = typeof sp.tab === "string" ? sp.tab : inlineKeys[0]
  const tab = inlineKeys.includes(requestedTab) ? requestedTab : inlineKeys[0]

  const tenant = await getTenant(ctx.tenantId)
  // Load only the collections required by the active tab for fast Settings switching.
  const [policies, escalations, rules, categories, branches, members, customRoles, locationDocs] =
    await Promise.all([
      tab === "sla" && (can(ctx, "ticket:read") || canManageSla) ? listSlaPolicies(ctx) : [],
      tab === "sla" && can(ctx, "ticket:read") ? listEscalationEvents(ctx) : [],
      tab === "assignment" && (can(ctx, "ticket:assign") || canManageSettings)
        ? listAssignmentRules(ctx)
        : [],
      tab === "sla" || tab === "assignment" || tab === "categories"
        ? listAllCategories(ctx, tenant?.industry ?? "other")
        : [],
      (tab === "sla" || tab === "assignment") && can(ctx, "branch:read") ? listBranches(ctx) : [],
      tab === "assignment" && can(ctx, "user:read") ? listMembers(ctx) : [],
      tab === "sla" && canManageSla ? listCustomRoles(ctx) : [],
      tab === "assignment" && can(ctx, "location:read")
        ? locationsRepo
            .forTenant(ctx)
            .find({ status: "active" }, { sort: { path: 1 }, limit: 200, projection: { path: 1 } })
        : [],
    ])

  const branchOpts = branches.map((b) => ({ value: b._id.toHexString(), label: b.name }))
  const categoryOpts = categories.map((c) => ({ value: c._id.toHexString(), label: c.label }))
  const memberOpts = members
    .filter((m) => m.status === "active")
    .map((m) => ({ value: m.userId, label: m.name }))
  const memberName = new Map(members.map((m) => [m.userId, m.name]))
  const customRoleOpts = customRoles.map((r) => ({
    value: `custom:${r._id.toHexString()}`,
    label: `${r.name} (custom)`,
  }))
  const locationOpts = locationDocs.map((l) => ({
    value: l._id.toHexString(),
    label: l.path.join(" › "),
  }))

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure SLAs, auto-assignment, categories, branding, billing and integrations."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
      />

      <SettingsNav tabs={tabs} active={tab} />

      {tab === "sla" && (
        <div className="space-y-6">
          <PanelCard
            title="SLA policies"
            description="L1 → L2 → L3 acceptance and resolution targets honouring branch time zones and business hours."
            action={
              canManageSla && (
                <div className="flex flex-wrap items-center gap-2">
                  <RunSweepButton />
                  <CreateSlaPolicyDialog
                    branches={branchOpts}
                    categories={categoryOpts}
                    customRoles={customRoleOpts}
                  />
                </div>
              )
            }
          >
            {policies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No SLA policies configured yet. Create one to attach automatic L1 → L2 → L3
                deadlines to every ticket.
              </p>
            ) : (
              <ul className="space-y-4">
                {policies.map((p) => (
                  <li key={p._id.toHexString()} className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Mode: {p.businessHoursMode === "24x7" ? "24×7" : "Branch business hours"}
                          {p.appliesTo.severity ? ` · Severity: ${p.appliesTo.severity}` : ""}
                        </p>
                      </div>
                      {canManageSla && (
                        <DeleteSlaPolicyButton id={p._id.toHexString()} name={p.name} />
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {p.levels.map((lvl) => (
                        <div key={lvl.level} className="rounded-lg border bg-card p-3 text-xs">
                          <p className="font-semibold">Level {lvl.level}</p>
                          <p className="mt-1 text-muted-foreground tabular-nums">
                            Accept: {lvl.acceptWithinMin}m · Resolve: {lvl.resolveWithinMin}m
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            Target: {lvl.targetRole} ({lvl.action})
                          </p>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Recent escalation events"
            description="Every automatic L1 → L2 → L3 escalation logged by the SLA engine."
          >
            {escalations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No escalations triggered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ticket</th>
                      <th className="px-3 py-2 font-medium">Escalation</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">When (UTC)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {escalations.map((e) => (
                      <tr key={e._id.toHexString()}>
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link
                            href={`/tickets/${e.ticketId.toHexString()}`}
                            className="text-primary hover:underline"
                          >
                            {e.ticketNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="warning">
                            L{e.fromLevel} → L{e.toLevel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{e.reason}</td>
                        <td className="px-3 py-2 capitalize">{e.action}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                          {fmt.format(e.at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>
        </div>
      )}

      {tab === "assignment" && (
        <PanelCard
          title="Auto-assignment rules"
          description="Ordered by priority (lowest number first). Unmatched tickets go to the unassigned queue."
          action={
            canManageSettings && (
              <CreateAssignmentRuleDialog
                branches={branchOpts}
                locations={locationOpts}
                categories={categoryOpts}
                members={memberOpts}
              />
            )
          }
        >
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Add a rule to automatically route incoming QR tickets to L1 staff.
            </p>
          ) : (
            <ul className="-mx-4 divide-y">
              {rules.map((r) => (
                <li
                  key={r._id.toHexString()}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono tabular-nums">
                        #{r.priority}
                      </Badge>
                      <span className="font-medium">{r.name}</span>
                      <Badge variant={r.active ? "success" : "muted"}>
                        {r.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Strategy: {r.strategy.replaceAll("_", " ")} · Pool:{" "}
                      {r.userIds.map((uid) => memberName.get(uid) ?? uid).join(", ")}
                    </p>
                  </div>
                  {canManageSettings && (
                    <AssignmentRuleActions id={r._id.toHexString()} active={r.active} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      )}

      {tab === "categories" && (
        <PanelCard
          title="Feedback categories"
          description="Shown on every public QR form. Configure default severity, RCA triggers and mandatory photo evidence."
          action={canManageSettings && <CreateCategoryDialog />}
        >
          <ul className="-mx-4 divide-y">
            {categories.map((c) => (
              <li
                key={c._id.toHexString()}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{c.key}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={SEVERITY_BADGE[c.defaultSeverity]} className="capitalize">
                    {c.defaultSeverity}
                  </Badge>
                  {c.requiresRCA && <Badge variant="warning">Requires RCA</Badge>}
                  {c.requiresResolutionEvidence && <Badge variant="info">Evidence required</Badge>}
                  {!c.active && <Badge variant="muted">Hidden</Badge>}
                </div>
                {canManageSettings && (
                  <EditCategoryDialog
                    category={{
                      id: c._id.toHexString(),
                      label: c.label,
                      defaultSeverity: c.defaultSeverity,
                      requiresRCA: Boolean(c.requiresRCA),
                      requiresResolutionEvidence: Boolean(c.requiresResolutionEvidence),
                      active: c.active,
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {tab === "automation" && (
        <PanelCard
          title="Verification & RCA automation"
          description="Control automatic closure of stale verifications and repeat-issue RCA prompts."
        >
          {canManageSettings ? (
            <AutomationSettingsForm
              autoCloseDays={tenant?.settings?.autoCloseDays ?? 0}
              repeatRcaThreshold={tenant?.settings?.repeatRcaThreshold ?? 3}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only administrators with settings permission can change automation rules.
            </p>
          )}
        </PanelCard>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/branches" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Manage branches &amp; time zones
        </Link>
        <Link href="/users" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Manage users &amp; custom roles
        </Link>
      </div>
    </>
  )
}
