import "server-only"
import type { ObjectId } from "mongodb"
import { defineRepository, type TenantDoc } from "@/server/db/repository"
import type { Severity } from "@/lib/feedback-presets"
import type { LocationType } from "@/lib/location-tree"
import type { RoleScope } from "@/server/rbac/permissions"

/*
 * Every tenant collection, defined in one place. Each one is registered, and
 * src/server/isolation.int.test.ts proves tenant isolation for all of them.
 * Global (non-tenant) collections: `tenants` (src/server/modules/tenants.ts) and Better Auth's
 * `user`, `session`, `account` and `verification`.
 */

export type BranchDoc = TenantDoc & {
  name: string
  address?: string
  timezone: string
  status: "active" | "archived"
}
export const branches = defineRepository<BranchDoc>("branches", { branchField: "_id" })

export type LocationDoc = TenantDoc & {
  branchId: ObjectId
  type: LocationType
  name: string
  parentId: ObjectId | null
  /** Root first. Lets "everything under Floor 2" be one indexed query. */
  ancestors: ObjectId[]
  /** Names from root to this node, for display without joins. */
  path: string[]
  code?: string
  status: "active" | "archived"
}
export const locations = defineRepository<LocationDoc>("locations", { branchField: "branchId" })

export type MemberDoc = TenantDoc & {
  /** Better Auth user id. */
  userId: string
  email: string
  name: string
  /** System role keys (`l1_staff`) or `custom:<roleId>`. */
  roles: string[]
  branchIds: ObjectId[]
  status: "active" | "inactive"
}
export const members = defineRepository<MemberDoc>("members")

export type InviteDoc = TenantDoc & {
  email: string
  roles: string[]
  branchIds: ObjectId[]
  /** sha256 of the token. The raw token only ever exists in the invite link. */
  tokenHash: string
  expiresAt: Date
  invitedBy: string
  status: "pending" | "accepted" | "revoked"
}
export const invites = defineRepository<InviteDoc>("invites")

export type RoleDoc = TenantDoc & {
  name: string
  description?: string
  permissions: string[]
  scope: RoleScope
}
export const roles = defineRepository<RoleDoc>("roles")

export type AuditLogDoc = TenantDoc & {
  seq: number
  actorId: string
  action: string
  entity: string
  entityId: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  ua?: string | null
  at: Date
  prevHash: string
  hash: string
}
export const auditLogs = defineRepository<AuditLogDoc>("auditLogs", { appendOnly: true })

// ── Phase 2: feedback intake ─────────────────────────────────────────────────────────

export type CategoryDoc = TenantDoc & {
  key: string
  label: string
  defaultSeverity: Severity
  order: number
  active: boolean
}
export const categories = defineRepository<CategoryDoc>("categories")

export type QrCodeDoc = TenantDoc & {
  branchId: ObjectId
  locationId: ObjectId
  /** Public, printed on the sticker: /f/<shortCode>. Unique across all tenants. */
  shortCode: string
  status: "active" | "revoked"
  scanCount: number
  lastScannedAt?: Date
  createdBy: string
  revokedAt?: Date
}
export const qrCodes = defineRepository<QrCodeDoc>("qrCodes", { branchField: "branchId" })

/** Statuses from the P3 state machine (phase.md §6.1). P2 only creates `new`. */
export const TICKET_STATUSES = [
  "new",
  "assigned",
  "accepted",
  "in_progress",
  "on_hold",
  "pending_verification",
  "reopened",
  "closed",
  "cancelled",
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export const OPEN_TICKET_STATUSES: TicketStatus[] = TICKET_STATUSES.filter(
  (s) => s !== "closed" && s !== "cancelled",
)

export type TicketDoc = TenantDoc & {
  branchId: ObjectId
  locationId: ObjectId
  /** Denormalised for lists; location renames don't rewrite old tickets on purpose. */
  locationPath: string[]
  qrCodeId: ObjectId | null
  /** TKT-2026-000123, unique per tenant. */
  number: string
  source: "qr" | "manual" | "audit"
  categoryId: ObjectId
  categoryName: string
  severity: Severity
  status: TicketStatus
  rating: number | null
  description: string
  reporter: { anonymous: boolean; name?: string; email?: string; phone?: string }
  /** sha256 of each reporter's tracking token. The raw tokens live only in their links. */
  trackingTokenHashes: string[]
  /** How many people reported this (repeat reports merge into the open ticket). */
  reportCount: number
  lastReportedAt: Date
}
export const tickets = defineRepository<TicketDoc>("tickets", { branchField: "branchId" })

export type TicketActivityDoc = TenantDoc & {
  branchId: ObjectId
  ticketId: ObjectId
  type: string
  actorId: string
  at: Date
  note?: string
  meta?: Record<string, unknown>
}
export const ticketActivities = defineRepository<TicketActivityDoc>("ticketActivities", {
  branchField: "branchId",
  appendOnly: true,
})
