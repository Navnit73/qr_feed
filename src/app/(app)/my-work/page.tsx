import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { SlaChip } from "@/components/sla-chip"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { timeAgo } from "@/lib/relative-time"
import { SEVERITY_BADGE, statusLabel } from "@/lib/ticket-display"
import { requireTenantContext } from "@/server/auth/session"
import { queryTickets } from "@/server/modules/tickets"
import { can } from "@/server/rbac/ability"
import { MyWorkQuickButtons } from "./quick-actions"

export const metadata: Metadata = { title: "My Work · QR Feed" }

export default async function MyWorkPage({ searchParams }: PageProps<"/my-work">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")

  const rawPage = Number((await searchParams).page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const { items, meta } = await queryTickets(ctx, {
    mine: true,
    status: "open",
    excludeStatuses: ["pending_verification"],
    sort: "sla_due",
    page,
    pageSize: 50,
  })
  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()
  const waitingAccept = items.filter((t) => t.status === "assigned" || t.status === "new").length
  const active = items.filter((t) => t.status === "in_progress" || t.status === "accepted").length
  const breached = items.filter((t) => t.sla?.breached).length

  return (
    <>
      <PageHeader
        title="My Work"
        description="Tickets assigned to you, ordered by SLA due time for fast action on mobile or desktop."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Work" }]}
        actions={
          <Link href="/tickets" className={buttonVariants({ variant: "outline", size: "lg" })}>
            All tickets
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Assigned to you" value={meta.total} icon="myWork" />
        <StatCard label="Waiting accept" value={waitingAccept} icon="clock" />
        <StatCard label="In progress / Breached" value={`${active} / ${breached}`} icon="sla" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="success"
          title="Your queue is clear"
          description="Nothing is waiting on you right now. Check the team board to pick up unassigned tickets."
          action={
            <Link
              href="/tickets?assigneeId=unassigned&status=open"
              className={buttonVariants({ size: "xl" })}
            >
              Browse unassigned tickets
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((t) => {
            const id = t._id.toHexString()
            const branchId = t.branchId.toHexString()
            return (
              <li
                key={id}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/tickets/${id}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {t.number}
                    </Link>
                    <Badge variant={SEVERITY_BADGE[t.severity]} className="capitalize">
                      {t.severity}
                    </Badge>
                    <Badge variant="muted" className="capitalize">
                      {statusLabel(t.status)}
                    </Badge>
                    {(t.currentLevel ?? 1) > 1 && (
                      <Badge variant="warning">L{t.currentLevel}</Badge>
                    )}
                    <SlaChip
                      createdAt={t.createdAt}
                      resolveDueAt={t.sla?.resolveDueAt}
                      pausedAt={t.sla?.pausedAt}
                      resolvedAt={t.sla?.resolvedAt}
                      breached={t.sla?.breached}
                      now={now}
                    />
                  </div>
                  <p className="font-semibold">{t.categoryName}</p>
                  <p className="text-sm text-muted-foreground">
                    <Icon name="location" className="mr-1 inline size-3.5 align-[-2px]" />
                    {t.locationPath.join(" › ")} · {timeAgo(t.createdAt, now)}
                  </p>
                  {t.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <MyWorkQuickButtons
                    ticketId={id}
                    ticketNumber={t.number}
                    branchId={branchId}
                    status={t.status}
                  />
                  <Link
                    href={`/tickets/${id}`}
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Open
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {meta.totalPages > 1 && (
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
