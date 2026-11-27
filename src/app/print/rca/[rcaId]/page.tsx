import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getRcaDetail } from "@/server/modules/rca-capa"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = { title: "RCA / CAPA Report · QR Feed", robots: { index: false } }

const fmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export default function PrintRcaPage(props: PageProps<"/print/rca/[rcaId]">) {
  return (
    <main className="mx-auto max-w-4xl bg-white px-4 py-8 text-black sm:px-6 print:max-w-none print:p-0">
      <Suspense fallback={<PageSkeleton />}>
        <PrintRcaBody {...props} />
      </Suspense>
    </main>
  )
}

async function PrintRcaBody({ params }: PageProps<"/print/rca/[rcaId]">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "rca:read")) redirect("/dashboard")
  const { rcaId } = await params
  const [tenant, detail] = await Promise.all([
    getTenant(ctx.tenantId),
    getRcaDetail(ctx, rcaId).catch((err) => {
      if (
        err instanceof ApiError &&
        (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
      ) {
        notFound()
      }
      throw err
    }),
  ])
  const { rca, capas, linkedTickets } = detail
  const fmtDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })
  const fishboneEntries = (
    [
      ["Man (People)", rca.fishbone.man],
      ["Machine (Equipment)", rca.fishbone.machine],
      ["Method (Process/SOP)", rca.fishbone.method],
      ["Material (Supplies)", rca.fishbone.material],
      ["Measurement (Checks)", rca.fishbone.measurement],
      ["Environment (Space)", rca.fishbone.environment],
    ] as const
  ).filter(([, causes]) => causes.length > 0)

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
            {linkedTickets.length > 0
              ? ` · Tickets: ${linkedTickets.map((t) => t.number).join(", ")}`
              : ""}
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

      {fishboneEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Fishbone (Ishikawa 6M)</h2>
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            {fishboneEntries.map(([label, causes]) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase">{label}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {causes.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {rca.contributingFactors.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Contributing factors</h2>
          <ul className="list-disc space-y-1 rounded-xl border p-4 pl-8 text-sm">
            {rca.contributingFactors.map((f, idx) => (
              <li key={idx}>{f}</li>
            ))}
          </ul>
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
                    {a.title} — {a.ownerName} · Due {fmtDate.format(a.dueDate)} ({a.status})
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] rounded-xl border text-left text-xs">
              <thead className="bg-gray-100">
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
          </div>
        )}
      </section>
    </article>
  )
}
