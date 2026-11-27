import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { ApiError } from "@/lib/api/errors"
import { requireTenantContext } from "@/server/auth/session"
import { getBranch } from "@/server/modules/branches"
import { getLocationTree } from "@/server/modules/locations"
import { listQrCodes } from "@/server/modules/qr-codes"
import { getTenant } from "@/server/modules/tenants"
import { publicQrUrl } from "@/server/public-url"
import { qrSvg } from "@/server/qr-image"
import { can } from "@/server/rbac/ability"
import type { LocationDoc } from "@/server/repositories"

export const metadata: Metadata = { title: "Print QR codes · QR Feed", robots: { index: false } }

/**
 * A printable sheet of labelled QR stickers for a branch (F-2.2). Uses the browser's print
 * dialog ("Save as PDF" works too), so no PDF library is needed.
 */
export default function PrintPage(props: PageProps<"/print/branches/[branchId]">) {
  return (
    <main className="mx-auto w-full max-w-5xl bg-white px-4 py-6 text-black print:max-w-none print:p-0">
      <Suspense fallback={<PageSkeleton />}>
        <Sheet {...props} />
      </Suspense>
    </main>
  )
}

async function Sheet({ params }: PageProps<"/print/branches/[branchId]">) {
  const { branchId } = await params
  const ctx = await requireTenantContext()
  if (!can(ctx, "branch:read") || !can(ctx, "qr:read")) redirect("/dashboard")
  const branch = await getBranch(ctx, branchId).catch((err) => {
    if (err instanceof ApiError) notFound()
    throw err
  })
  const [codes, tree, tenant] = await Promise.all([
    listQrCodes(ctx, branch._id),
    can(ctx, "location:read", { branchId: branch._id }) ? getLocationTree(ctx, branch._id) : [],
    getTenant(ctx.tenantId),
  ])
  const metaMap = new Map<string, { path: string[]; code?: string }>()
  const walk = (nodes: (LocationDoc & { children: never[] })[]) =>
    nodes.forEach((n) => {
      metaMap.set(n._id.toHexString(), { path: n.path, code: n.code })
      walk(n.children)
    })
  walk(tree as never)

  const customDomain = tenant?.branding?.customDomain
  const stickers = await Promise.all(
    codes
      .filter((q) => metaMap.has(q.locationId.toHexString()))
      .map((q) => ({ q, ...metaMap.get(q.locationId.toHexString())! }))
      .sort((a, b) =>
        a.path.join(" ").localeCompare(b.path.join(" "), undefined, { numeric: true }),
      )
      .map(async ({ q, path, code }) => {
        const url = publicQrUrl(q.shortCode, customDomain)
        return {
          id: q._id.toHexString(),
          path,
          code,
          url,
          // Generated on our server from our own URL, so it's safe to inline.
          svg: await qrSvg(url),
        }
      }),
  )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QR codes · {branch.name}</h1>
          <p className="text-sm text-gray-500">
            {stickers.length} stickers. Print on A4; each one is about 6 cm wide.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/branches/${branchId}`}
            className="inline-flex h-11 items-center rounded-xl border border-gray-200 px-4 text-sm font-medium"
          >
            Back
          </Link>
          <PrintButton />
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
        {stickers.map((s) => (
          <li
            key={s.id}
            className="flex break-inside-avoid flex-col items-center rounded-xl border-2 border-dashed border-gray-300 p-4 text-center"
          >
            <p className="text-xs font-semibold tracking-[0.14em] text-gray-500 uppercase">
              {tenant?.name}
            </p>
            <p className="mt-1 leading-tight font-bold">{s.path.at(-1)}</p>
            {s.path.length > 1 && (
              <p className="text-xs text-gray-500">{s.path.slice(0, -1).join(" › ")}</p>
            )}
            <div
              role="img"
              aria-label={`QR code for ${s.path.join(" › ")}`}
              className="my-2 w-full max-w-44 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <p className="text-sm font-semibold">Scan to report a problem</p>
            {s.code && (
              <p className="mt-0.5 font-mono text-xs font-semibold text-gray-700">{s.code}</p>
            )}
            <p className="mt-1 font-mono text-[10px] break-all text-gray-500">{s.url}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
