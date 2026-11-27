import { Skeleton } from "@/components/skeleton"

/** Matches the branch page's shape (header, four tiles, site map) so navigation feels instant. */
export default function BranchLoading() {
  return (
    <div aria-busy="true" aria-label="Loading branch">
      <Skeleton className="h-4 w-48" />
      <div className="mt-4 mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36 rounded-xl" />
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl p-3 ring-1 ring-foreground/10">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-1.5"
            style={{ paddingLeft: `${Math.min(i, 3) * 1.25}rem` }}
          >
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
