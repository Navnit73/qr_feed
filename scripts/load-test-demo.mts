/**
 * Concurrent 1,000-record DB push & live HTTP load test against the Demo account ("Sunrise Hospital").
 *
 * Usage:
 *   pnpm load:demo                       # 1000 concurrent DB pushes (concurrency=40) + live HTTP checks
 *   pnpm load:demo 1000 50               # custom count & concurrency
 *   pnpm load:demo 1000 40 --no-http     # skip Phase 2 HTTP burst against localhost:3000
 */
import { ObjectId } from "mongodb"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { db, mongoClient } from "@/server/db/client"
import { listBranches } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { getDashboard } from "@/server/modules/dashboard"
import { ensureDemoWorkspace } from "@/server/modules/demo"
import { submitFeedback, ticketStats } from "@/server/modules/intake"
import { changeTenantPlan, createApiKey, revokeApiKey } from "@/server/modules/platform"
import { listQrCodes } from "@/server/modules/qr-codes"
import { getAnalyticsReport } from "@/server/modules/reports"
import { createSlaPolicy, listSlaPolicies } from "@/server/modules/sla"
import { getTenant, PLAN_CATALOG, setTenantLimits } from "@/server/modules/tenants"
import { queryTickets } from "@/server/modules/tickets"
import { members, ticketActivities, tickets } from "@/server/repositories"

type LatencySummary = {
  count: number
  ok: number
  failed: number
  elapsedSec: number
  rps: number
  minMs: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
  errors: Record<string, number>
}

function summarize(
  latencies: number[],
  ok: number,
  failed: number,
  elapsedMs: number,
  errors: Record<string, number>,
): LatencySummary {
  const sorted = [...latencies].sort((a, b) => a - b)
  const pct = (p: number) =>
    sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const elapsedSec = Math.max(0.001, elapsedMs / 1000)
  return {
    count: ok + failed,
    ok,
    failed,
    elapsedSec: Number(elapsedSec.toFixed(2)),
    rps: Number(((ok + failed) / elapsedSec).toFixed(1)),
    minMs: sorted[0] ?? 0,
    avgMs: sorted.length > 0 ? Math.round(sum / sorted.length) : 0,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    maxMs: sorted.at(-1) ?? 0,
    errors,
  }
}

const REPORT_TEMPLATES: Record<string, { descriptions: string[]; ratings: number[] }> = {
  cleanliness: {
    descriptions: [
      "Floor is damp near the basin and needs a dry mop pass.",
      "Trash bin is full and needs replacement liner.",
      "Hand sanitiser dispenser is nearly empty outside entrance.",
      "Waiting chairs need wiping after morning OPD rush.",
    ],
    ratings: [1, 2, 2, 3],
  },
  waiting_time: {
    descriptions: [
      "Queue has been moving slowly for over 30 minutes.",
      "Token display screen paused on previous number.",
      "Long wait at peak shift handover window.",
      "Additional counter needed during morning rush.",
    ],
    ratings: [2, 2, 3, 3],
  },
  staff_behaviour: {
    descriptions: [
      "Duty nurse explained post-visit care clearly and politely.",
      "Reception staff helped elderly visitor find the lift quickly.",
      "Front desk response felt rushed during peak hours.",
      "Attendant assisted promptly with wheelchair request.",
    ],
    ratings: [4, 5, 3, 5],
  },
  facilities: {
    descriptions: [
      "Air conditioning is blowing warm air in the seating area.",
      "Overhead LED panel flickering intermittently.",
      "Water cooler cup dispenser needs refilling.",
      "Door closer makes loud slam when patients enter.",
    ],
    ratings: [2, 2, 3, 3],
  },
  safety: {
    descriptions: [
      "Loose floor cable cover near walkway corner.",
      "Wet-floor caution sign missing after mopping.",
      "Handrail bracket feels slightly loose on ramp side.",
      "Emergency exit corridor partially obstructed by trolley.",
    ],
    ratings: [1, 1, 2, 2],
  },
  billing: {
    descriptions: [
      "Need clarification on lab package line item on estimate.",
      "Card terminal took multiple retries at billing desk.",
      "Insurance pre-authorisation desk queue is backed up.",
      "Printed receipt faded and hard to read.",
    ],
    ratings: [2, 3, 3, 4],
  },
  patient_care: {
    descriptions: [
      "Doctor answered all family questions patiently.",
      "Follow-up instructions were clear and helpful.",
      "Call bell response took longer than expected.",
      "Discharge summary handover was smooth and timely.",
    ],
    ratings: [5, 5, 2, 4],
  },
  other: {
    descriptions: [
      "Wayfinding signage to diagnostics wing could be clearer.",
      "Visitor Wi-Fi disconnects near the waiting lounge.",
      "Parking exit token scanner slow to read barcode.",
      "Suggestion to add more charging points in waiting hall.",
    ],
    ratings: [3, 3, 4, 4],
  },
}

const REPORTER_NAMES = [
  "Asha Verma",
  "Rajesh Kumar",
  "Meera Iyer",
  "Vikram Singh",
  "Sunita Sharma",
  "Arjun Patel",
  "Neha Gupta",
  "Suresh Nair",
]

function parseArgs(argv: string[]) {
  const positional: string[] = []
  let baseUrl = "http://localhost:3000"
  let runHttp = true
  for (const arg of argv) {
    if (arg === "--no-http") runHttp = false
    else if (arg.startsWith("--base-url=")) baseUrl = arg.slice("--base-url=".length)
    else positional.push(arg)
  }
  const count = Math.max(1, Number(positional[0]) || 1000)
  const concurrency = Math.max(1, Math.min(100, Number(positional[1]) || 40))
  return { count, concurrency, baseUrl, runHttp }
}

async function runPool<T>(
  total: number,
  concurrency: number,
  task: (index: number) => Promise<T>,
  onProgress?: (done: number) => void,
) {
  let nextIdx = 0
  let done = 0
  let ok = 0
  let failed = 0
  const latencies: number[] = []
  const errors: Record<string, number> = {}
  const results: T[] = []
  const started = Date.now()

  async function worker() {
    while (true) {
      const idx = nextIdx++
      if (idx >= total) return
      const t0 = Date.now()
      try {
        const res = await task(idx)
        latencies.push(Date.now() - t0)
        results.push(res)
        ok++
      } catch (err) {
        latencies.push(Date.now() - t0)
        failed++
        const label =
          err instanceof Error
            ? `${(err as { code?: string }).code ?? err.name}: ${err.message.slice(0, 80)}`
            : String(err).slice(0, 80)
        errors[label] = (errors[label] ?? 0) + 1
      } finally {
        done++
        onProgress?.(done)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()))
  return {
    results,
    summary: summarize(latencies, ok, failed, Date.now() - started, errors),
  }
}

async function main() {
  const { count, concurrency, baseUrl, runHttp } = parseArgs(process.argv.slice(2))
  console.info(
    `\n=== QR Feed Demo DB Load Test ===\nTarget: ${count} concurrent pushes (concurrency=${concurrency}) -> Demo Account\n`,
  )

  // 1. Resolve Demo Account ("Sunrise Hospital")
  const demo = await ensureDemoWorkspace()
  const tenantId = new ObjectId(demo.tenantId)
  const admin = await members.unscoped().findOne({ tenantId, email: demo.email, status: "active" })
  if (!admin) throw new Error("Demo admin membership not found.")
  const ctx = (await resolveTenantContext(admin.userId, tenantId))!

  // 2. Ensure sufficient monthly ticket quota and an active SLA policy
  const tenant = (await getTenant(tenantId))!
  const beforeTicketCount = await tickets.forTenant(ctx).count({})
  const beforeActivityCount = await ticketActivities.forTenant(ctx).count({})
  const effectiveMonthlyLimit =
    tenant.limits.monthlyTickets ?? PLAN_CATALOG[tenant.plan]?.limits.monthlyTickets ?? 0
  const neededLimit = beforeTicketCount + count + 100

  if (effectiveMonthlyLimit < neededLimit) {
    if (neededLimit <= PLAN_CATALOG.business.limits.monthlyTickets) {
      console.info(
        `Upgrading demo tenant "${tenant.name}" plan (${tenant.plan} -> business, 10,000 monthlyTickets) so ${count} tickets fit within quota...`,
      )
      await changeTenantPlan(ctx, "business", "sandbox")
    } else {
      console.info(`Raising demo tenant monthlyTickets limit to ${neededLimit}...`)
      await setTenantLimits({
        actorId: admin.userId,
        tenantId,
        plan: "enterprise",
        limits: { ...PLAN_CATALOG.enterprise.limits, monthlyTickets: neededLimit },
      })
    }
  }

  const existingSlas = await listSlaPolicies(ctx)
  if (existingSlas.length === 0) {
    console.info(`Creating default "Hospital Standard SLA" policy on demo tenant...`)
    await createSlaPolicy(ctx, {
      name: "Hospital Standard SLA",
      businessHoursMode: "24x7",
      appliesTo: {},
      levels: [
        {
          level: 1,
          acceptWithinMin: 15,
          resolveWithinMin: 180,
          escalateAfterMin: 180,
          targetRole: "l1_staff",
          action: "both",
        },
        {
          level: 2,
          acceptWithinMin: 30,
          resolveWithinMin: 300,
          escalateAfterMin: 300,
          targetRole: "l2_supervisor",
          action: "both",
        },
        {
          level: 3,
          acceptWithinMin: 60,
          resolveWithinMin: 480,
          escalateAfterMin: 480,
          targetRole: "l3_manager",
          action: "both",
        },
      ],
    })
  }

  const branchList = await listBranches(ctx)
  const qrGroups = await Promise.all(branchList.map((b) => listQrCodes(ctx, b._id)))
  const allQrs = qrGroups.flat()
  const cats = await listCategories(ctx, tenant.industry)
  if (allQrs.length === 0 || cats.length === 0) {
    throw new Error("Demo workspace is missing active QR codes or categories.")
  }

  console.info(
    `Demo workspace: "${tenant.name}" (${demo.tenantId}) | branches=${branchList.length} | QRs=${allQrs.length} | categories=${cats.length} | existingTickets=${beforeTicketCount}\n`,
  )

  // ── Phase 1: Concurrent DB push through real submitFeedback() pipeline ──────────────────────
  console.info(
    `[Phase 1] Pushing ${count} concurrent QR feedback tickets to DB (concurrency=${concurrency})...`,
  )
  const progressStep = Math.max(100, Math.floor(count / 5))
  const phase1 = await runPool(
    count,
    concurrency,
    async (i) => {
      const qr = allQrs[i % allQrs.length]
      const cat = cats[(i + Math.floor(i / allQrs.length)) % cats.length]
      const tpl = REPORT_TEMPLATES[cat.key] ?? REPORT_TEMPLATES.other
      const desc = tpl.descriptions[i % tpl.descriptions.length]
      const rating = tpl.ratings[i % tpl.ratings.length]
      const urgency = i % 7 === 0 ? "urgent" : "normal"
      const named = i % 3 === 0

      return submitFeedback(
        qr.shortCode,
        {
          categoryId: cat._id.toHexString(),
          rating,
          description: `${desc} [LoadTest #${i + 1}]`,
          urgency,
          consent: "on",
          ...(named ? { name: REPORTER_NAMES[i % REPORTER_NAMES.length] } : {}),
        },
        {
          ip: `10.200.${Math.floor(i / 250) % 255}.${(i % 250) + 1}`,
          limits: null,
          dedupe: false,
        },
      )
    },
    (done) => {
      if (done % progressStep === 0 || done === count) {
        console.info(`  ... ${done}/${count} completed`)
      }
    },
  )

  const uniqueNumbers = new Set(phase1.results.map((r) => r.number))
  console.info("\n[Phase 1 Result — Concurrent DB Push]")
  console.info(
    JSON.stringify(
      {
        ...phase1.summary,
        uniqueTicketNumbers: uniqueNumbers.size,
        allNumbersUnique: uniqueNumbers.size === phase1.summary.ok,
        sampleFirstNumber: phase1.results[0]?.number ?? null,
        sampleLastNumber: phase1.results.at(-1)?.number ?? null,
      },
      null,
      2,
    ),
  )

  // ── Phase 2: Live HTTP Concurrent Burst against running Next.js server (if up) ──────────────
  if (runHttp) {
    let serverUp = false
    try {
      const h = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) })
      serverUp = h.ok
    } catch {
      serverUp = false
    }

    if (!serverUp) {
      console.info(`\n[Phase 2] Skipped live HTTP tests (${baseUrl} not reachable).`)
    } else {
      console.info(
        `\n[Phase 2A] Live HTTP QR scan burst: 100 concurrent GET /f/<shortCode> (concurrency=20)...`,
      )
      const scanBurst = await runPool(100, 20, async (i) => {
        const qr = allQrs[i % allQrs.length]
        const res = await fetch(`${baseUrl}/f/${qr.shortCode}`, {
          signal: AbortSignal.timeout(15_000),
        })
        await res.arrayBuffer()
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.status
      })
      console.info(JSON.stringify(scanBurst.summary, null, 2))

      // Temporary API key for REST API v1 load verification (revoked immediately in finally)
      const tempKey = await createApiKey(ctx, {
        name: `Load Test Ephemeral ${new Date().toISOString().slice(0, 19)}`,
        scopes: ["ticket:read", "ticket:create"],
      })
      try {
        console.info(
          `\n[Phase 2B] Live HTTP REST read burst at 1,000+ scale: 50 concurrent GET /api/v1/tickets (concurrency=10)...`,
        )
        let observedTotal = 0
        const apiReadBurst = await runPool(50, 10, async (i) => {
          const page = (i % 10) + 1
          const res = await fetch(`${baseUrl}/api/v1/tickets?page=${page}&pageSize=25`, {
            headers: { Authorization: `Bearer ${tempKey.rawKey}` },
            signal: AbortSignal.timeout(15_000),
          })
          const json = (await res.json()) as {
            ok: boolean
            meta?: { total: number }
            error?: { message: string }
          }
          if (!res.ok || !json.ok)
            throw new Error(`HTTP ${res.status}: ${json.error?.message ?? ""}`)
          observedTotal = Math.max(observedTotal, json.meta?.total ?? 0)
          return json.meta?.total ?? 0
        })
        console.info(
          JSON.stringify({ ...apiReadBurst.summary, observedApiTotal: observedTotal }, null, 2),
        )

        console.info(
          `\n[Phase 2C] Live HTTP REST write burst: 10 concurrent POST /api/v1/tickets (concurrency=5)...`,
        )
        const apiWriteBurst = await runPool(10, 5, async (i) => {
          const qr = allQrs[i % allQrs.length]
          const cat = cats[i % cats.length]
          const res = await fetch(`${baseUrl}/api/v1/tickets`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tempKey.rawKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              locationId: qr.locationId.toHexString(),
              categoryId: cat._id.toHexString(),
              severity: i % 3 === 0 ? "high" : "medium",
              description: `API concurrent write test #${i + 1}`,
              tags: ["load-test", "api-v1"],
            }),
            signal: AbortSignal.timeout(30_000),
          })
          const json = (await res.json()) as {
            ok: boolean
            data?: { number: string }
            error?: { message: string }
          }
          if (!res.ok || !json.ok)
            throw new Error(`HTTP ${res.status}: ${json.error?.message ?? ""}`)
          return json.data!.number
        })
        console.info(
          JSON.stringify(
            {
              ...apiWriteBurst.summary,
              createdNumbers: apiWriteBurst.results.slice(0, 5),
            },
            null,
            2,
          ),
        )
      } finally {
        await revokeApiKey(ctx, tempKey.doc._id)
      }
    }
  }

  // ── Phase 3: Post-Load DB Integrity & Query Performance Benchmark ──────────────────────────
  console.info(
    "\n[Phase 3] Verifying DB integrity, audit chain & query performance at 1,000+ scale...",
  )
  const [afterTicketCount, afterActivityCount, dupAgg, chain] = await Promise.all([
    tickets.forTenant(ctx).count({}),
    ticketActivities.forTenant(ctx).count({}),
    db()
      .collection("tickets")
      .aggregate<{ _id: string; count: number }>([
        { $match: { tenantId } },
        { $group: { _id: "$number", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray(),
    verifyChain(ctx),
  ])

  const bench = async <T,>(fn: () => Promise<T>) => {
    const t0 = Date.now()
    const res = await fn()
    return { ms: Date.now() - t0, res }
  }

  const [dashBench, listBench, statsBench, reportBench] = await Promise.all([
    bench(() => getDashboard(ctx, { days: 30 })),
    bench(() => queryTickets(ctx, { page: 1, pageSize: 25 })),
    bench(() => ticketStats(ctx)),
    bench(() => getAnalyticsReport(ctx, { rangeDays: 30 })),
  ])

  console.info(
    JSON.stringify(
      {
        dbCounts: {
          ticketsBefore: beforeTicketCount,
          ticketsAfter: afterTicketCount,
          ticketsAdded: afterTicketCount - beforeTicketCount,
          activitiesBefore: beforeActivityCount,
          activitiesAfter: afterActivityCount,
          activitiesAdded: afterActivityCount - beforeActivityCount,
        },
        integrity: {
          duplicateTicketNumbers: dupAgg.length,
          auditChain: chain,
        },
        queryBenchmarksAtScaleMs: {
          getDashboard30d: dashBench.ms,
          queryTicketsPage1: listBench.ms,
          ticketStats: statsBench.ms,
          getAnalyticsReport30d: reportBench.ms,
        },
        dashboardSnapshot: {
          open: dashBench.res.tickets?.open ?? 0,
          avgRating: dashBench.res.tickets?.avgRating ?? null,
          slaCompliancePct: dashBench.res.tickets?.slaCompliancePct ?? null,
          topLocation: dashBench.res.tickets?.topLocations[0] ?? null,
        },
      },
      null,
      2,
    ),
  )

  if (phase1.summary.failed > 0 || dupAgg.length > 0 || !chain.ok) {
    process.exitCode = 1
  }
}

try {
  await main()
  // Allow any fire-and-forget webhook lookups to settle before closing the pool.
  await new Promise((r) => setTimeout(r, 400))
} finally {
  await mongoClient().close()
}
