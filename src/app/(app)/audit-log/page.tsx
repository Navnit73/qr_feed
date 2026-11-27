import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listAudit, verifyChain } from "@/server/audit/audit-log"
import { requireTenantContext } from "@/server/auth/session"
import { can } from "@/server/rbac/ability"
import { members as membersRepo } from "@/server/repositories"
import { VerifyChainBanner } from "./verify-chain-button"

export const metadata: Metadata = { title: "Audit log · QR Feed" }

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

const ENTITIES = [
  { value: "", label: "All entities" },
  { value: "ticket", label: "Tickets" },
  { value: "branch", label: "Branches" },
  { value: "location", label: "Locations" },
  { value: "qrCode", label: "QR codes" },
  { value: "rca", label: "RCA" },
  { value: "capa", label: "CAPA" },
  { value: "audit", label: "Audits" },
  { value: "member", label: "Members" },
  { value: "role", label: "Roles" },
  { value: "slaPolicy", label: "SLA policies" },
  { value: "tenant", label: "Organisation" },
]

function summary(value: unknown) {
  if (value === null || value === undefined) return ""
  const text = JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

function formatActor(actorId: string, names: Map<string, string>) {
  const known = names.get(actorId)
  if (known) return known
  if (actorId === "system") return "System"
  if (actorId === "public") return "Guest"
  if (actorId.startsWith("apikey:")) return "API key"
  if (actorId.startsWith("billing-webhook:")) return "Billing webhook"
  return "Platform staff"
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "log:read")) redirect("/dashboard")

  const sp = await searchParams
  const rawPage = Number(sp.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const entity = typeof sp.entity === "string" && sp.entity ? sp.entity : undefined
  const action = typeof sp.action === "string" && sp.action ? sp.action : undefined

  const { items, meta } = await listAudit(ctx, { page, entity, action })
  const actorIds = [...new Set(items.map((e) => e.actorId))]
  const [memberDocs, initialChain] = await Promise.all([
    actorIds.length > 0
      ? membersRepo
          .forTenant({ ...ctx, branchScope: "all" })
          .find({ userId: { $in: actorIds } }, { projection: { userId: 1, name: 1 } })
      : [],
    // Auto-verify small logs (< 200 entries) on SSR; larger logs verify on-demand for fast page loads.
    !entity && !action && meta.total <= 200 ? verifyChain(ctx) : null,
  ])
  const actor = new Map(memberDocs.map((m) => [m.userId, m.name]))

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams()
    if (entity) qs.set("entity", entity)
    if (action) qs.set("action", action)
    qs.set("page", String(targetPage))
    return `?${qs.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change in this organisation. Entries can't be edited or deleted."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]}
        actions={
          can(ctx, "report:export") && (
            <a
              href="/api/reports/export?type=audit_log"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Icon name="download" data-icon="inline-start" /> Export CSV
            </a>
          )
        }
      />

      <VerifyChainBanner totalEntries={meta.total} initialReport={initialChain} />

      <Form
        key={`${entity ?? ""}|${action ?? ""}`}
        action="/audit-log"
        className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <select
          name="entity"
          defaultValue={entity ?? ""}
          aria-label="Filter by entity"
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {ENTITIES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <Input
          name="action"
          defaultValue={action ?? ""}
          placeholder="Filter by action (e.g. ticket., sla., rca.)…"
          aria-label="Filter by action"
          className="h-10"
        />
        <div className="flex gap-1.5">
          <Button type="submit" size="default" className="h-10">
            <Icon name="filter" data-icon="inline-start" /> Filter
          </Button>
          {(entity || action) && (
            <Link
              href="/audit-log"
              className={buttonVariants({ variant: "ghost", size: "default" })}
            >
              Clear
            </Link>
          )}
        </div>
      </Form>

      {/* Wide table scrolls inside its own box on phones; the page itself never scrolls sideways. */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                #
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                When (UTC)
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Who
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Action
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No audit entries match this filter.
                </td>
              </tr>
            ) : (
              items.map((e) => (
                <tr key={e._id.toHexString()}>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{e.seq}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                    {when.format(e.at)}
                  </td>
                  <td className="px-4 py-2.5">{formatActor(e.actorId, actor)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.action}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {summary(e.after ?? e.before)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {meta.page} of {meta.totalPages}
          </span>
          <span className="flex gap-2">
            {meta.page > 1 && (
              <Link
                href={pageHref(meta.page - 1)}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Newer
              </Link>
            )}
            {meta.page < meta.totalPages && (
              <Link
                href={pageHref(meta.page + 1)}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Older
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  )
}
