import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
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
import { can } from "@/server/rbac/ability"

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
    <main className="mx-auto max-w-4xl bg-white px-4 py-8 text-black sm:px-6 print:max-w-none print:p-0">
      <Suspense fallback={<PageSkeleton />}>
        <PrintBody {...props} />
      </Suspense>
    </main>
  )
}

async function PrintBody({ params }: PageProps<"/print/tickets/[ticketId]">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")
  const { ticketId } = await params
  const [tenant, detail] = await Promise.all([
    getTenant(ctx.tenantId),
    getTicketDetail(ctx, ticketId).catch((err) => {
      if (
        err instanceof ApiError &&
        (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
      ) {
        notFound()
      }
      throw err
    }),
  ])
  const { ticket, comments, activities } = detail
  const allPhotos = [
    ...(ticket.attachments ?? []).map((id) => ({ id, label: "Report photo" })),
    ...(ticket.resolutionAttachments ?? []).map((id) => ({ id, label: "Resolution evidence" })),
  ]

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
        {ticket.sla && (
          <div className="grid gap-3 rounded-xl border p-4 text-xs sm:grid-cols-3">
            <div>
              <p className="text-gray-500">Accept due (UTC)</p>
              <p className="font-semibold tabular-nums">{fmt.format(ticket.sla.acceptDueAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">Resolve due (UTC)</p>
              <p className="font-semibold tabular-nums">{fmt.format(ticket.sla.resolveDueAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">SLA paused time</p>
              <p className="font-semibold tabular-nums">
                {Math.round((ticket.sla.pausedMs ?? 0) / 60000)} min
              </p>
            </div>
          </div>
        )}
        {ticket.requesterFeedback && (
          <div className="rounded-xl border p-4 text-sm">
            <p className="font-semibold">Requester closure feedback</p>
            <p className="mt-1">
              {ticket.requesterFeedback.resolved ? "Confirmed resolved" : "Reported unresolved"}
              {ticket.requesterFeedback.rating ? ` · ${ticket.requesterFeedback.rating}/5 ★` : ""}
            </p>
            {ticket.requesterFeedback.comment && (
              <p className="mt-1 text-gray-700">{ticket.requesterFeedback.comment}</p>
            )}
          </div>
        )}
      </section>

      {allPhotos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Photos &amp; Evidence ({allPhotos.length})</h2>
          <div className="grid grid-cols-3 gap-3">
            {allPhotos.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${p.id}`}
                  alt={p.label}
                  className="aspect-square w-full object-cover"
                />
                <figcaption className="px-2 py-1 text-[11px] text-gray-600">{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse rounded-xl border text-left text-xs">
            <thead className="bg-gray-100">
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
                  <td className="px-3 py-2">
                    {a.note ?? (a.after || a.meta ? JSON.stringify(a.after ?? a.meta) : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}
