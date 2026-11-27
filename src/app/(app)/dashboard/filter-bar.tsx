"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Icon } from "@/components/icons"

const RANGES = [
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
]

export function DashboardFilterBar({
  branches,
  branchId,
  days,
}: {
  branches: { id: string; name: string }[]
  branchId: string
  days: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function navigate(nextBranchId: string, nextDays: string) {
    const qs = new URLSearchParams()
    if (nextBranchId) qs.set("branchId", nextBranchId)
    if (nextDays && nextDays !== "14") qs.set("days", nextDays)
    const url = qs.toString() ? `/dashboard?${qs.toString()}` : "/dashboard"
    startTransition(() => router.push(url))
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3"
      aria-busy={pending || undefined}
    >
      {branches.length > 0 && (
        <label className="relative flex min-w-44 items-center gap-2 rounded-xl border border-input bg-background px-3 py-1.5 text-sm dark:bg-input/30">
          <Icon name="branch" className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Filter by branch</span>
          <select
            aria-label="Filter by branch"
            value={branchId}
            disabled={pending}
            onChange={(e) => navigate(e.target.value, String(days))}
            className="h-8 w-full bg-transparent pr-2 text-sm font-medium outline-none"
          >
            <option value="">All units ({branches.length})</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="relative flex min-w-40 items-center gap-2 rounded-xl border border-input bg-background px-3 py-1.5 text-sm dark:bg-input/30">
        <Icon name="clock" className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Date range</span>
        <select
          aria-label="Date range"
          value={String(days)}
          disabled={pending}
          onChange={(e) => navigate(branchId, e.target.value)}
          className="h-8 w-full bg-transparent pr-2 text-sm font-medium outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      {(branchId || days !== 14) && (
        <button
          type="button"
          onClick={() => navigate("", "14")}
          className="text-xs font-medium text-primary hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  )
}
