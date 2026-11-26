import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/cards/empty-state"
import { Icon, type IconName } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { LOCATION_TYPE_LABELS, type TreeNode } from "@/lib/location-tree"
import { requireTenantContext } from "@/server/auth/session"
import { getBranch } from "@/server/modules/branches"
import { getLocationTree } from "@/server/modules/locations"
import { listQrCodes } from "@/server/modules/qr-codes"
import { publicQrUrl } from "@/server/public-url"
import { can } from "@/server/rbac/ability"
import type { LocationDoc } from "@/server/repositories"
import { AddLocationDialog, LocationActions, type ParentOption } from "../branch-dialogs"
import { CreateQrButton, GenerateQrCodesButton, QrButton, type QrInfo } from "../qr-controls"

export const metadata: Metadata = { title: "Branch · QR Feed" }

const TYPE_ICON: Record<LocationDoc["type"], IconName> = {
  building: "branch",
  floor: "dashboard",
  department: "users",
  location: "location",
}

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
  canCreateQr: boolean
  allParents: ParentOption[]
  label?: string
}

function Tree({ nodes, branchId, editable, qrs, canCreateQr, allParents, label }: TreeProps) {
  return (
    <ul aria-label={label} className={label ? "space-y-2" : "mt-2 space-y-2 border-l pl-3 sm:pl-5"}>
      {nodes.map((n) => {
        const id = n._id.toHexString()
        const qr = qrs.get(id)
        return (
          <li key={id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
              <Icon name={TYPE_ICON[n.type]} className="text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{n.name}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {LOCATION_TYPE_LABELS[n.type]}
                  {n.code && <code className="font-mono">{n.code}</code>}
                  {qr && (
                    <span className="tabular-nums">
                      · {qr.scanCount} {qr.scanCount === 1 ? "scan" : "scans"}
                    </span>
                  )}
                </span>
              </span>
              {n.children.length > 0 && <Badge variant="muted">{n.children.length}</Badge>}
              <span className="ml-auto flex shrink-0 gap-1">
                {qr ? (
                  <QrButton
                    qr={qr}
                    name={n.name}
                    path={n.path.join(" › ")}
                    branchId={branchId}
                    canManage={canCreateQr}
                  />
                ) : (
                  canCreateQr &&
                  n.type === "location" && (
                    <CreateQrButton locationId={id} branchId={branchId} name={n.name} />
                  )
                )}
                {editable && (
                  <LocationActions
                    id={id}
                    branchId={branchId}
                    name={n.name}
                    nodeType={n.type}
                    parentId={n.parentId ? n.parentId.toHexString() : null}
                    parents={allParents}
                  />
                )}
              </span>
            </div>
            {n.children.length > 0 && (
              <Tree
                nodes={n.children}
                branchId={branchId}
                editable={editable}
                qrs={qrs}
                canCreateQr={canCreateQr}
                allParents={allParents}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default async function BranchPage({ params }: PageProps<"/branches/[branchId]">) {
  const { branchId } = await params
  const ctx = await requireTenantContext()
  const branch = await getBranch(ctx, branchId).catch((err) => {
    if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "VALIDATION"))
      notFound()
    throw err
  })
  const canReadQr = can(ctx, "qr:read", { branchId: branch._id })
  const [tree, codes] = await Promise.all([
    getLocationTree(ctx, branch._id),
    canReadQr ? listQrCodes(ctx, branch._id) : [],
  ])
  const editable = can(ctx, "location:manage", { branchId: branch._id })
  const canCreateQr = can(ctx, "qr:create", { branchId: branch._id })
  const id = branch._id.toHexString()
  const qrs = new Map<string, QrInfo>(
    codes.map((q) => [
      q.locationId.toHexString(),
      { id: q._id.toHexString(), url: publicQrUrl(q.shortCode), scanCount: q.scanCount },
    ]),
  )

  return (
    <>
      <PageHeader
        title={branch.name}
        description={`Locations and their QR codes. Time zone: ${branch.timezone.replaceAll("_", " ")}.`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Branches", href: "/branches" },
          { label: branch.name },
        ]}
        actions={
          <>
            {codes.length > 0 && (
              <Link
                href={`/print/branches/${id}`}
                className={buttonVariants({ variant: "outline", size: "xl" })}
              >
                Print QR sheet
              </Link>
            )}
            {canCreateQr && tree.length > 0 && <GenerateQrCodesButton branchId={id} />}
            {editable && <AddLocationDialog branchId={id} parents={flatten(tree)} />}
          </>
        }
      />
      {tree.length === 0 ? (
        <EmptyState
          icon="location"
          title="No locations yet"
          description="Start with floors or buildings, then add the rooms and spots where QR codes will go."
        />
      ) : (
        <Tree
          nodes={tree}
          branchId={id}
          editable={editable}
          qrs={qrs}
          canCreateQr={canCreateQr}
          allParents={flatten(tree)}
          label="Locations"
        />
      )}
    </>
  )
}
