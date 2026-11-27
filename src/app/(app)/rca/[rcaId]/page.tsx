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
import { getRcaDetail } from "@/server/modules/rca-capa"
import { can } from "@/server/rbac/ability"
import {
  AddCapaDialog,
  AnalysisForm,
  ApprovalSignForm,
  CapaActionStatusButton,
  CloseRcaButton,
  EffectivenessDialog,
  LinkTicketDialog,
} from "./rca-workspace"

export const metadata: Metadata = { title: "RCA workspace · QR Feed" }

const fmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})
const fmtDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default async function RcaDetailPage({ params }: PageProps<"/rca/[rcaId]">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "rca:read")) redirect("/dashboard")
  const { rcaId } = await params

  const detail = await getRcaDetail(ctx, rcaId).catch((err) => {
    if (
      err instanceof ApiError &&
      (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
    ) {
      notFound()
    }
    throw err
  })

  const { rca, capas, linkedTickets, members, suggestedRecurrenceCount } = detail
  const id = rca._id.toHexString()
  const memberOpts = members.map((m) => ({ value: m.userId, label: m.name }))
  const isClosed = rca.status === "closed"
  const canManageRca = can(ctx, "rca:manage")
  const canManageCapa = can(ctx, "capa:manage")
  const canVerifyCapa = can(ctx, "capa:verify")
  const canApprove = can(ctx, "rca:approve")
  const allCapasVerified =
    capas.length > 0 && capas.every((c) => c.status === "verified" || c.status === "closed")
  const canClose = (canApprove || canManageRca) && rca.status === "approved" && allCapasVerified

  const hasAnalysis =
    rca.whys.some((w) => w.trim().length > 0) ||
    Object.values(rca.fishbone).some((arr) => arr.length > 0)
  const steps = [
    { label: "Problem", done: rca.problemStatement.trim().length > 0 },
    { label: "Analysis", done: hasAnalysis },
    { label: "Root cause", done: rca.rootCause.trim().length > 0 },
    { label: "CAPA verified", done: allCapasVerified },
    { label: "Approved", done: rca.status === "approved" || rca.status === "closed" },
  ]

  return (
    <>
      <PageHeader
        title={`${rca.number} · ${rca.title}`}
        description={`Owner: ${rca.ownerName} · Method: ${rca.method.toUpperCase()}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "RCA & CAPA", href: "/rca" },
          { label: rca.number },
        ]}
        actions={
          <>
            {canClose && <CloseRcaButton rcaId={id} number={rca.number} />}
            <Link
              href={`/print/rca/${id}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Icon name="print" data-icon="inline-start" /> RCA/CAPA PDF
            </Link>
          </>
        }
      />

      {/* Guided 5-step RCA workflow progress */}
      <ol aria-label="RCA progress" className="mb-6 grid gap-2 sm:grid-cols-5">
        {steps.map((s, idx) => (
          <li
            key={s.label}
            className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-xs font-medium"
          >
            <span
              className={
                s.done
                  ? "grid size-5 shrink-0 place-items-center rounded-full bg-success text-success-foreground"
                  : "grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground tabular-nums"
              }
            >
              {s.done ? <Icon name="check" className="size-3.5" /> : idx + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge
          variant={rca.status === "approved" || rca.status === "closed" ? "success" : "secondary"}
          className="capitalize"
        >
          {rca.status.replaceAll("_", " ")}
        </Badge>
        {linkedTickets.map((t) => (
          <Link
            key={t._id.toHexString()}
            href={`/tickets/${t._id.toHexString()}`}
            className="rounded-full border px-3 py-1 font-mono text-xs text-primary hover:bg-primary/5"
          >
            Linked: {t.number}
          </Link>
        ))}
        {canManageRca && !isClosed && <LinkTicketDialog rcaId={id} />}
      </div>

      <div className="space-y-6">
        <PanelCard
          title="Root Cause Analysis"
          description="Problem statement, 5 Whys, Fishbone (Ishikawa 6M), contributing factors and root cause."
        >
          <AnalysisForm
            editable={canManageRca && !isClosed}
            data={{
              id,
              method: rca.method,
              problemStatement: rca.problemStatement,
              whys: rca.whys,
              fishbone: rca.fishbone,
              contributingFactors: rca.contributingFactors,
              rootCause: rca.rootCause,
            }}
          />
        </PanelCard>

        <PanelCard
          title="CAPA Plans & Effectiveness"
          description="Correction, corrective and preventive actions with scheduled effectiveness verification."
          action={canManageCapa && !isClosed && <AddCapaDialog rcaId={id} members={memberOpts} />}
        >
          {capas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No CAPA plans yet. Add corrective and preventive actions once the root cause is clear.
            </p>
          ) : (
            <div className="space-y-4">
              {capas.map((c) => {
                const cid = c._id.toHexString()
                return (
                  <div key={cid} className="rounded-xl border bg-muted/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {c.number}
                          </span>
                          {c.title}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {c.type} action · Status: {c.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={c.status === "verified" ? "success" : "secondary"}
                          className="capitalize"
                        >
                          {c.status.replaceAll("_", " ")}
                        </Badge>
                        {canVerifyCapa && c.status !== "verified" && c.status !== "closed" && (
                          <EffectivenessDialog
                            rcaId={id}
                            capaId={cid}
                            capaNumber={c.number}
                            suggestedRecurrenceCount={suggestedRecurrenceCount}
                          />
                        )}
                      </div>
                    </div>

                    <ul className="mt-3 divide-y rounded-lg border bg-card">
                      {c.actions.map((act) => (
                        <li
                          key={act.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-medium">{act.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Owner: {act.ownerName} · Due {fmtDate.format(act.dueDate)}
                            </p>
                          </div>
                          {canManageCapa && c.status !== "verified" && c.status !== "closed" ? (
                            <CapaActionStatusButton
                              rcaId={id}
                              capaId={cid}
                              actionId={act.id}
                              status={act.status}
                            />
                          ) : (
                            <Badge variant="muted">{act.status}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>

                    {c.effectivenessCheck && (
                      <div className="mt-3 rounded-lg border bg-card p-3 text-xs">
                        <p className="font-semibold">
                          Effectiveness check ({c.effectivenessCheck.method})
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Scheduled: {fmtDate.format(c.effectivenessCheck.dueDate)}
                          {c.effectivenessCheck.result
                            ? ` · Result: ${c.effectivenessCheck.result.toUpperCase()} (Recurred: ${c.effectivenessCheck.recurred ? "Yes" : "No"}) by ${c.effectivenessCheck.verifierName}`
                            : ` · Auto-detected repeats since RCA: ${suggestedRecurrenceCount}`}
                        </p>
                        {c.effectivenessCheck.evidence && (
                          <p className="mt-1 text-foreground">{c.effectivenessCheck.evidence}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Approval Workflow & Signature Log"
          description="Owner → Reviewer → Approver sign-off trail."
        >
          <div className="space-y-4">
            {rca.approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signatures recorded yet.</p>
            ) : (
              <ol className="divide-y rounded-xl border">
                {rca.approvals.map((a, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <div>
                      <span className="font-semibold capitalize">{a.stage}</span> · {a.userName}
                      {a.comment && <p className="text-xs text-muted-foreground">{a.comment}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.decision === "approved" ? "success" : "warning"}>
                        {a.decision}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmt.format(a.at)} UTC
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {(canManageRca || canApprove) && !isClosed && (
              <ApprovalSignForm rcaId={id} canManage={canManageRca} canApprove={canApprove} />
            )}
          </div>
        </PanelCard>
      </div>
    </>
  )
}
