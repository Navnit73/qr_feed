/**
 * Public QR page burst load-test script (phase.md F-10.3).
 *
 *   pnpm tsx scripts/load-test.mts http://localhost:3000/f/<shortCode> 50 10
 */
const [url, totalArg = "50", concArg = "10"] = process.argv.slice(2)
if (!url) {
  console.error("Usage: load-test.mts <url> [totalRequests=50] [concurrency=10]")
  process.exit(1)
}
const total = Math.max(1, Number(totalArg) || 50)
const concurrency = Math.max(1, Number(concArg) || 10)

let nextIdx = 0
let okCount = 0
let failCount = 0
const latencies: number[] = []
const started = Date.now()

async function worker() {
  while (true) {
    const i = nextIdx++
    if (i >= total) return
    const t0 = Date.now()
    try {
      const res = await fetch(url)
      latencies.push(Date.now() - t0)
      if (res.ok) okCount++
      else failCount++
    } catch {
      failCount++
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))
latencies.sort((a, b) => a - b)
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0
const elapsedSec = Math.max(0.001, (Date.now() - started) / 1000)
console.info(
  `Load test complete: ${okCount} ok, ${failCount} failed, ${(total / elapsedSec).toFixed(1)} req/s, p95=${p95}ms`,
)
