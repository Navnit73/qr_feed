import { cn } from "@/lib/utils"

/** A placeholder block while data streams in. Size it with classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />
}

/** Fallback for a whole app page: heading, then a row of cards. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
