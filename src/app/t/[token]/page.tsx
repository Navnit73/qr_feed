import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { CopyButton } from "@/components/copy-button"
import { Icon } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { getPublicTicket } from "@/server/modules/intake"

export const metadata: Metadata = { title: "Your report", robots: { index: false } }

const STEPS = ["Received", "In progress", "Being verified", "Resolved"] as const
const STEP_OF: Record<string, number> = {
  new: 0,
  assigned: 1,
  accepted: 1,
  in_progress: 1,
  on_hold: 1,
  reopened: 1,
  pending_verification: 2,
  closed: 3,
  cancelled: 3,
}
const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

/** The reporter's private tracking page. Only the holder of the link can see it. */
export default function TrackingPage(props: PageProps<"/t/[token]">) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Tracking {...props} />
      </Suspense>
    </main>
  )
}

async function Tracking({ params, searchParams }: PageProps<"/t/[token]">) {
  await connection() // live ticket status, never prerendered
  const [{ token }, query] = await Promise.all([params, searchParams])
  const ticket = await getPublicTicket(token)

  if (!ticket) {
    return (
      <div className="mt-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">We couldn&apos;t find that report</h1>
        <p className="mt-2 text-muted-foreground">Check the link, or scan the QR code again.</p>
      </div>
    )
  }

  const current = STEP_OF[ticket.status] ?? 0
  return (
    <>
      {query.new && (
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 animate-in place-items-center rounded-full bg-success/10 text-success ring-8 ring-success/5 duration-300 zoom-in-50">
            <Icon name="success" className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Thanks, we&apos;ve got it</h1>
          <p className="mt-1 text-muted-foreground">
            The team at {ticket.tenantName} has been told.
          </p>
        </div>
      )}
      {query.dup && (
        <div className="mb-6">
          <h1 className="mb-3 text-2xl font-bold tracking-tight">Thanks for telling us</h1>
          <Alert variant="info">
            <Icon name="info" />
            <AlertTitle>Someone already reported this</AlertTitle>
            <AlertDescription>
              We&apos;ve added your report to the open ticket, so it gets fixed sooner.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <section aria-labelledby="ticket-heading" className="rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {query.new || query.dup ? "Your ticket" : ticket.tenantName}
        </p>
        <h2
          id="ticket-heading"
          className="mt-0.5 font-mono text-xl font-semibold"
          data-testid="ticket-number"
        >
          {ticket.number}
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Where</dt>
          <dd>{ticket.locationPath.join(" › ")}</dd>
          <dt className="text-muted-foreground">About</dt>
          <dd>{ticket.categoryName}</dd>
          <dt className="text-muted-foreground">Reported</dt>
          <dd className="tabular-nums">{when.format(new Date(ticket.createdAt))} UTC</dd>
          {ticket.reportCount > 1 && (
            <>
              <dt className="text-muted-foreground">Reports</dt>
              <dd className="tabular-nums">{ticket.reportCount} people</dd>
            </>
          )}
        </dl>

        <ol aria-label="Progress" className="mt-6 space-y-3">
          {STEPS.map((step, i) => (
            <li
              key={step}
              aria-current={i === current ? "step" : undefined}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  i < current && "border-success bg-success text-success-foreground",
                  i === current && "border-primary bg-primary/10 text-success",
                  i > current && "text-muted-foreground",
                )}
              >
                {i < current ? <Icon name="success" className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  i > current && "text-muted-foreground",
                  i === current && "font-semibold",
                )}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-6 text-center text-sm text-pretty text-muted-foreground">
        Bookmark this page or copy the link to check progress later.
      </p>
      <div className="mt-3 flex justify-center">
        <CopyButton label="Copy tracking link" />
      </div>
    </>
  )
}
