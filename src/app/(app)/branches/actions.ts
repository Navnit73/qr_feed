"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { archiveBranch, createBranch, updateBranch } from "@/server/modules/branches"
import {
  archiveLocation,
  createLocation,
  moveLocation,
  renameLocation,
} from "@/server/modules/locations"
import {
  createQrCode,
  generateMissingQrCodes,
  regenerateQrCode,
  revokeQrCode,
} from "@/server/modules/qr-codes"

// Return nothing on success: ObjectIds aren't serialisable, and the page re-renders anyway.

export async function createBranchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await createBranch(ctx, formObject(form) as never)
    revalidatePath("/branches")
  })
}

export async function updateBranchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const branchId = String(form.get("branchId") ?? "")
    const days: Record<string, { enabled: boolean; start: string; end: string }> = {}
    for (const d of ["0", "1", "2", "3", "4", "5", "6"]) {
      days[d] = {
        enabled: form.get(`day_${d}_enabled`) === "on",
        start: String(form.get(`day_${d}_start`) || "09:00"),
        end: String(form.get(`day_${d}_end`) || "18:00"),
      }
    }
    const holidays = String(form.get("holidays") ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    await updateBranch(ctx, branchId, {
      name: String(form.get("name") ?? ""),
      timezone: String(form.get("timezone") ?? "UTC"),
      address: String(form.get("address") ?? ""),
      businessHours: { days },
      holidays,
    })
    revalidatePath("/branches")
    revalidatePath(`/branches/${branchId}`)
  })
}

export async function archiveBranchAction(branchId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  const res = await runAction(async () => {
    await archiveBranch(ctx, branchId)
    revalidatePath("/branches")
  })
  if (res.ok) redirect("/branches")
  return res
}

export async function createLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  const input = formObject(form)
  return runAction(async () => {
    await createLocation(ctx, { ...input, parentId: input.parentId || null } as never)
    revalidatePath(`/branches/${input.branchId}`)
  })
}

export async function renameLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await renameLocation(ctx, String(form.get("id")), String(form.get("name")))
    revalidatePath(`/branches/${form.get("branchId")}`)
  })
}

export async function archiveLocationAction(id: string, branchId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await archiveLocation(ctx, id)
    revalidatePath(`/branches/${branchId}`)
  })
}

export async function moveLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  const branchId = String(form.get("branchId") ?? "")
  const parentId = String(form.get("parentId") ?? "") || null
  return runAction(async () => {
    await moveLocation(ctx, String(form.get("id")), parentId)
    revalidatePath(`/branches/${branchId}`)
  })
}

// ── QR codes ─────────────────────────────────────────────────────────────────────────

export async function createQrAction(locationId: string, branchId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await createQrCode(ctx, locationId)
    revalidatePath(`/branches/${branchId}`)
  })
}

export async function generateQrCodesAction(branchId: string): Promise<ActionState<number>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const count = await generateMissingQrCodes(ctx, branchId)
    revalidatePath(`/branches/${branchId}`)
    return count
  })
}

export async function regenerateQrAction(qrId: string, branchId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await regenerateQrCode(ctx, qrId)
    revalidatePath(`/branches/${branchId}`)
  })
}

export async function revokeQrAction(qrId: string, branchId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await revokeQrCode(ctx, qrId)
    revalidatePath(`/branches/${branchId}`)
  })
}
