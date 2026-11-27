import type { Metadata } from "next"
import { ObjectId } from "mongodb"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { ticketStats } from "@/server/modules/intake"
import { getTenant } from "@/server/modules/tenants"
import {
  listAssignableMembers,
  listSavedViews,
  queryTicketsCursor,
  serializeTicketRow,
} from "@/server/modules/tickets"
import { can } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"
import { NewTicketDialog, TicketBoard } from "./ticket-controls"

export const metadata: Metadata = { title: "Tickets · QR Feed" }

export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")

  const sp = await searchParams
  const str = (v: unknown) => (typeof v === "string" && v !== "all" ? v : undefined)
  const oidStr = (v: unknown) => {
    const s = str(v)
    return s && ObjectId.isValid(s) ? s : undefined
  }
  const rawPage = Number(sp.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const view = sp.view === "kanban" ? "kanban" : "table"
  const filters = {
    status: str(sp.status),
    severity: str(sp.severity),
    branchId: oidStr(sp.branchId),
    categoryId: oidStr(sp.categoryId),
    assigneeId: str(sp.assigneeId),
    q: str(sp.q),
  }

  const pageSize = view === "kanban" ? 60 : 25
  const tenant = await getTenant(ctx.tenantId)
  const [ticketPage, stats, branchDocs, categoryDocs, memberDocs, locationDocs, savedViews] =
    await Promise.all([
      queryTicketsCursor(ctx, { ...filters, page, pageSize }),
      ticketStats(ctx),
      can(ctx, "branch:read") ? listBranches(ctx) : [],
      listCategories(ctx, tenant?.industry ?? "other"),
      listAssignableMembers(ctx),
      can(ctx, "ticket:create")
        ? locations.forTenant(ctx).find({ status: "active" }, { sort: { path: 1 }, limit: 200 })
        : [],
      listSavedViews(ctx),
    ])

  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()
  const rows = ticketPage.items.map(serializeTicketRow)
  const totalCount = ticketPage.total ?? rows.length
  const boardKey = JSON.stringify({ ...filters, view, page })

  const branchOptions = branchDocs.map((b) => ({ value: b._id.toHexString(), label: b.name }))
  const categoryOptions = categoryDocs.map((c) => ({ value: c._id.toHexString(), label: c.label }))
  const memberOptions = memberDocs.map((m) => ({ value: m.userId, label: m.name }))
  const locationOptions = locationDocs.map((l) => ({
    value: l._id.toHexString(),
    label: l.path.join(" › "),
    branchId: l.branchId.toHexString(),
  }))

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Track, assign, work and verify every QR or manual report."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tickets" }]}
        actions={
          <>
            <Link href="/my-work" className={buttonVariants({ variant: "outline", size: "xl" })}>
              <Icon name="myWork" data-icon="inline-start" /> My work
            </Link>
            {can(ctx, "ticket:create") && (
              <NewTicketDialog
                locations={locationOptions}
                categories={categoryOptions}
                members={memberOptions}
              />
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={stats.open} icon="ticket" />
        <StatCard label="Last 24 hours" value={stats.last24h} icon="sla" />
        <StatCard label="Average rating (30 days)" value={stats.avgRating ?? "–"} icon="rating" />
      </div>

      {rows.length === 0 && !hasFilters && page === 1 ? (
        <EmptyState
          icon="qr"
          title="No tickets yet"
          description="Create QR codes for your locations and put them up, or log a manual ticket above."
          action={
            <Link href="/branches" className={buttonVariants({ size: "xl" })}>
              <Icon name="qr" data-icon="inline-start" /> Set up QR codes
            </Link>
          }
        />
      ) : (
        <TicketBoard
          key={boardKey}
          items={rows}
          initialNextCursor={ticketPage.nextCursor}
          initialHasMore={ticketPage.hasMore}
          totalCount={totalCount}
          initialPage={ticketPage.page}
          pageSize={pageSize}
          view={view}
          filters={filters}
          branches={branchOptions}
          categories={categoryOptions}
          members={memberOptions}
          savedViews={savedViews.map((v) => ({
            id: v._id.toHexString(),
            name: v.name,
            shared: v.shared,
            filters: v.filters,
          }))}
          canAssign={can(ctx, "ticket:assign")}
          canWork={can(ctx, "ticket:work")}
          canClose={can(ctx, "ticket:close")}
          now={now}
        />
      )}
    </>
  )
}
