import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { requireTenantContext } from "@/server/auth/session"
import { listAudit, verifyChain } from "@/server/audit/audit-log"
import { listMembers } from "@/server/modules/members"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = { title: "Audit log · QR Feed" }

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

function summary(value: unknown) {
  if (value === null || value === undefined) return ""
  const text = JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "log:read")) redirect("/dashboard")
  const page = Math.max(1, Number((await searchParams).page) || 1)

  const [{ items, meta }, chain, members] = await Promise.all([
    listAudit(ctx, { page }),
    verifyChain(ctx),
    can(ctx, "user:read") ? listMembers(ctx) : [],
  ])
  const actor = new Map(members.map((m) => [m.userId, m.name]))

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change in this organisation. Entries can't be edited or deleted."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]}
      />

      {chain.ok ? (
        <Alert variant="success" className="mb-6">
          <Icon name="verify" />
          <AlertTitle>Chain verified</AlertTitle>
          <AlertDescription>
            All {chain.count} entries check out: each one&apos;s hash covers the one before, so no
            entry has been changed or removed.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" className="mb-6">
          <Icon name="error" />
          <AlertTitle>Chain broken at entry #{chain.brokenAtSeq}</AlertTitle>
          <AlertDescription>
            An entry was changed or removed outside the app. Investigate before trusting later
            entries.
          </AlertDescription>
        </Alert>
      )}

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
            {items.map((e) => (
              <tr key={e._id.toHexString()}>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{e.seq}</td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{when.format(e.at)}</td>
                <td className="px-4 py-2.5">
                  {actor.get(e.actorId) ?? (e.actorId === "system" ? "System" : "Platform staff")}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.action}</td>
                <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {summary(e.after ?? e.before)}
                </td>
              </tr>
            ))}
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
                href={`?page=${meta.page - 1}`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Newer
              </Link>
            )}
            {meta.page < meta.totalPages && (
              <Link
                href={`?page=${meta.page + 1}`}
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
