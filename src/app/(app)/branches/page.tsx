import type { Metadata } from "next"
import { timeZoneOptions } from "@/lib/time-zones"
import Link from "next/link"
import { EmptyState } from "@/components/cards/empty-state"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { can } from "@/server/rbac/ability"
import { AddBranchDialog } from "./branch-dialogs"

export const metadata: Metadata = { title: "Branches · QR Feed" }

export default async function BranchesPage() {
  const ctx = await requireTenantContext()
  const list = await listBranches(ctx)
  const canAdd = can(ctx, "branch:manage") && ctx.branchScope === "all"
  const timeZones = timeZoneOptions()

  return (
    <>
      <PageHeader
        title="Branches"
        description="Each branch is a site with its own locations, staff and time zone."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Branches" }]}
        actions={canAdd && <AddBranchDialog timeZones={timeZones} />}
      />
      {list.length === 0 ? (
        <EmptyState
          icon="branch"
          title="No branches you can see"
          description="Ask an org admin to give you access."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <li key={b._id.toHexString()}>
              <Link
                href={`/branches/${b._id.toHexString()}`}
                className="group flex h-full flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{b.name}</span>
                  <Icon name="branch" className="text-muted-foreground group-hover:text-primary" />
                </span>
                <span className="mt-1 text-sm text-muted-foreground">
                  {b.timezone.replaceAll("_", " ")}
                </span>
                {b.address && (
                  <span className="mt-1 text-sm text-muted-foreground">{b.address}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
