"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  addTicketComment,
  applyTicketTransition,
  bulkUpdateTickets,
  createManualTicket,
  createSavedView,
  deleteSavedView,
  mergeTicket,
  updateTicketTags,
} from "@/server/modules/tickets"
import type { TicketEvent } from "@/lib/ticket-state-machine"

export async function createManualTicketAction(
  _: ActionState<{ id: string }>,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["attachmentIds"])
    const tagsRaw = String(raw.tags ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const ticket = await createManualTicket(ctx, {
      locationId: String(raw.locationId ?? ""),
      categoryId: String(raw.categoryId ?? ""),
      severity: String(raw.severity || "medium") as never,
      description: String(raw.description ?? ""),
      assigneeId: String(raw.assigneeId ?? "") || undefined,
      tags: tagsRaw,
      attachments: (raw.attachmentIds as string[]) ?? [],
    })
    revalidatePath("/tickets")
    revalidatePath("/dashboard")
    return { id: ticket._id.toHexString() }
  })
}

export async function transitionTicketAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["attachmentIds"])
    const ticketId = String(raw.ticketId ?? "")
    const type = String(raw.type ?? "") as TicketEvent["type"]
    const payload: Record<string, unknown> = {
      type,
      ...(raw.assigneeId ? { assigneeId: String(raw.assigneeId) } : {}),
      ...(raw.reason ? { reason: String(raw.reason) } : {}),
      ...(raw.note ? { note: String(raw.note) } : {}),
      ...(raw.duplicateOf ? { duplicateOf: String(raw.duplicateOf) } : {}),
      ...(Array.isArray(raw.attachmentIds) ? { resolutionAttachments: raw.attachmentIds } : {}),
    }
    await applyTicketTransition(ctx, ticketId, payload as never)
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath("/tickets")
    revalidatePath("/my-work")
    revalidatePath("/verifications")
    revalidatePath("/dashboard")
  })
}

export async function quickTransitionAction(
  ticketId: string,
  event: TicketEvent,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await applyTicketTransition(ctx, ticketId, event)
    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath("/tickets")
    revalidatePath("/my-work")
    revalidatePath("/verifications")
    revalidatePath("/dashboard")
  })
}

export async function addCommentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["attachmentIds"])
    const ticketId = String(raw.ticketId ?? "")
    await addTicketComment(ctx, ticketId, {
      body: String(raw.body ?? ""),
      visibility: raw.visibility === "public" ? "public" : "internal",
      attachments: (raw.attachmentIds as string[]) ?? [],
    })
    revalidatePath(`/tickets/${ticketId}`)
  })
}

export async function updateTagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const ticketId = String(form.get("ticketId") ?? "")
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    await updateTicketTags(ctx, ticketId, tags)
    revalidatePath(`/tickets/${ticketId}`)
  })
}

export async function bulkTicketAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["ticketIds"])
    await bulkUpdateTickets(ctx, {
      ticketIds: (raw.ticketIds as string[]) ?? [],
      action: raw.action === "cancel" ? "cancel" : "assign",
      assigneeId: String(raw.assigneeId ?? "") || undefined,
      reason: String(raw.reason ?? "") || undefined,
    })
    revalidatePath("/tickets")
    revalidatePath("/my-work")
    revalidatePath("/dashboard")
  })
}

export async function createSavedViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    await createSavedView(ctx, {
      name: String(raw.name ?? ""),
      shared: raw.shared === "on",
      filters: {
        ...(raw.status ? { status: String(raw.status) } : {}),
        ...(raw.severity ? { severity: String(raw.severity) } : {}),
        ...(raw.branchId ? { branchId: String(raw.branchId) } : {}),
        ...(raw.categoryId ? { categoryId: String(raw.categoryId) } : {}),
        ...(raw.assigneeId ? { assigneeId: String(raw.assigneeId) } : {}),
        ...(raw.q ? { q: String(raw.q) } : {}),
      },
    })
    revalidatePath("/tickets")
  })
}

export async function deleteSavedViewAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteSavedView(ctx, id)
    revalidatePath("/tickets")
  })
}

export async function mergeTicketAction(
  _: ActionState<{ targetId: string }>,
  form: FormData,
): Promise<ActionState<{ targetId: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const sourceId = String(form.get("sourceId") ?? "")
    const target = String(form.get("target") ?? "")
    const reason = String(form.get("reason") ?? "").trim() || "Merged duplicate ticket"
    const res = await mergeTicket(ctx, sourceId, target, reason)
    revalidatePath(`/tickets/${sourceId}`)
    revalidatePath(`/tickets/${res.target._id.toHexString()}`)
    revalidatePath("/tickets")
    revalidatePath("/dashboard")
    return { targetId: res.target._id.toHexString() }
  })
}
