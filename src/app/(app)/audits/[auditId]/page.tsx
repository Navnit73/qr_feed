import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getAuditDetail } from "@/server/modules/audits"
import { can } from "@/server/rbac/ability"
import { AddFindingForm, AuditChecklistRunner, ConvertFindingButton } from "./audit-runner"

export const metadata: Metadata = { title: "Audit execution · QR Feed" }

export default async function AuditDetailPage({ params }: PageProps<"/audits/[auditId]">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "audit:read")) redirect("/dashboard")
  const { auditId } = await params

  const detail = await getAuditDetail(ctx, auditId).catch((err) => {
    if (
      err instanceof ApiError &&
      (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
    ) {
      notFound()
    }
    throw err
  })

  const { audit, branch, findings } = detail
  const id = audit._id.toHexString()
  const canRun = can(ctx, "audit:run", { branchId: audit.branchId })
  const canRca = can(ctx, "rca:manage")
  const canReadRca = can(ctx, "rca:read")

  return (
    <>
      <PageHeader
        title={`${audit.number} · ${audit.title}`}
        description={`${branch?.name ?? "Branch"} · ${audit.templateName} · Auditor: ${audit.auditorName}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Audits", href: "/audits" },
          { label: audit.number },
        ]}
        actions={
          <Link
            href={`/print/audits/${id}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Icon name="print" data-icon="inline-start" /> Audit PDF
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge
          variant={audit.status === "completed" ? "success" : "secondary"}
          className="capitalize"
        >
          {audit.status.replaceAll("_", " ")}
        </Badge>
        {audit.scorePct !== null && audit.scorePct !== undefined && (
          <Badge variant="inverse" className="tabular-nums">
            Score: {audit.scorePct}%
          </Badge>
        )}
        <Badge variant="outline" className="capitalize">
          {audit.recurrence}
        </Badge>
      </div>

      <div className="space-y-6">
        <PanelCard
          title="Checklist execution"
          description="Mobile-first scoring. Draft changes persist offline and sync on reconnect."
        >
          <AuditChecklistRunner
            auditId={id}
            editable={canRun}
            completed={audit.status === "completed"}
            initialItems={audit.checklistResults.map((r) => ({
              itemId: r.itemId,
              clause: r.clause,
              section: r.section,
              question: r.question,
              result: r.result,
              note: r.note ?? "",
            }))}
          />
        </PanelCard>

        <PanelCard
          title={`Findings & NCRs (${findings.length})`}
          description="Turn non-conformities directly into RCA & CAPA plans without any QR ticket."
        >
          <div className="space-y-4">
            {findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings logged yet.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {findings.map((f) => (
                  <li
                    key={f._id.toHexString()}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            f.severity === "critical" || f.severity === "major"
                              ? "destructive"
                              : f.severity === "minor"
                                ? "warning"
                                : "info"
                          }
                          className="capitalize"
                        >
                          {f.severity}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          Clause {f.clause}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm">{f.description}</p>
                      {f.evidence.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {f.evidence.map((aid) => (
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
                                alt="Finding evidence"
                                className="size-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {f.rcaId
                      ? canReadRca && (
                          <Link
                            href={`/rca/${f.rcaId.toHexString()}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            RCA linked →
                          </Link>
                        )
                      : canRca && (
                          <ConvertFindingButton auditId={id} findingId={f._id.toHexString()} />
                        )}
                  </li>
                ))}
              </ul>
            )}

            {canRun && audit.status !== "completed" && (
              <AddFindingForm auditId={id} branchId={audit.branchId.toHexString()} />
            )}
          </div>
        </PanelCard>
      </div>
    </>
  )
}
