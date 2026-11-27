/**
 * Permission strings (phase.md §7). Roles are bundles of these; code checks permissions,
 * never role names, so custom roles work everywhere.
 */
export const PERMISSIONS = [
  "tenant:manage",
  "billing:manage",
  "branch:read",
  "branch:manage",
  "location:read",
  "location:manage",
  "qr:read",
  "qr:create",
  "qr:revoke",
  "user:read",
  "user:invite",
  "user:manage",
  "role:manage",
  "ticket:read",
  "ticket:create",
  "ticket:assign",
  "ticket:accept",
  "ticket:work",
  "ticket:escalate.receive",
  "ticket:verify",
  "ticket:close",
  "rca:read",
  "rca:manage",
  "rca:approve",
  "capa:read",
  "capa:manage",
  "capa:verify",
  "audit:read",
  "audit:run",
  "log:read",
  "report:read",
  "report:export",
  "settings:sla",
  "settings:manage",
] as const

export type Permission = (typeof PERMISSIONS)[number]
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export type RoleScope = "tenant" | "branch"
export type RoleDefinition = {
  label: string
  description: string
  /** `tenant` roles see every branch; `branch` roles only the member's branchIds. */
  scope: RoleScope
  permissions: readonly Permission[]
}

const TICKET_WORK: Permission[] = [
  "ticket:read",
  "ticket:accept",
  "ticket:work",
  "location:read",
  "branch:read",
  "qr:read",
]

export const SYSTEM_ROLES = {
  org_admin: {
    label: "Org admin",
    description: "Everything in the organisation, including billing and branches.",
    scope: "tenant",
    permissions: ALL_PERMISSIONS,
  },
  branch_admin: {
    label: "Branch admin",
    description: "Runs their branches: users, QR codes, tickets, verification.",
    scope: "branch",
    permissions: [
      "branch:read",
      "location:read",
      "location:manage",
      "qr:read",
      "qr:create",
      "qr:revoke",
      "user:read",
      "user:invite",
      "user:manage",
      // Everything L1–L3 do, so a branch admin can invite and stand in for them.
      "ticket:read",
      "ticket:create",
      "ticket:assign",
      "ticket:accept",
      "ticket:work",
      "ticket:escalate.receive",
      "ticket:verify",
      "ticket:close",
      "rca:read",
      "rca:manage",
      "capa:read",
      "capa:manage",
      "report:read",
      "report:export",
      "log:read",
    ],
  },
  dept_manager: {
    label: "Department manager",
    description: "Tickets and staff of their department.",
    scope: "branch",
    permissions: [
      ...TICKET_WORK,
      "ticket:create",
      "ticket:assign",
      "ticket:escalate.receive",
      "user:read",
      "rca:read",
      "rca:manage",
      "capa:read",
      "capa:manage",
      "report:read",
    ],
  },
  l3_manager: {
    label: "L3 manager",
    description: "Final escalation level.",
    scope: "branch",
    permissions: [
      ...TICKET_WORK,
      "ticket:assign",
      "ticket:escalate.receive",
      "rca:read",
      "capa:read",
    ],
  },
  l2_supervisor: {
    label: "L2 supervisor",
    description: "Receives escalations from L1 staff.",
    scope: "branch",
    permissions: [...TICKET_WORK, "ticket:assign", "ticket:escalate.receive"],
  },
  l1_staff: {
    label: "L1 staff",
    description: "Accepts and works on tickets.",
    scope: "branch",
    permissions: TICKET_WORK,
  },
  verifier: {
    label: "Verifier",
    description: "Verifies resolved tickets and CAPA effectiveness.",
    scope: "tenant",
    permissions: [
      "ticket:read",
      "ticket:verify",
      "ticket:close",
      "rca:read",
      "capa:read",
      "capa:verify",
      "branch:read",
      "location:read",
    ],
  },
  auditor: {
    label: "Auditor",
    description: "Read-only logs, RCA/CAPA and the audit module.",
    scope: "tenant",
    permissions: [
      "log:read",
      "rca:read",
      "capa:read",
      "audit:read",
      "audit:run",
      "ticket:read",
      "report:read",
      "branch:read",
      "location:read",
    ],
  },
} as const satisfies Record<string, RoleDefinition>

export type SystemRoleKey = keyof typeof SYSTEM_ROLES

export function isSystemRole(key: string): key is SystemRoleKey {
  return Object.hasOwn(SYSTEM_ROLES, key)
}
