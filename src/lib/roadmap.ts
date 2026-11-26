/**
 * Public roadmap shown on the homepage. Keep it in step with docs/trackers/PHASES.md: when a
 * phase changes status there, change it here in the same commit.
 */
export type PhaseStatus = "done" | "in-progress" | "next" | "planned"

export const ROADMAP: { id: string; title: string; summary: string; status: PhaseStatus }[] = [
  {
    id: "P0",
    title: "Foundations",
    summary: "Design system, test suites, tenant-isolated data layer, CI.",
    status: "in-progress",
  },
  {
    id: "P1",
    title: "Organisations, people & locations",
    summary: "Sign-up, roles and permissions, branches, location tree, audit log.",
    status: "in-progress",
  },
  {
    id: "P2",
    title: "QR & public feedback",
    summary: "QR code per location, a no-login mobile form, ticket and tracking link.",
    status: "in-progress",
  },
  {
    id: "P3",
    title: "Ticketing & assignment",
    summary: "Ticket board, state machine, auto-assignment, timeline, My Work.",
    status: "next",
  },
  {
    id: "P4",
    title: "SLA & escalation engine",
    summary: "Business-hours SLAs that escalate L1 → L2 → L3 automatically.",
    status: "planned",
  },
  {
    id: "P5",
    title: "Verification & closure",
    summary: "Verifier queue, reopen, requester feedback. Pilot beta.",
    status: "planned",
  },
  {
    id: "P6",
    title: "RCA & CAPA",
    summary: "5 Whys, fishbone, corrective and preventive actions, effectiveness checks.",
    status: "planned",
  },
  {
    id: "P7",
    title: "Audits",
    summary: "Checklists, mobile audits, findings that flow into CAPA.",
    status: "planned",
  },
  {
    id: "P8",
    title: "Analytics & reports",
    summary: "SLA compliance, MTTR, heatmaps, scheduled reports.",
    status: "planned",
  },
  {
    id: "P9",
    title: "Billing & integrations",
    summary: "Plans, white-label, API, WhatsApp, Slack, SSO.",
    status: "planned",
  },
  {
    id: "P10",
    title: "Hardening & launch",
    summary: "Security review, load tests, backups, public launch.",
    status: "planned",
  },
]
