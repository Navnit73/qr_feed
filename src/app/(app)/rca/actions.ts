"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  createCapa,
  createRca,
  signRcaApproval,
  updateCapaActionStatus,
  updateRcaAnalysis,
  verifyCapaEffectiveness,
} from "@/server/modules/rca-capa"

const splitLines = (v: unknown) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

export async function createRcaAction(
  _: ActionState<{ id: string }>,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const ticketId = String(raw.sourceTicketId ?? "").trim()
    const doc = await createRca(ctx, {
      title: String(raw.title ?? ""),
      method: String(raw.method || "5why") as "5why" | "fishbone" | "8d",
      problemStatement: String(raw.problemStatement ?? ""),
      sourceTicketIds: ticketId ? [ticketId] : [],
    })
    revalidatePath("/rca")
    if (ticketId) revalidatePath(`/tickets/${ticketId}`)
    return { id: doc._id.toHexString() }
  })
}

export async function updateRcaAnalysisAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const rcaId = String(raw.rcaId ?? "")
    await updateRcaAnalysis(ctx, rcaId, {
      method: String(raw.method || "5why") as "5why" | "fishbone" | "8d",
      problemStatement: String(raw.problemStatement ?? ""),
      whys: [raw.why1, raw.why2, raw.why3, raw.why4, raw.why5].map((w) => String(w ?? "")),
      fishbone: {
        man: splitLines(raw.fb_man),
        machine: splitLines(raw.fb_machine),
        method: splitLines(raw.fb_method),
        material: splitLines(raw.fb_material),
        measurement: splitLines(raw.fb_measurement),
        environment: splitLines(raw.fb_environment),
      },
      contributingFactors: splitLines(raw.contributingFactors),
      rootCause: String(raw.rootCause ?? ""),
    })
    revalidatePath(`/rca/${rcaId}`)
  })
}

export async function createCapaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const rcaId = String(raw.rcaId ?? "")
    const actionTitles = splitLines(raw.actionTitles)
    const ownerId = String(raw.ownerId ?? ctx.actorId)
    const dueDate = String(raw.dueDate ?? new Date(Date.now() + 7 * 86_400_000).toISOString())
    await createCapa(ctx, {
      rcaId,
      title: String(raw.title ?? ""),
      type: String(raw.type || "corrective") as "correction" | "corrective" | "preventive",
      effectivenessDueDays: Number(raw.effectivenessDueDays) || 30,
      effectivenessMethod: String(raw.effectivenessMethod || "30-day recurrence & inspection"),
      actions: actionTitles.map((title) => ({ title, ownerId, dueDate })),
    })
    revalidatePath(`/rca/${rcaId}`)
    revalidatePath("/rca")
  })
}

export async function setCapaActionStatusAction(
  rcaId: string,
  capaId: string,
  actionId: string,
  status: "open" | "in_progress" | "completed" | "verified",
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await updateCapaActionStatus(ctx, capaId, actionId, status)
    revalidatePath(`/rca/${rcaId}`)
  })
}

export async function verifyEffectivenessAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const rcaId = String(raw.rcaId ?? "")
    await verifyCapaEffectiveness(ctx, String(raw.capaId ?? ""), {
      recurred: raw.recurred === "yes",
      result: raw.result === "ineffective" ? "ineffective" : "effective",
      evidence: String(raw.evidence ?? ""),
    })
    revalidatePath(`/rca/${rcaId}`)
    revalidatePath("/rca")
  })
}

export async function signApprovalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const rcaId = String(raw.rcaId ?? "")
    await signRcaApproval(ctx, rcaId, {
      stage: String(raw.stage || "owner") as "owner" | "reviewer" | "approver",
      decision: raw.decision === "rejected" ? "rejected" : "approved",
      comment: String(raw.comment ?? "") || undefined,
    })
    revalidatePath(`/rca/${rcaId}`)
    revalidatePath("/rca")
  })
}
