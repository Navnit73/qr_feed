import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { Severity } from "@/lib/feedback-presets"
import { requireTenantContext } from "@/server/auth/session"
import { listTickets, ticketStats } from "@/server/modules/intake"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = { title: "Tickets · QR Feed" }

const SEVERITY: Record<Severity, "muted" | "info" | "warning" | "destructive"> = {
  low: "muted",
  medium: "info",
  high: "warning",
  critical: "destructive",
}
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" })

function ago(date: Date, now: number) {
  const mins = Math.round((date.getTime() - now) / 60_000)
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute")
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour")
  return rtf.format(Math.round(hours / 24), "day")
}

/**
 * Basic ticket inbox: enough for P2's exit criterion (a scan shows up here). The full board,
 * filters, detail page and actions arrive in P3.
 */
export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")
  const page = Math.max(1, Number((await searchParams).page) || 1)
  const [{ items, meta }, stats] = await Promise.all([listTickets(ctx, { page }), ticketStats(ctx)])
  // eslint-disable-next-line react-hooks/purity -- a server render happens once per request
  const now = Date.now()

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Every report from your QR codes, newest first."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tickets" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={stats.open} icon="ticket" />
        <StatCard label="Last 24 hours" value={stats.last24h} icon="sla" />
        <StatCard label="Average rating (30 days)" value={stats.avgRating ?? "–"} icon="rating" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="qr"
          title="No tickets yet"
          description="Create QR codes for your locations and put them up. Reports land here the moment someone scans."
          action={
            <Link href="/branches" className={buttonVariants({ size: "xl" })}>
              <Icon name="qr" data-icon="inline-start" /> Set up QR codes
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Ticket
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Where
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  About
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Severity
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Rating
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Reported
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((t) => (
                <tr key={t._id.toHexString()} className="align-top">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-medium whitespace-nowrap">
                      {t.number}
                    </span>
                    {t.reportCount > 1 && (
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        {t.reportCount} reports
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{t.locationPath.at(-1)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.locationPath.slice(0, -1).join(" › ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.categoryName}
                    {t.description && (
                      <span className="mt-1 line-clamp-2 block max-w-64 text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={SEVERITY[t.severity]} className="capitalize">
                      {t.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {t.rating ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="rating" className="size-3.5 fill-current text-secondary" />{" "}
                        {t.rating}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={t.status === "new" ? "secondary" : "muted"}
                      className="capitalize"
                    >
                      {t.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {ago(t.createdAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
