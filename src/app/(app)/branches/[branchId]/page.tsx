import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { TONE_BAR, TONE_TILE, TONE_TRACK, type Tone } from "@/components/cards/tone"
import { Icon, type IconName } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { setupSteps, summarizeTree, type SubtreeStats } from "@/lib/location-stats"
import { LOCATION_TYPE_LABELS, type TreeNode } from "@/lib/location-tree"
import { timeZoneOptions } from "@/lib/time-zones"
import { cn } from "@/lib/utils"
import { requireTenantContext } from "@/server/auth/session"
import { getBranch } from "@/server/modules/branches"
import { getLocationTree } from "@/server/modules/locations"
import { listQrCodes } from "@/server/modules/qr-codes"
import { getTenant } from "@/server/modules/tenants"
import { publicQrUrl } from "@/server/public-url"
import { can } from "@/server/rbac/ability"
import type { LocationDoc } from "@/server/repositories"
import {
  AddLocationDialog,
  BranchSettingsDialog,
  BranchTreeProvider,
  LocationMenu,
  type ParentOption,
} from "../branch-dialogs"
import { CreateQrButton, GenerateQrCodesButton, QrButton, type QrInfo } from "../qr-controls"
import { SetupGuide } from "./setup-guide"
import { TreeGroup } from "./tree-group"

export const metadata: Metadata = { title: "Branch · QR Feed" }

const TYPE_STYLE: Record<LocationDoc["type"], { icon: IconName; tone: Tone }> = {
  building: { icon: "branch", tone: "indigo" },
  floor: { icon: "dashboard", tone: "sky" },
  department: { icon: "users", tone: "cyan" },
  location: { icon: "location", tone: "emerald" },
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

type Node = TreeNode<LocationDoc>

function flatten(nodes: Node[]): ParentOption[] {
  return nodes.flatMap((n) => [
    { id: n._id.toHexString(), label: n.path.join(" › "), type: n.type },
    ...flatten(n.children),
  ])
}

type TreeProps = {
  nodes: Node[]
  branchId: string
  editable: boolean
  qrs: Map<string, QrInfo>
  stats: Map<string, SubtreeStats>
  canCreateQr: boolean
  canRevokeQr: boolean
}

function TypeTile({
  type,
  muted,
  size = "md",
}: {
  type: Node["type"]
  muted?: boolean
  size?: "md" | "lg"
}) {
  const { icon, tone } = TYPE_STYLE[type]
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg",
        size === "lg" ? "size-10" : "size-9",
        muted ? "bg-muted text-muted-foreground" : TONE_TILE[tone],
      )}
    >
      <Icon name={icon} className={size === "lg" ? "size-5" : "size-4.5"} />
    </span>
  )
}

/** A thin coverage bar: what share of the spots inside an area already have a QR code. */
function Coverage({ s }: { s: SubtreeStats }) {
  if (s.locations === 0) return null
  const pct = Math.round((s.withQr / s.locations) * 100)
  const tone: Tone = pct === 100 ? "emerald" : pct === 0 ? "rose" : "amber"
  return (
    <span className="hidden shrink-0 items-center gap-2 sm:flex" title={`${pct}% have a QR code`}>
      <span className={cn("h-1.5 w-20 overflow-hidden rounded-full", TONE_TRACK[tone])}>
        <span
          className={cn("block h-full rounded-full", TONE_BAR[tone])}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
        {s.withQr}/{s.locations}
      </span>
    </span>
  )
}

function Tree({
  nodes,
  branchId,
  editable,
  qrs,
  stats,
  canCreateQr,
  canRevokeQr,
  label,
}: TreeProps & { label?: string }) {
  return (
    <ul
      aria-label={label}
      className={label ? "space-y-1" : "mt-0.5 ml-[1.15rem] space-y-0.5 border-l pl-2 sm:pl-3"}
    >
      {nodes.map((n) => {
        const id = n._id.toHexString()
        const menu = editable && (
          <LocationMenu
            id={id}
            name={n.name}
            nodeType={n.type}
            parentId={n.parentId ? n.parentId.toHexString() : null}
          />
        )

        // Buildings, floors and zones: a collapsible area with a roll-up of what's inside.
        if (n.type !== "location" || n.children.length > 0) {
          const s = stats.get(id) ?? { locations: 0, withQr: 0, scans: 0 }
          return (
            <li key={id}>
              <TreeGroup
                name={n.name}
                actions={menu}
                header={
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <TypeTile type={n.type} size={n.type === "building" ? "lg" : "md"} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate",
                          n.type === "building" ? "font-semibold" : "font-medium",
                        )}
                      >
                        {n.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {LOCATION_TYPE_LABELS[n.type]} · {plural(s.locations, "spot")}
                        {s.scans > 0 && (
                          <span className="tabular-nums"> · {plural(s.scans, "scan")}</span>
                        )}
                      </span>
                    </span>
                    <Coverage s={s} />
                  </span>
                }
              >
                {n.children.length > 0 ? (
                  <Tree
                    nodes={n.children}
                    branchId={branchId}
                    editable={editable}
                    qrs={qrs}
                    stats={stats}
                    canCreateQr={canCreateQr}
                    canRevokeQr={canRevokeQr}
                  />
                ) : (
                  <p className="ml-[1.15rem] border-l py-2 pl-5 text-sm text-muted-foreground">
                    Nothing inside yet.
                  </p>
                )}
              </TreeGroup>
            </li>
          )
        }

        // A QR spot.
        const qr = qrs.get(id)
        return (
          <li key={id}>
            <div className="flex min-h-14 items-center gap-2 rounded-lg py-1.5 pr-1 pl-1 transition-colors hover:bg-accent/60">
              <span aria-hidden className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <TypeTile type={n.type} muted={!qr} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.name}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {n.code && <code className="font-mono">{n.code}</code>}
                    {n.code && <span aria-hidden>·</span>}
                    {qr ? (
                      <span className="tabular-nums">{plural(qr.scanCount, "scan")}</span>
                    ) : (
                      <span className="text-warning">No QR code yet</span>
                    )}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {qr ? (
                  <QrButton
                    qr={qr}
                    name={n.name}
                    path={n.path.join(" › ")}
                    branchId={branchId}
                    canRegenerate={canCreateQr && canRevokeQr}
                    canRevoke={canRevokeQr}
                  />
                ) : (
                  canCreateQr && (
                    <CreateQrButton locationId={id} branchId={branchId} name={n.name} />
                  )
                )}
                {menu}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default async function BranchPage({ params }: PageProps<"/branches/[branchId]">) {
  const { branchId } = await params
  const ctx = await requireTenantContext()
  if (!can(ctx, "branch:read")) redirect("/dashboard")
  // The tenant (for the QR domain) doesn't depend on the branch, so fetch both at once.
  const [branch, tenant] = await Promise.all([
    getBranch(ctx, branchId).catch((err) => {
      if (
        err instanceof ApiError &&
        (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FORBIDDEN")
      ) {
        notFound()
      }
      throw err
    }),
    getTenant(ctx.tenantId),
  ])
  const canReadLocations = can(ctx, "location:read", { branchId: branch._id })
  const canReadQr = can(ctx, "qr:read", { branchId: branch._id })
  const [tree, codes] = await Promise.all([
    canReadLocations ? getLocationTree(ctx, branch._id) : [],
    canReadQr ? listQrCodes(ctx, branch._id) : [],
  ])
  const editable = can(ctx, "location:manage", { branchId: branch._id })
  const canManageBranch = can(ctx, "branch:manage", { branchId: branch._id })
  const canCreateQr = can(ctx, "qr:create", { branchId: branch._id })
  const canRevokeQr = can(ctx, "qr:revoke", { branchId: branch._id })
  const id = branch._id.toHexString()
  const customDomain = tenant?.branding?.customDomain
  const qrs = new Map<string, QrInfo>(
    codes.map((q) => [
      q.locationId.toHexString(),
      {
        id: q._id.toHexString(),
        url: publicQrUrl(q.shortCode, customDomain),
        scanCount: q.scanCount,
      },
    ]),
  )
  const summary = summarizeTree(tree, new Map([...qrs].map(([locId, q]) => [locId, q.scanCount])))
  const { totals, top } = summary
  const steps = setupSteps(totals)
  const coverage = totals.locations ? Math.round((totals.withQr / totals.locations) * 100) : 0
  const parents = flatten(tree)

  return (
    <>
      <PageHeader
        title={branch.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Every spot where a QR code goes, grouped by building, floor and zone.</span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className="size-3.5" />
              {branch.timezone.replaceAll("_", " ")}
            </span>
            {branch.address && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Icon name="location" className="size-3.5" />
                <span className="truncate">{branch.address}</span>
              </span>
            )}
          </span>
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Branches", href: "/branches" },
          { label: branch.name },
        ]}
        actions={
          <>
            {canManageBranch && (
              <BranchSettingsDialog
                branch={{
                  id,
                  name: branch.name,
                  timezone: branch.timezone,
                  address: branch.address ?? "",
                  businessHours: branch.businessHours,
                  holidays: branch.holidays ?? [],
                }}
                timeZones={timeZoneOptions()}
                canArchive={ctx.branchScope === "all"}
              />
            )}
            {codes.length > 0 && (
              <>
                <a
                  href={`/api/branches/${id}/qr-zip`}
                  aria-label="Download ZIP"
                  title="Download all QR codes (ZIP)"
                  className={buttonVariants({ variant: "outline", size: "icon-xl" })}
                >
                  <Icon name="download" className="size-5" />
                </a>
                <Link
                  href={`/print/branches/${id}`}
                  className={buttonVariants({ variant: "outline", size: "xl" })}
                >
                  <Icon name="print" data-icon="inline-start" /> Print QR sheet
                </Link>
              </>
            )}
            {canCreateQr && totals.withQr < totals.locations && (
              <GenerateQrCodesButton branchId={id} />
            )}
            {editable && <AddLocationDialog branchId={id} parents={parents} />}
          </>
        }
      />

      {tree.length > 0 && canReadQr && (
        <section
          aria-label="Branch overview"
          className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatCard
            label="QR spots"
            value={totals.locations}
            icon="location"
            tone="indigo"
            footer={
              <span className="text-muted-foreground">in {plural(totals.areas, "area")}</span>
            }
          />
          <StatCard
            label="QR coverage"
            value={`${coverage}%`}
            icon="qr"
            tone={coverage === 100 ? "emerald" : "orange"}
            footer={
              <span className="block space-y-1.5">
                <span
                  className={cn(
                    "block h-1.5 overflow-hidden rounded-full",
                    TONE_TRACK[coverage === 100 ? "emerald" : "orange"],
                  )}
                >
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      TONE_BAR[coverage === 100 ? "emerald" : "orange"],
                    )}
                    style={{ width: `${coverage}%` }}
                  />
                </span>
                <span className="block text-muted-foreground tabular-nums">
                  {totals.withQr} of {totals.locations} have a code
                </span>
              </span>
            }
          />
          <StatCard
            label="Total scans"
            value={totals.scans}
            icon="eye"
            tone="sky"
            footer={<span className="text-muted-foreground">across every code here</span>}
          />
          <StatCard
            label="Most scanned"
            value={top?.name ?? "—"}
            icon="rating"
            tone="amber"
            className="[&_p:nth-child(2)]:truncate [&_p:nth-child(2)]:text-xl sm:[&_p:nth-child(2)]:text-2xl"
            footer={
              <span className="text-muted-foreground tabular-nums">
                {top ? plural(top.scans, "scan") : "Waiting for the first scan"}
              </span>
            }
          />
        </section>
      )}

      {(editable || canCreateQr) && steps.some((s) => !s.done) && <SetupGuide steps={steps} />}

      {tree.length === 0 && !editable && (
        <EmptyState
          icon="location"
          title="No locations yet"
          description="An admin needs to add the rooms and spots where QR codes will go."
        />
      )}

      {tree.length > 0 && (
        <section
          aria-labelledby="site-map-title"
          className="rounded-xl bg-card p-2 ring-1 ring-foreground/10 sm:p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 pb-3">
            <div>
              <h2 id="site-map-title" className="text-base font-semibold">
                Site map
              </h2>
              <p className="text-sm text-muted-foreground">
                {plural(totals.areas, "area")} · {plural(totals.locations, "QR spot")}
              </p>
            </div>
            <ul
              className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
              aria-label="Legend"
            >
              {(["building", "floor", "department", "location"] as const).map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-full", TONE_BAR[TYPE_STYLE[t].tone])} />
                  {LOCATION_TYPE_LABELS[t]}
                </li>
              ))}
            </ul>
          </div>
          <BranchTreeProvider branchId={id} parents={parents}>
            <Tree
              nodes={tree}
              branchId={id}
              editable={editable}
              qrs={qrs}
              stats={summary.byId}
              canCreateQr={canCreateQr}
              canRevokeQr={canRevokeQr}
              label="Locations"
            />
          </BranchTreeProvider>
        </section>
      )}
    </>
  )
}
