"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  completeAudit,
  convertFindingToRca,
  createAuditFinding,
  createAuditTemplate,
  saveAuditChecklist,
  scheduleAudit,
} from "@/server/modules/audits"

export async function createAuditTemplateAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const lines = String(raw.questions ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const items = lines.map((line, i) => {
      const parts = line.split("|").map((p) => p.trim())
      if (parts.length >= 3)
        return { clause: parts[0], section: parts[1], question: parts.slice(2).join(" | ") }
      if (parts.length === 2) return { clause: parts[0], section: "General", question: parts[1] }
      return { clause: `C-${i + 1}`, section: "General", question: line }
    })
    await createAuditTemplate(ctx, {
      name: String(raw.name ?? ""),
      standard: String(raw.standard ?? ""),
      description: String(raw.description ?? "") || undefined,
      items,
    })
    revalidatePath("/audits")
  })
}

export async function scheduleAuditAction(
  _: ActionState<{ id: string }>,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const doc = await scheduleAudit(ctx, {
      branchId: String(raw.branchId ?? ""),
      templateId: String(raw.templateId ?? ""),
      title: String(raw.title ?? ""),
      recurrence: String(raw.recurrence || "once") as "once" | "weekly" | "monthly" | "quarterly",
      scheduledAt: String(raw.scheduledAt ?? new Date().toISOString()),
    })
    revalidatePath("/audits")
    return { id: doc._id.toHexString() }
  })
}

export async function saveChecklistAction(
  auditId: string,
  results: { itemId: string; result: "pending" | "pass" | "fail" | "na"; note?: string }[],
): Promise<ActionState<{ scorePct: number | null }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const updated = await saveAuditChecklist(ctx, auditId, { results })
    revalidatePath(`/audits/${auditId}`)
    revalidatePath("/audits")
    return { scorePct: updated.scorePct ?? null }
  })
}

export async function completeAuditAction(auditId: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await completeAudit(ctx, auditId)
    revalidatePath(`/audits/${auditId}`)
    revalidatePath("/audits")
  })
}

export async function createFindingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["attachmentIds"])
    const auditId = String(raw.auditId ?? "")
    await createAuditFinding(ctx, auditId, {
      severity: String(raw.severity || "minor") as "observation" | "minor" | "major" | "critical",
      clause: String(raw.clause ?? ""),
      description: String(raw.description ?? ""),
      evidence: (raw.attachmentIds as string[]) ?? [],
    })
    revalidatePath(`/audits/${auditId}`)
    revalidatePath("/audits")
  })
}

export async function convertFindingToRcaAction(
  auditId: string,
  findingId: string,
): Promise<ActionState<{ rcaId: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const rca = await convertFindingToRca(ctx, findingId)
    revalidatePath(`/audits/${auditId}`)
    revalidatePath("/rca")
    return { rcaId: rca._id.toHexString() }
  })
}
