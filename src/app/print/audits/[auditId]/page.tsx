import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getAuditDetail } from "@/server/modules/audits"
import { getTenant } from "@/server/modules/tenants"

export const metadata: Metadata = { title: "Audit Report · QR Feed", robots: { index: false } }

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default function PrintAuditPage(props: PageProps<"/print/audits/[auditId]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <PrintAuditBody {...props} />
      </Suspense>
    </main>
  )
}

async function PrintAuditBody({ params }: PageProps<"/print/audits/[auditId]">) {
  const ctx = await requireTenantContext()
  const { auditId } = await params
  const [tenant, detail] = await Promise.all([
    getTenant(ctx.tenantId),
    getAuditDetail(ctx, auditId).catch((err) => {
      if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "VALIDATION")) {
        notFound()
      }
      throw err
    }),
  ])
  const { audit, branch, findings } = detail

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {tenant?.name ?? "QR Feed"} · Internal Audit Report
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold">
            {audit.number} · {audit.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {branch?.name} · {audit.templateName} · Auditor: {audit.auditorName} ·{" "}
            {fmt.format(audit.scheduledAt)} · Score:{" "}
            {audit.scorePct !== null && audit.scorePct !== undefined ? `${audit.scorePct}%` : "N/A"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href={`/audits/${audit._id.toHexString()}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back
          </Link>
          <PrintButton />
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Checklist results</h2>
        <table className="w-full rounded-xl border text-left text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2">Clause</th>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">Question</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {audit.checklistResults.map((r) => (
              <tr key={r.itemId}>
                <td className="px-3 py-2 font-mono">{r.clause}</td>
                <td className="px-3 py-2">{r.section}</td>
                <td className="px-3 py-2">{r.question}</td>
                <td className="px-3 py-2 font-semibold uppercase">{r.result}</td>
                <td className="px-3 py-2">{r.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zero non-conformities recorded.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {findings.map((f) => (
              <li key={f._id.toHexString()} className="p-3">
                <p className="font-semibold capitalize">
                  {f.severity} · Clause {f.clause} ({f.status.replaceAll("_", " ")})
                </p>
                <p className="mt-1 text-muted-foreground">{f.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
