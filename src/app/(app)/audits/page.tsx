import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { requireTenantContext } from "@/server/auth/session"
import { listAudits } from "@/server/modules/audits"
import { listBranches } from "@/server/modules/branches"
import { can } from "@/server/rbac/ability"
import { CreateTemplateDialog, ScheduleAuditDialog } from "./audit-dialogs"

export const metadata: Metadata = { title: "Audits · QR Feed" }

const fmtDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default async function AuditsPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "audit:read")) redirect("/dashboard")

  const [{ audits, templates, findings }, branches] = await Promise.all([
    listAudits(ctx),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
  ])
  const canRun = can(ctx, "audit:run")
  const isReadOnlyAuditor = ctx.roles.includes("auditor") && !can(ctx, "tenant:manage")
  const branchOpts = branches.map((b) => ({ value: b._id.toHexString(), label: b.name }))
  const templateOpts = templates.map((t) => ({
    value: t._id.toHexString(),
    label: `${t.name} (${t.standard})`,
  }))

  const completed = audits.filter((a) => a.status === "completed")
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, a) => s + (a.scorePct ?? 0), 0) / completed.length)
    : null

  return (
    <>
      <PageHeader
        title="Audits"
        description="Standalone compliance checklists, offline-tolerant mobile execution, findings and auto-NCR / RCA."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audits" }]}
        actions={
          canRun && (
            <>
              <CreateTemplateDialog />
              <ScheduleAuditDialog branches={branchOpts} templates={templateOpts} />
            </>
          )
        }
      />

      {isReadOnlyAuditor && (
        <Alert variant="info" className="mb-6">
          <Icon name="verify" />
          <AlertTitle>Auditor portal mode</AlertTitle>
          <AlertDescription>
            You have direct read access to Audits, RCA/CAPA, Audit Logs and Reports for compliance
            verification.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scheduled / Active" value={audits.length} icon="audit" />
        <StatCard label="Checklist templates" value={templates.length} icon="capa" />
        <StatCard label="Findings logged" value={findings.length} icon="warning" />
        <StatCard
          label="Avg compliance score"
          value={avgScore === null ? "–" : `${avgScore}%`}
          icon="verify"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelCard
          className="lg:col-span-2"
          title="Audit runs"
          description="Open any audit to fill the checklist (offline drafts supported) or export the report."
        >
          {audits.length === 0 ? (
            <EmptyState
              icon="audit"
              title="No audits scheduled"
              description="Create a checklist template first, then schedule a one-off or recurring audit."
            />
          ) : (
            <ul className="-mx-4 divide-y">
              {audits.map((a) => {
                const id = a._id.toHexString()
                return (
                  <li
                    key={id}
                    className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/audits/${id}`}
                          className="font-mono text-xs font-semibold text-success hover:underline"
                        >
                          {a.number}
                        </Link>
                        <Badge
                          variant={
                            a.status === "completed"
                              ? "success"
                              : a.status === "in_progress"
                                ? "secondary"
                                : "muted"
                          }
                          className="capitalize"
                        >
                          {a.status.replaceAll("_", " ")}
                        </Badge>
                        {a.scorePct !== null && a.scorePct !== undefined && (
                          <Badge variant="outline" className="tabular-nums">
                            {a.scorePct}%
                          </Badge>
                        )}
                      </div>
                      <Link
                        href={`/audits/${id}`}
                        className="mt-1 block font-semibold hover:underline"
                      >
                        {a.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {a.templateName} · Auditor: {a.auditorName} · Scheduled{" "}
                        {fmtDate.format(a.scheduledAt)} ({a.recurrence})
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`/print/audits/${id}`}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        PDF report
                      </Link>
                      <Link
                        href={`/audits/${id}`}
                        className="text-xs font-medium text-success hover:underline"
                      >
                        Open →
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </PanelCard>

        <PanelCard title="Checklist templates" description="Reusable audit standards.">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. Create ISO 9001, NABH, HACCP or custom checklists.
            </p>
          ) : (
            <ul className="-mx-4 divide-y">
              {templates.map((t) => (
                <li key={t._id.toHexString()} className="px-4 py-3">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.standard} · {t.items.length} items
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>
    </>
  )
}
