import type { Metadata } from "next"
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
import { listMembers } from "@/server/modules/members"
import { getTenant } from "@/server/modules/tenants"
import { listSavedViews, queryTickets } from "@/server/modules/tickets"
import { can } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"
import { NewTicketDialog, TicketBoard, type TicketRow } from "./ticket-controls"

export const metadata: Metadata = { title: "Tickets · QR Feed" }

export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")

  const sp = await searchParams
  const str = (v: unknown) => (typeof v === "string" && v !== "all" ? v : undefined)
  const page = Math.max(1, Number(sp.page) || 1)
  const view = sp.view === "kanban" ? "kanban" : "table"
  const filters = {
    status: str(sp.status),
    severity: str(sp.severity),
    branchId: str(sp.branchId),
    categoryId: str(sp.categoryId),
    assigneeId: str(sp.assigneeId),
    q: str(sp.q),
  }

  const tenant = await getTenant(ctx.tenantId)
  const [{ items, meta }, stats, branchDocs, categoryDocs, memberDocs, locationDocs, savedViews] =
    await Promise.all([
      queryTickets(ctx, { ...filters, page, pageSize: view === "kanban" ? 60 : 25 }),
      ticketStats(ctx),
      can(ctx, "branch:read") ? listBranches(ctx) : [],
      listCategories(ctx, tenant?.industry ?? "other"),
      can(ctx, "user:read") ? listMembers(ctx) : [],
      can(ctx, "ticket:create")
        ? locations.forTenant(ctx).find({ status: "active" }, { sort: { path: 1 }, limit: 200 })
        : [],
      listSavedViews(ctx),
    ])

  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()
  const rows: TicketRow[] = items.map((t) => ({
    id: t._id.toHexString(),
    number: t.number,
    locationName: t.locationPath.at(-1) ?? "",
    locationParent: t.locationPath.slice(0, -1).join(" › "),
    categoryName: t.categoryName,
    description: t.description,
    severity: t.severity,
    status: t.status,
    rating: t.rating,
    reportCount: t.reportCount,
    assigneeName: t.assignee?.name ?? null,
    currentLevel: t.currentLevel ?? 1,
    slaBreached: Boolean(t.sla?.breached),
    slaPaused: Boolean(t.sla?.pausedAt),
    resolveDueAt: t.sla?.resolveDueAt ? t.sla.resolveDueAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }))

  const branchOptions = branchDocs.map((b) => ({ value: b._id.toHexString(), label: b.name }))
  const categoryOptions = categoryDocs.map((c) => ({ value: c._id.toHexString(), label: c.label }))
  const memberOptions = memberDocs
    .filter((m) => m.status === "active")
    .map((m) => ({ value: m.userId, label: m.name }))
  const locationOptions = locationDocs.map((l) => ({
    value: l._id.toHexString(),
    label: l.path.join(" › "),
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

      {items.length === 0 && !hasFilters ? (
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
          items={rows}
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
          now={now}
        />
      )}

      {meta.totalPages > 1 && view === "table" && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {meta.page} of {meta.totalPages} ({meta.total} tickets)
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
