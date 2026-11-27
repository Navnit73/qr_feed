import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { SlaChip } from "@/components/sla-chip"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { timeAgo } from "@/lib/relative-time"
import { SEVERITY_BADGE } from "@/lib/ticket-display"
import { requireTenantContext } from "@/server/auth/session"
import { queryTickets } from "@/server/modules/tickets"
import { can } from "@/server/rbac/ability"
import { VerifyQueueControls } from "./verify-controls"

export const metadata: Metadata = { title: "Verifications · QR Feed" }

export default async function VerificationsPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "ticket:read") || (!can(ctx, "ticket:verify") && !can(ctx, "ticket:close"))) {
    redirect("/dashboard")
  }
  const canReopen = can(ctx, "ticket:verify") || can(ctx, "ticket:assign")

  const { items } = await queryTickets(ctx, { status: "pending_verification", pageSize: 50 })
  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()

  return (
    <>
      <PageHeader
        title="Verifications"
        description="Review resolved tickets, inspect evidence, then approve to close or reopen with instructions."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Verifications" }]}
      />

      {items.length === 0 ? (
        <EmptyState
          icon="verify"
          title="Nothing waiting for verification"
          description="When staff submit tickets for closure, they appear here for sign-off."
          action={
            <Link href="/tickets" className={buttonVariants({ variant: "outline", size: "xl" })}>
              View all tickets
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((t) => {
            const id = t._id.toHexString()
            const evidence = t.resolutionAttachments ?? []
            return (
              <li
                key={id}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-5 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/tickets/${id}`}
                      className="font-mono text-sm font-semibold text-primary hover:underline"
                    >
                      {t.number}
                    </Link>
                    <Badge variant={SEVERITY_BADGE[t.severity]} className="capitalize">
                      {t.severity}
                    </Badge>
                    <SlaChip
                      createdAt={t.createdAt}
                      resolveDueAt={t.sla?.resolveDueAt}
                      resolvedAt={t.sla?.resolvedAt}
                      breached={t.sla?.breached}
                      now={now}
                    />
                    {(t.reopenCount ?? 0) > 0 && (
                      <Badge variant="warning" className="tabular-nums">
                        Reopened ×{t.reopenCount}
                      </Badge>
                    )}
                  </div>

                  <p className="font-semibold">{t.categoryName}</p>
                  <p className="text-sm text-muted-foreground">
                    <Icon name="location" className="mr-1 inline size-3.5 align-[-2px]" />
                    {t.locationPath.join(" › ")} · Assigned to {t.assignee?.name ?? "Unassigned"} ·{" "}
                    {timeAgo(t.submittedForVerificationAt ?? t.updatedAt, now)}
                  </p>

                  {t.resolutionNote && (
                    <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
                      <p className="text-xs font-semibold text-success uppercase">
                        Resolution remarks
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{t.resolutionNote}</p>
                    </div>
                  )}

                  {evidence.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {evidence.map((aid) => (
                        <a
                          key={aid}
                          href={`/api/files/${aid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block size-16 overflow-hidden rounded-lg border bg-muted"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/files/${aid}`}
                            alt="Resolution evidence"
                            className="size-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <VerifyQueueControls
                    ticketId={id}
                    ticketNumber={t.number}
                    canReopen={canReopen}
                  />
                  <Link
                    href={`/tickets/${id}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Inspect full timeline →
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
