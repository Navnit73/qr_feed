/**
 * Seeds the rich demo organisation ("Sunrise Hospital") into the database in .env.local.
 * Shares `ensureDemoWorkspace()` with the one-click Demo Login on `/sign-in`.
 *
 *   pnpm db:seed
 */
import { mongoClient } from "@/server/db/client"
import { ensureDemoWorkspace } from "@/server/modules/demo"

async function main() {
  const demo = await ensureDemoWorkspace()
  console.info(`✓ Demo workspace ready (tenantId=${demo.tenantId})`)
  console.info(`  Sign in at /sign-in with ${demo.email} / ${demo.password} (or click "Try Demo")`)
}

try {
  await main()
} finally {
  await mongoClient().close()
}
