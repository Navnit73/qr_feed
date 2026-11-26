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

export type BusinessHoursDay = { enabled: boolean; start: string; end: string }
export type BranchBusinessHours = {
  /** Keys 0 (Sun) through 6 (Sat). */
  days: Record<string, BusinessHoursDay>
}

export type BranchDoc = TenantDoc & {
  name: string
  address?: string
  timezone: string
  businessHours?: BranchBusinessHours
  /** ISO YYYY-MM-DD holiday dates. */
  holidays?: string[]
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
  requiresRCA?: boolean
  requiresResolutionEvidence?: boolean
  slaPolicyId?: ObjectId | null
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

export type TicketSlaState = {
  acceptDueAt: Date
  resolveDueAt: Date
  acceptedAt?: Date | null
  resolvedAt?: Date | null
  breached: boolean
  acceptBreached?: boolean
  warnedAt?: Date | null
  pausedAt?: Date | null
  pausedMs: number
}

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
  /** Attachment IDs (AttachmentDoc._id hex strings) attached to the ticket. */
  attachments?: string[]
  // ── Phase 3–5 fields ─────────────────────────────────────────────────────────────
  assignee?: { userId: string; name: string } | null
  currentLevel?: 1 | 2 | 3
  slaPolicyId?: ObjectId | null
  sla?: TicketSlaState | null
  tags?: string[]
  resolutionNote?: string
  resolutionAttachments?: string[]
  reopenCount?: number
  rcaId?: ObjectId | null
  submittedForVerificationAt?: Date | null
  closedAt?: Date | null
  duplicateOf?: string
  requesterFeedback?: {
    resolved: boolean
    rating?: number | null
    comment?: string
    submittedAt: Date
  } | null
}
export const tickets = defineRepository<TicketDoc>("tickets", { branchField: "branchId" })

export type AttachmentScope = "ticket" | "comment" | "rca" | "capa" | "audit"
export type AttachmentDoc = TenantDoc & {
  branchId?: ObjectId
  storageKey: string
  filename: string
  contentType: "image/jpeg" | "image/png" | "image/webp"
  size: number
  uploadedBy: string
  scope: AttachmentScope
  entityId?: ObjectId
  /** For unauthenticated QR form uploads before ticket submission: sha256 of claim token. */
  claimTokenHash?: string
  claimed?: boolean
}
export const attachments = defineRepository<AttachmentDoc>("attachments")

export type TicketActivityDoc = TenantDoc & {
  branchId: ObjectId
  ticketId: ObjectId
  type: string
  actorId: string
  actorName?: string
  at: Date
  before?: unknown
  after?: unknown
  note?: string
  meta?: Record<string, unknown>
}
export const ticketActivities = defineRepository<TicketActivityDoc>("ticketActivities", {
  branchField: "branchId",
  appendOnly: true,
})

// ── Phase 3: remarks, assignment rules, saved views & notifications ─────────────────

export type TicketCommentDoc = TenantDoc & {
  branchId: ObjectId
  ticketId: ObjectId
  authorId: string
  authorName: string
  body: string
  visibility: "internal" | "public"
  attachments: string[]
}
export const ticketComments = defineRepository<TicketCommentDoc>("ticketComments", {
  branchField: "branchId",
})

export type AssignmentStrategy = "fixed" | "round_robin" | "least_loaded"
export type AssignmentRuleDoc = TenantDoc & {
  name: string
  priority: number
  active: boolean
  conditions: {
    branchId?: ObjectId | null
    locationId?: ObjectId | null
    categoryId?: ObjectId | null
    severity?: Severity | null
  }
  strategy: AssignmentStrategy
  userIds: string[]
  lastAssignedIndex: number
}
export const assignmentRules = defineRepository<AssignmentRuleDoc>("assignmentRules")

export type SavedViewDoc = TenantDoc & {
  name: string
  ownerId: string
  shared: boolean
  filters: {
    status?: string
    severity?: string
    branchId?: string
    categoryId?: string
    assigneeId?: string
    q?: string
  }
}
export const savedViews = defineRepository<SavedViewDoc>("savedViews")

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp" | "push"
export type NotificationDoc = TenantDoc & {
  userId: string
  channel: NotificationChannel
  type: string
  title: string
  body: string
  href?: string
  readAt: Date | null
  sentAt: Date
  status: "sent" | "queued" | "failed"
  meta?: Record<string, unknown>
}
export const notifications = defineRepository<NotificationDoc>("notifications")

// ── Phase 4: SLA policies & escalation events ───────────────────────────────────────

export type SlaEscalationAction = "notify" | "transfer" | "both"
export type SlaLevelConfig = {
  level: 1 | 2 | 3
  acceptWithinMin: number
  resolveWithinMin: number
  escalateAfterMin: number
  targetRole: string
  targetUserId?: string | null
  action: SlaEscalationAction
}

export type SlaPolicyDoc = TenantDoc & {
  name: string
  active: boolean
  businessHoursMode: "24x7" | "business_hours"
  appliesTo: {
    branchId?: ObjectId | null
    categoryId?: ObjectId | null
    severity?: Severity | null
  }
  levels: SlaLevelConfig[]
  pauseStatuses: TicketStatus[]
}
export const slaPolicies = defineRepository<SlaPolicyDoc>("slaPolicies")

export type EscalationEventDoc = TenantDoc & {
  branchId: ObjectId
  ticketId: ObjectId
  ticketNumber: string
  fromLevel: 1 | 2
  toLevel: 2 | 3
  reason: string
  action: SlaEscalationAction
  at: Date
  notifiedUserIds: string[]
  transferredToUserId?: string | null
}
export const escalationEvents = defineRepository<EscalationEventDoc>("escalationEvents", {
  branchField: "branchId",
  appendOnly: true,
})

// ── Phase 6: RCA & CAPA ─────────────────────────────────────────────────────────────

export type Fishbone6M = {
  man: string[]
  machine: string[]
  method: string[]
  material: string[]
  measurement: string[]
  environment: string[]
}

export type RcaApprovalEntry = {
  stage: "owner" | "reviewer" | "approver"
  userId: string
  userName: string
  decision: "approved" | "rejected"
  comment?: string
  at: Date
}

export type RcaDoc = TenantDoc & {
  number: string
  title: string
  method: "5why" | "fishbone" | "8d"
  sourceTicketIds: ObjectId[]
  sourceAuditFindingId?: ObjectId | null
  branchId?: ObjectId | null
  locationId?: ObjectId | null
  categoryId?: ObjectId | null
  problemStatement: string
  whys: string[]
  fishbone: Fishbone6M
  contributingFactors: string[]
  rootCause: string
  ownerId: string
  ownerName: string
  status: "draft" | "in_review" | "approved" | "closed"
  approvals: RcaApprovalEntry[]
  attachments: string[]
}
export const rcas = defineRepository<RcaDoc>("rcas")

export type CapaActionItem = {
  id: string
  title: string
  ownerId: string
  ownerName: string
  dueDate: Date
  status: "open" | "in_progress" | "completed" | "verified"
  evidence: string[]
  completedAt?: Date | null
  remindedAt?: Date | null
}

export type CapaEffectivenessCheck = {
  dueDate: Date
  method: string
  recurred?: boolean | null
  suggestedRecurrenceCount?: number
  evidence?: string
  verifierId?: string
  verifierName?: string
  result?: "effective" | "ineffective" | null
  checkedAt?: Date | null
}

export type CapaDoc = TenantDoc & {
  number: string
  rcaId: ObjectId
  rcaNumber: string
  title: string
  type: "correction" | "corrective" | "preventive"
  actions: CapaActionItem[]
  effectivenessCheck?: CapaEffectivenessCheck | null
  status: "open" | "in_progress" | "pending_effectiveness" | "verified" | "closed"
}
export const capas = defineRepository<CapaDoc>("capas")

// ── Phase 7: Standalone Audits & Findings ───────────────────────────────────────────

export type AuditTemplateItem = {
  id: string
  clause: string
  section: string
  question: string
}

export type AuditTemplateDoc = TenantDoc & {
  name: string
  standard: string
  description?: string
  items: AuditTemplateItem[]
}
export const auditTemplates = defineRepository<AuditTemplateDoc>("auditTemplates")

export type AuditChecklistResult = {
  itemId: string
  clause: string
  section: string
  question: string
  result: "pending" | "pass" | "fail" | "na"
  note?: string
  evidence: string[]
}

export type AuditDoc = TenantDoc & {
  branchId: ObjectId
  number: string
  title: string
  templateId: ObjectId
  templateName: string
  auditorId: string
  auditorName: string
  recurrence: "once" | "weekly" | "monthly" | "quarterly"
  scheduledAt: Date
  completedAt?: Date | null
  status: "scheduled" | "in_progress" | "completed"
  checklistResults: AuditChecklistResult[]
  scorePct?: number | null
}
export const audits = defineRepository<AuditDoc>("audits", { branchField: "branchId" })

export type AuditFindingSeverity = "observation" | "minor" | "major" | "critical"
export type AuditFindingDoc = TenantDoc & {
  branchId: ObjectId
  auditId: ObjectId
  auditNumber: string
  severity: AuditFindingSeverity
  clause: string
  description: string
  evidence: string[]
  rcaId?: ObjectId | null
  status: "open" | "rca_created" | "closed"
}
export const auditFindings = defineRepository<AuditFindingDoc>("auditFindings", {
  branchField: "branchId",
})

// ── Phase 8: Notification preferences & saved reports ───────────────────────────────

export type NotificationPrefDoc = TenantDoc & {
  userId: string
  channels: { in_app: boolean; email: boolean; sms: boolean; whatsapp: boolean; push: boolean }
  events: {
    assigned: boolean
    escalated: boolean
    verification: boolean
    capaDue: boolean
    digest: boolean
  }
  digestMode: "instant" | "daily" | "weekly"
  quietHours?: { enabled: boolean; start: string; end: string; timezone: string }
}
export const notificationPreferences =
  defineRepository<NotificationPrefDoc>("notificationPreferences")

export type SavedReportDoc = TenantDoc & {
  name: string
  ownerId: string
  rangeDays: number
  branchId?: ObjectId | null
  schedule: "none" | "daily" | "weekly"
  recipients: string[]
  lastSentAt?: Date | null
}
export const savedReports = defineRepository<SavedReportDoc>("savedReports")

// ── Phase 9: Billing, API keys & webhooks ───────────────────────────────────────────

export type SubscriptionInvoice = {
  id: string
  plan: string
  amountUsd: number
  status: "paid" | "open" | "void"
  issuedAt: Date
}

export type SubscriptionDoc = TenantDoc & {
  plan: "trial" | "starter" | "growth" | "business" | "enterprise"
  status: "trialing" | "active" | "past_due" | "cancelled"
  provider: "sandbox" | "stripe" | "razorpay"
  externalId?: string | null
  currentPeriodEnd: Date
  invoices: SubscriptionInvoice[]
}
export const subscriptions = defineRepository<SubscriptionDoc>("subscriptions")

export type ApiKeyDoc = TenantDoc & {
  name: string
  prefix: string
  keyHash: string
  scopes: string[]
  createdBy: string
  lastUsedAt?: Date | null
  revokedAt?: Date | null
}
export const apiKeys = defineRepository<ApiKeyDoc>("apiKeys")

export type WebhookDoc = TenantDoc & {
  name: string
  url: string
  events: string[]
  secretHash: string
  secretPreview: string
  active: boolean
}
export const webhooks = defineRepository<WebhookDoc>("webhooks")

export type WebhookDeliveryDoc = TenantDoc & {
  webhookId: ObjectId
  event: string
  statusCode: number
  ok: boolean
  responseSnippet?: string
  deliveredAt: Date
}
export const webhookDeliveries = defineRepository<WebhookDeliveryDoc>("webhookDeliveries", {
  appendOnly: true,
})
