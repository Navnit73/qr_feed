"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { ApiError } from "@/lib/api/errors"
import { runAction, type ActionState } from "@/server/actions"
import { requireSuperAdmin } from "@/server/auth/session"
import { setTenantStatus } from "@/server/modules/tenants"

export async function setTenantStatusAction(
  tenantId: string,
  status: "active" | "suspended",
): Promise<ActionState> {
  const admin = await requireSuperAdmin()
  return runAction(async () => {
    if (!ObjectId.isValid(tenantId)) throw new ApiError("NOT_FOUND", "Tenant not found.")
    await setTenantStatus({ actorId: admin.id, tenantId: new ObjectId(tenantId), status })
    revalidatePath("/super")
  })
}
