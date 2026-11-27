"use client"

import { useState, useTransition } from "react"
import { Icon } from "@/components/icons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { ChainReport } from "@/server/audit/audit-log"
import { verifyAuditChainAction } from "./actions"

/**
 * On-demand SHA-256 hash-chain verification so `/audit-log` loads instantaneously
 * even with hundreds of thousands of entries, while still giving auditors 1-click cryptographic proof.
 */
export function VerifyChainBanner({
  totalEntries,
  initialReport = null,
}: {
  totalEntries: number
  initialReport?: ChainReport | null
}) {
  const [pending, startTransition] = useTransition()
  const [report, setReport] = useState<ChainReport | null>(initialReport)
  const [error, setError] = useState<string | null>(null)

  function runCheck() {
    setError(null)
    startTransition(async () => {
      const res = await verifyAuditChainAction()
      if (res?.ok) setReport(res.data)
      else if (res) setError(res.error.message)
    })
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Tamper-evident hash chain</p>
          <p className="text-xs text-muted-foreground">
            {totalEntries.toLocaleString()} append-only entries. Each entry&apos;s SHA-256 hash
            commits to the entry before it.
          </p>
        </div>
        <Button variant="outline" size="lg" loading={pending} onClick={runCheck}>
          <Icon name="verify" data-icon="inline-start" />{" "}
          {report ? "Re-verify chain" : "Verify hash chain"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <Icon name="error" />
          <AlertTitle>Verification failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {report && report.ok && (
        <Alert variant="success">
          <Icon name="verify" />
          <AlertTitle>Chain verified</AlertTitle>
          <AlertDescription>
            All {report.count.toLocaleString()} entries check out: every hash links cleanly to the
            entry before it, confirming no entry has been altered or removed.
          </AlertDescription>
        </Alert>
      )}

      {report && !report.ok && (
        <Alert variant="destructive">
          <Icon name="error" />
          <AlertTitle>Chain broken at entry #{report.brokenAtSeq}</AlertTitle>
          <AlertDescription>
            An entry was changed or removed outside the app. Investigate before trusting later
            entries.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
