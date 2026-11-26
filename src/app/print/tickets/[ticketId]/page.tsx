import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { statusLabel } from "@/lib/ticket-display"
import { requireTenantContext } from "@/server/auth/session"
import { getTenant } from "@/server/modules/tenants"
import { getTicketDetail } from "@/server/modules/tickets"

export const metadata: Metadata = {
  title: "Ticket History Report · QR Feed",
  robots: { index: false },
}

const fmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export default function PrintTicketPage(props: PageProps<"/print/tickets/[ticketId]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <PrintBody {...props} />
      </Suspense>
    </main>
  )
}

async function PrintBody({ params }: PageProps<"/print/tickets/[ticketId]">) {
  const ctx = await requireTenantContext()
  const { ticketId } = await params
  const [tenant, detail] = await Promise.all([
    getTenant(ctx.tenantId),
    getTicketDetail(ctx, ticketId).catch((err) => {
      if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "VALIDATION")) {
        notFound()
      }
      throw err
    }),
  ])
  const { ticket, comments, activities } = detail

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {tenant?.name ?? "QR Feed"} · Ticket History Report
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold">{ticket.number}</h1>
          <p className="text-sm text-muted-foreground">
            {ticket.categoryName} · {ticket.locationPath.join(" › ")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href={`/tickets/${ticket._id.toHexString()}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back
          </Link>
          <PrintButton />
        </div>
      </header>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-semibold capitalize">{statusLabel(ticket.status)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Severity / Level</p>
          <p className="font-semibold capitalize">
            {ticket.severity} · L{ticket.currentLevel ?? 1}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Owner</p>
          <p className="font-semibold">{ticket.assignee?.name ?? "Unassigned"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Created (UTC)</p>
          <p className="tabular-nums">{fmt.format(ticket.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SLA status</p>
          <p>{ticket.sla ? (ticket.sla.breached ? "Breached" : "On track") : "N/A"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reports merged</p>
          <p className="tabular-nums">{ticket.reportCount}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Description</h2>
        <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">
          {ticket.description || "No written description."}
        </p>
        {ticket.resolutionNote && (
          <div className="rounded-xl border p-4 text-sm">
            <p className="font-semibold">Resolution summary</p>
            <p className="mt-1 whitespace-pre-wrap">{ticket.resolutionNote}</p>
          </div>
        )}
      </section>

      {comments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Remarks ({comments.length})</h2>
          <ul className="divide-y rounded-xl border">
            {comments.map((c) => (
              <li key={c._id.toHexString()} className="p-3 text-sm">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {c.authorName} <Badge variant="muted">{c.visibility}</Badge>
                  </span>
                  <span>{fmt.format(c.createdAt)} UTC</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Activity Timeline ({activities.length})</h2>
        <table className="w-full border-collapse rounded-xl border text-left text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="border-b px-3 py-2">When (UTC)</th>
              <th className="border-b px-3 py-2">Event</th>
              <th className="border-b px-3 py-2">Actor</th>
              <th className="border-b px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activities.map((a) => (
              <tr key={a._id.toHexString()}>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmt.format(a.at)}</td>
                <td className="px-3 py-2 font-mono">{a.type}</td>
                <td className="px-3 py-2">{a.actorName ?? a.actorId}</td>
                <td className="px-3 py-2">{a.note ?? JSON.stringify(a.after ?? a.meta ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  )
}
