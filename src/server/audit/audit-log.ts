import "server-only"
import { createHash } from "node:crypto"
import { ObjectId, type ClientSession } from "mongodb"
import { db } from "@/server/db/client"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertCan } from "@/server/rbac/ability"
import { auditLogs, type AuditLogDoc } from "@/server/repositories"

export type AuditEntry = {
  /** Dotted verb, e.g. `branch.created`, `member.updated`, `tenant.suspended`. */
  action: string
  entity: string
  entityId: string | ObjectId | null
  before?: unknown
  after?: unknown
  ip?: string
  ua?: string
}

type HeadDoc = { tenantId: ObjectId; seq: number; hash: string }
const heads = () => db().collection<HeadDoc>("auditHeads")

/** Stable JSON: sorted keys, ObjectIds as hex, dates as ISO, undefined as null. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return "null"
  if (value instanceof ObjectId) return JSON.stringify(value.toHexString())
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

type Hashed = Pick<
  AuditLogDoc,
  | "tenantId"
  | "seq"
  | "actorId"
  | "action"
  | "entity"
  | "entityId"
  | "before"
  | "after"
  | "ip"
  | "ua"
  | "at"
  | "prevHash"
>

function hashOf(r: Hashed): string {
  const { tenantId, seq, actorId, action, entity, entityId, before, after, ip, ua, at, prevHash } =
    r
  const body = canonical({
    tenantId,
    seq,
    actorId,
    action,
    entity,
    entityId,
    before,
    after,
    ip,
    ua,
    at,
    prevHash,
  })
  return createHash("sha256").update(body).digest("hex")
}

/**
 * Appends to the tenant's tamper-evident log: each entry's hash covers the previous one's,
 * so editing or deleting any entry breaks verifyChain(). Pass the caller's `session` so the
 * entry commits or rolls back with the change it describes.
 */
export async function appendAudit(
  ctx: TenantContext,
  entry: AuditEntry,
  { session }: { session?: ClientSession } = {},
): Promise<AuditLogDoc> {
  if (!session) {
    // Standalone appends may race for a brand-new tenant, so create the head first with an
    // idempotent upsert outside any transaction (a snapshot started later can see it).
    await heads().updateOne(
      { tenantId: ctx.tenantId },
      { $setOnInsert: { seq: 0, hash: "" } },
      { upsert: true },
    )
  }

  const run = async (s: ClientSession) => {
    // Incrementing the head inside the transaction serialises writers: a concurrent writer
    // gets a write conflict, and the driver retries its whole transaction. The upsert covers
    // a caller's transaction that creates the tenant itself (onboarding): its snapshot can't
    // see a head written outside it.
    const head = await heads().findOneAndUpdate(
      { tenantId: ctx.tenantId },
      { $inc: { seq: 1 } },
      { session: s, returnDocument: "after", upsert: true },
    )
    if (!head) throw new Error("Audit chain head missing.")
    const fields = {
      seq: head.seq,
      actorId: ctx.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === null ? null : String(entry.entityId),
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      ua: entry.ua ?? null,
      at: new Date(),
      prevHash: head.hash ?? "",
    }
    // The repository stamps tenantId on insert; the hash covers it too.
    const hash = hashOf({ tenantId: ctx.tenantId, ...fields })
    const saved = await auditLogs.forTenant(ctx).insertOne({ ...fields, hash }, { session: s })
    await heads().updateOne({ tenantId: ctx.tenantId }, { $set: { hash } }, { session: s })
    return saved
  }

  return session ? run(session) : withTransaction(run)
}

export async function listAudit(
  ctx: TenantContext,
  opts: {
    page?: number
    pageSize?: number
    entity?: string
    entityId?: string
    action?: string
  } = {},
) {
  assertCan(ctx, "log:read")
  const filter: Record<string, unknown> = {}
  if (opts.entity) filter.entity = opts.entity
  if (opts.entityId) filter.entityId = opts.entityId
  if (opts.action) {
    const escaped = opts.action
      .trim()
      .slice(0, 60)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (escaped) filter.action = new RegExp(escaped, "i")
  }
  return auditLogs.forTenant(ctx).paginate(filter, {
    page: opts.page,
    pageSize: opts.pageSize ?? 25,
    sort: { seq: -1 },
  })
}

export type ChainReport =
  { ok: true; count: number } | { ok: false; count: number; brokenAtSeq: number }

/** Recomputes every hash in order. Any edit, deletion, reordering or tail truncation shows up here. */
export async function verifyChain(ctx: TenantContext): Promise<ChainReport> {
  assertCan(ctx, "log:read")
  const [head, total] = await Promise.all([
    heads().findOne({ tenantId: ctx.tenantId }),
    auditLogs.forTenant(ctx).count({}),
  ])
  const cursor = db()
    .collection<AuditLogDoc>("auditLogs")
    .find({ tenantId: ctx.tenantId })
    .sort({ seq: 1 })
  let prevHash = ""
  let count = 0
  for await (const e of cursor) {
    if (e.seq !== count + 1 || e.prevHash !== prevHash || hashOf(e) !== e.hash) {
      return { ok: false, count: total, brokenAtSeq: e.seq }
    }
    prevHash = e.hash
    count++
  }
  if (head && (head.seq !== count || head.hash !== prevHash)) {
    return { ok: false, count: total, brokenAtSeq: count + 1 }
  }
  return { ok: true, count }
}
