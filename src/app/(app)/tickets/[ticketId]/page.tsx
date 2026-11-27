import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { SlaChip } from "@/components/sla-chip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { timeAgo } from "@/lib/relative-time"
import { SEVERITY_BADGE, statusLabel } from "@/lib/ticket-display"
import { availableTicketEvents } from "@/lib/ticket-state-machine"
import { requireTenantContext } from "@/server/auth/session"
import { getBranch } from "@/server/modules/branches"
import { getTicketDetail } from "@/server/modules/tickets"
import { can } from "@/server/rbac/ability"
import {
  AssignDialog,
  CommentComposer,
  MergeTicketDialog,
  TagsEditor,
  TicketActionToolbar,
} from "./detail-controls"

export const metadata: Metadata = { title: "Ticket detail · QR Feed" }

function makeFormatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    })
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    })
  }
}

export default async function TicketDetailPage({ params }: PageProps<"/tickets/[ticketId]">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read")) redirect("/dashboard")
  const { ticketId } = await params

  const detail = await getTicketDetail(ctx, ticketId).catch((err) => {
    if (
      err instanceof ApiError &&
      (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
    ) {
      notFound()
    }
    throw err
  })

  const {
    ticket,
    comments,
    activities,
    category,
    members,
    repeatCount30d,
    repeatThreshold,
    rcaRecommended,
  } = detail
  const rcaReasons = [
    category?.requiresRCA ? "category requires RCA" : null,
    ticket.severity === "critical" ? "critical severity" : null,
    repeatCount30d >= repeatThreshold ? `${repeatCount30d} repeat reports in 30 days` : null,
    (ticket.currentLevel ?? 1) >= 3 ? "L3 escalation" : null,
  ].filter(Boolean)
  const id = ticket._id.toHexString()
  const branchId = ticket.branchId.toHexString()
  const branch = can(ctx, "branch:read", { branchId: ticket.branchId })
    ? await getBranch(ctx, ticket.branchId).catch(() => null)
    : null
  const tz = branch?.timezone ?? "UTC"
  const fmt = makeFormatter(tz)
  const events = availableTicketEvents(ticket.status, ctx.permissions)
  const memberOptions = members.map((m) => ({ value: m.userId, label: m.name }))
  const canRemark =
    can(ctx, "ticket:work", { branchId: ticket.branchId }) ||
    can(ctx, "ticket:verify", { branchId: ticket.branchId })
  const canMerge =
    can(ctx, "ticket:close", { branchId: ticket.branchId }) &&
    ticket.status !== "closed" &&
    ticket.status !== "cancelled"
  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()

  const allPhotos = [
    ...(ticket.attachments ?? []).map((a) => ({ id: a, label: "Report photo" })),
    ...(ticket.resolutionAttachments ?? []).map((a) => ({ id: a, label: "Resolution evidence" })),
  ]

  return (
    <>
      <PageHeader
        title={`${ticket.number} · ${ticket.categoryName}`}
        description={ticket.locationPath.join(" › ")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tickets", href: "/tickets" },
          { label: ticket.number },
        ]}
        actions={
          <>
            {canMerge && <MergeTicketDialog ticketId={id} ticketNumber={ticket.number} />}
            <Link
              href={`/print/tickets/${id}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Icon name="print" data-icon="inline-start" /> History PDF
            </Link>
            {can(ctx, "rca:manage") && !ticket.rcaId && (
              <Link
                href={`/rca?fromTicket=${id}`}
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                <Icon name="rca" data-icon="inline-start" /> Convert to RCA
              </Link>
            )}
            {ticket.rcaId && (
              <Link
                href={`/rca/${ticket.rcaId.toHexString()}`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <Icon name="rca" data-icon="inline-start" /> View linked RCA
              </Link>
            )}
          </>
        }
      />

      {/* Status + Level + SLA + Action bar */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="inverse" className="capitalize">
            {statusLabel(ticket.status)}
          </Badge>
          <Badge variant={SEVERITY_BADGE[ticket.severity]} className="capitalize">
            {ticket.severity}
          </Badge>
          <Badge variant={(ticket.currentLevel ?? 1) > 1 ? "warning" : "muted"}>
            L{ticket.currentLevel ?? 1}
          </Badge>
          <SlaChip
            createdAt={ticket.createdAt}
            resolveDueAt={ticket.sla?.resolveDueAt}
            pausedAt={ticket.sla?.pausedAt}
            resolvedAt={ticket.sla?.resolvedAt}
            breached={ticket.sla?.breached}
            now={now}
          />
          {ticket.reportCount > 1 && (
            <Badge variant="outline" className="tabular-nums">
              {ticket.reportCount} merged reports
            </Badge>
          )}
          {(ticket.reopenCount ?? 0) > 0 && (
            <Badge variant="warning" className="tabular-nums">
              Reopened ×{ticket.reopenCount}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            Reported {timeAgo(ticket.createdAt, now)} ({fmt.format(ticket.createdAt)}{" "}
            {tz === "UTC" ? "UTC" : tz.replaceAll("_", " ")})
          </span>
        </div>

        {events.length > 0 && (
          <TicketActionToolbar
            ticketId={id}
            branchId={branchId}
            events={events}
            requiresEvidence={Boolean(category?.requiresResolutionEvidence)}
          />
        )}
      </div>

      {ticket.duplicateOf && (
        <Alert variant="info" className="mb-6">
          <Icon name="info" />
          <AlertTitle>Merged duplicate</AlertTitle>
          <AlertDescription>
            This ticket was merged into{" "}
            <Link
              href={`/tickets?q=${encodeURIComponent(ticket.duplicateOf)}`}
              className="font-mono font-semibold text-primary hover:underline"
            >
              {ticket.duplicateOf}
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {rcaRecommended && !ticket.rcaId && (
        <Alert variant="warning" className="mb-6">
          <Icon name="rca" />
          <AlertTitle>Root Cause Analysis recommended</AlertTitle>
          <AlertDescription>
            Triggered by policy ({rcaReasons.join(", ")}). Convert this ticket to an RCA/CAPA record
            to track preventive action.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details, photos, remarks & timeline */}
        <div className="space-y-6 lg:col-span-2">
          <PanelCard title="Report details">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {ticket.description || "No written description provided."}
            </p>
            {ticket.rating !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-sm">
                <Icon
                  name="rating"
                  className="size-4 fill-current text-amber-500 dark:text-amber-400"
                />
                <span className="font-semibold tabular-nums">{ticket.rating} / 5</span>
                <span className="text-muted-foreground">guest rating</span>
              </p>
            )}
            {ticket.resolutionNote && (
              <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-3">
                <p className="text-xs font-semibold text-success uppercase">Resolution summary</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{ticket.resolutionNote}</p>
              </div>
            )}
            {ticket.requesterFeedback && (
              <div className="mt-4 rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Requester closure feedback
                </p>
                <p className="mt-1 text-sm font-medium">
                  {ticket.requesterFeedback.resolved
                    ? "Confirmed resolved"
                    : "Reported still unresolved"}
                  {ticket.requesterFeedback.rating
                    ? ` · ${ticket.requesterFeedback.rating}/5 ★`
                    : ""}
                </p>
                {ticket.requesterFeedback.comment && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ticket.requesterFeedback.comment}
                  </p>
                )}
              </div>
            )}
          </PanelCard>

          {allPhotos.length > 0 && (
            <PanelCard title="Photos & evidence" description={`${allPhotos.length} attached`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allPhotos.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/files/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/${p.id}`}
                      alt={p.label}
                      className="aspect-square w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-xs text-muted-foreground">
                      {p.label}
                    </span>
                  </a>
                ))}
              </div>
            </PanelCard>
          )}

          <PanelCard
            title="Remarks"
            description="Internal notes stay private; public remarks appear on the guest's tracking link."
          >
            <div className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No remarks yet.</p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c._id.toHexString()} className="rounded-xl border bg-card p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-foreground">{c.authorName}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.visibility === "public" ? "info" : "muted"}>
                            {c.visibility}
                          </Badge>
                          <span className="text-muted-foreground">{timeAgo(c.createdAt, now)}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>
                      {c.attachments.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {c.attachments.map((aid) => (
                            <a
                              key={aid}
                              href={`/api/files/${aid}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block size-16 overflow-hidden rounded-lg border"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/files/${aid}`}
                                alt="Remark attachment"
                                className="size-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canRemark && <CommentComposer ticketId={id} branchId={branchId} />}
            </div>
          </PanelCard>

          <PanelCard
            title="Activity timeline"
            description="Immutable audit trail of every event on this ticket."
          >
            <ol className="space-y-3 border-l pl-4">
              {activities.map((a) => (
                <li key={a._id.toHexString()} className="relative text-sm">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary ring-4 ring-card"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{a.type}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmt.format(a.at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By{" "}
                    {a.actorName ??
                      (a.actorId === "public"
                        ? "Guest"
                        : a.actorId === "system"
                          ? "System"
                          : a.actorId)}
                  </p>
                  {a.note && <p className="mt-1 text-sm">{a.note}</p>}
                  {Boolean(a.before || a.after) && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {a.before ? `${JSON.stringify(a.before)} → ` : ""}
                      {a.after ? JSON.stringify(a.after) : ""}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </PanelCard>
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-6">
          <PanelCard
            title="Assignment"
            action={
              events.includes("assign") &&
              !["closed", "cancelled", "pending_verification"].includes(ticket.status) &&
              can(ctx, "ticket:assign", { branchId: ticket.branchId }) && (
                <AssignDialog
                  ticketId={id}
                  currentAssigneeId={ticket.assignee?.userId ?? null}
                  members={memberOptions}
                />
              )
            }
          >
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Owner</dt>
                <dd className="font-medium">{ticket.assignee?.name ?? "Unassigned"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Escalation level</dt>
                <dd className="font-mono">L{ticket.currentLevel ?? 1}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="uppercase">{ticket.source}</dd>
              </div>
            </dl>
          </PanelCard>

          <PanelCard title="SLA targets">
            {ticket.sla ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Accept due</dt>
                  <dd className="tabular-nums">{fmt.format(ticket.sla.acceptDueAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Resolve due</dt>
                  <dd className="tabular-nums">{fmt.format(ticket.sla.resolveDueAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Paused time</dt>
                  <dd className="tabular-nums">
                    {Math.round((ticket.sla.pausedMs ?? 0) / 60000)} min
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No SLA policy attached. Configure policies in{" "}
                <Link href="/settings?tab=sla" className="text-primary hover:underline">
                  Settings → SLA
                </Link>
                .
              </p>
            )}
          </PanelCard>

          <PanelCard title="Reporter">
            {ticket.reporter.anonymous ? (
              <p className="text-sm text-muted-foreground">Submitted anonymously</p>
            ) : (
              <dl className="space-y-1.5 text-sm">
                {ticket.reporter.name && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Name</dt>
                    <dd>{ticket.reporter.name}</dd>
                  </div>
                )}
                {ticket.reporter.email && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd>{ticket.reporter.email}</dd>
                  </div>
                )}
                {ticket.reporter.phone && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd>{ticket.reporter.phone}</dd>
                  </div>
                )}
              </dl>
            )}
          </PanelCard>

          <PanelCard title="Tags">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(ticket.tags ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">No tags</span>
              ) : (
                (ticket.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="outline">
                    #{tag}
                  </Badge>
                ))
              )}
            </div>
            {canRemark && <TagsEditor ticketId={id} initial={ticket.tags ?? []} />}
          </PanelCard>
        </div>
      </div>
    </>
  )
}
