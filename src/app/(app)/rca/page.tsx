import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { timeAgo } from "@/lib/relative-time"
import { requireTenantContext } from "@/server/auth/session"
import { listRcas } from "@/server/modules/rca-capa"
import { can } from "@/server/rbac/ability"
import { tickets } from "@/server/repositories"
import { CreateRcaDialog } from "./rca-dialogs"

export const metadata: Metadata = { title: "RCA & CAPA · QR Feed" }

export default async function RcaPage({ searchParams }: PageProps<"/rca">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "rca:read")) redirect("/dashboard")

  const sp = await searchParams
  const fromTicketId = typeof sp.fromTicket === "string" ? sp.fromTicket : undefined
  const [{ rcas, capas }, sourceTicketDoc] = await Promise.all([
    listRcas(ctx),
    fromTicketId ? tickets.forTenant(ctx).findById(fromTicketId) : null,
  ])

  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()
  const overdueActions = capas
    .flatMap((c) => c.actions)
    .filter(
      (a) => a.status !== "completed" && a.status !== "verified" && a.dueDate.getTime() < now,
    ).length
  const pendingEff = capas.filter((c) => c.status === "pending_effectiveness").length

  const sourceTicket = sourceTicketDoc
    ? {
        id: sourceTicketDoc._id.toHexString(),
        number: sourceTicketDoc.number,
        title: `${sourceTicketDoc.categoryName} · ${sourceTicketDoc.locationPath.at(-1) ?? ""}`,
        description:
          sourceTicketDoc.description ||
          `${sourceTicketDoc.categoryName} reported at ${sourceTicketDoc.locationPath.join(" › ")}`,
      }
    : null

  return (
    <>
      <PageHeader
        title="RCA & CAPA"
        description="Root cause investigations (5 Whys & Fishbone 6M), corrective/preventive actions and effectiveness checks."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "RCA & CAPA" }]}
        actions={
          can(ctx, "rca:manage") && (
            <CreateRcaDialog defaultOpen={Boolean(sourceTicket)} sourceTicket={sourceTicket} />
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total RCAs" value={rcas.length} icon="rca" />
        <StatCard label="CAPA plans" value={capas.length} icon="capa" />
        <StatCard label="Pending effectiveness" value={pendingEff} icon="verify" />
        <StatCard label="Overdue actions" value={overdueActions} icon="warning" lowerIsBetter />
      </div>

      {rcas.length === 0 ? (
        <EmptyState
          icon="rca"
          title="No RCA records yet"
          description="Convert a repeat or high-severity ticket to an RCA, or open a standalone investigation."
        />
      ) : (
        <PanelCard
          title="Investigations"
          description="Click any RCA to open the 5 Whys, Fishbone, CAPA and approval workspace."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">CAPAs</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rcas.map((r) => {
                  const id = r._id.toHexString()
                  const count = capas.filter((c) => c.rcaId.equals(r._id)).length
                  return (
                    <tr key={id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        <Link href={`/rca/${id}`} className="text-primary hover:underline">
                          {r.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/rca/${id}`} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                        {r.rootCause && (
                          <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted-foreground">
                            {r.rootCause}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 uppercase">{r.method}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.ownerName}</td>
                      <td className="px-4 py-3 tabular-nums">{count}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            r.status === "approved" || r.status === "closed"
                              ? "success"
                              : r.status === "in_review"
                                ? "secondary"
                                : "muted"
                          }
                          className="capitalize"
                        >
                          {r.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {timeAgo(r.createdAt, now)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </PanelCard>
      )}
    </>
  )
}
