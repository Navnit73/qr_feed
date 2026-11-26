import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getRcaDetail } from "@/server/modules/rca-capa"
import { getTenant } from "@/server/modules/tenants"

export const metadata: Metadata = { title: "RCA / CAPA Report · QR Feed", robots: { index: false } }

const fmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export default function PrintRcaPage(props: PageProps<"/print/rca/[rcaId]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <PrintRcaBody {...props} />
      </Suspense>
    </main>
  )
}

async function PrintRcaBody({ params }: PageProps<"/print/rca/[rcaId]">) {
  const ctx = await requireTenantContext()
  const { rcaId } = await params
  const [tenant, detail] = await Promise.all([
    getTenant(ctx.tenantId),
    getRcaDetail(ctx, rcaId).catch((err) => {
      if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "VALIDATION")) {
        notFound()
      }
      throw err
    }),
  ])
  const { rca, capas } = detail

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {tenant?.name ?? "QR Feed"} · Root Cause &amp; CAPA Report
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold">
            {rca.number} · {rca.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Owner: {rca.ownerName} · Method: {rca.method.toUpperCase()} · Status: {rca.status}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href={`/rca/${rca._id.toHexString()}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back
          </Link>
          <PrintButton />
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Problem statement</h2>
        <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">{rca.problemStatement}</p>
      </section>

      {rca.whys.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">5 Whys</h2>
          <ol className="list-decimal space-y-1 rounded-xl border p-4 pl-8 text-sm">
            {rca.whys.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Verified root cause</h2>
        <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">
          {rca.rootCause || "Pending root cause determination."}
        </p>
      </section>

      {capas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">CAPA Plans ({capas.length})</h2>
          {capas.map((c) => (
            <div key={c._id.toHexString()} className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">
                {c.number} · {c.title} ({c.type}, {c.status})
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {c.actions.map((a) => (
                  <li key={a.id}>
                    {a.title} — {a.ownerName} ({a.status})
                  </li>
                ))}
              </ul>
              {c.effectivenessCheck?.result && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Effectiveness: {c.effectivenessCheck.result.toUpperCase()} · Verified by{" "}
                  {c.effectivenessCheck.verifierName} · {c.effectivenessCheck.evidence}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Approval signatures</h2>
        {rca.approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not signed off yet.</p>
        ) : (
          <table className="w-full rounded-xl border text-left text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Signer</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2">Timestamp (UTC)</th>
                <th className="px-3 py-2">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rca.approvals.map((a, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 capitalize">{a.stage}</td>
                  <td className="px-3 py-2">{a.userName}</td>
                  <td className="px-3 py-2 capitalize">{a.decision}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt.format(a.at)}</td>
                  <td className="px-3 py-2">{a.comment ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  )
}
