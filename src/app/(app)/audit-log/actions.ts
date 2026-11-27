"use server"

import { runAction, type ActionState } from "@/server/actions"
import { verifyChain, type ChainReport } from "@/server/audit/audit-log"
import { requireTenantContext } from "@/server/auth/session"

export async function verifyAuditChainAction(): Promise<ActionState<ChainReport>> {
  const ctx = await requireTenantContext()
  return runAction(() => verifyChain(ctx))
}
