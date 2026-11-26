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
    status: "done",
  },
  {
    id: "P1",
    title: "Organisations, people & locations",
    summary: "Sign-up, roles and permissions, branches, location tree, audit log.",
    status: "done",
  },
  {
    id: "P2",
    title: "QR & public feedback",
    summary: "QR code per location, multi-language mobile form, photos, tracking link.",
    status: "done",
  },
  {
    id: "P3",
    title: "Ticketing & assignment",
    summary: "Ticket board, Kanban, state machine, auto-assignment, timeline, My Work.",
    status: "done",
  },
  {
    id: "P4",
    title: "SLA & escalation engine",
    summary: "Business-hours SLAs that escalate L1 → L2 → L3 automatically.",
    status: "done",
  },
  {
    id: "P5",
    title: "Verification & closure",
    summary: "Verifier queue, reopen, requester feedback, auto-close.",
    status: "done",
  },
  {
    id: "P6",
    title: "RCA & CAPA",
    summary: "5 Whys, fishbone, corrective and preventive actions, effectiveness checks.",
    status: "done",
  },
  {
    id: "P7",
    title: "Audits",
    summary: "Checklists, offline mobile audits, findings that flow into CAPA.",
    status: "done",
  },
  {
    id: "P8",
    title: "Analytics & reports",
    summary: "SLA compliance, MTTR, heatmaps, CSV exports, scheduled digests.",
    status: "done",
  },
  {
    id: "P9",
    title: "Billing & integrations",
    summary: "Plans, white-label, REST API, webhooks, Slack, Teams, SSO, GDPR.",
    status: "done",
  },
  {
    id: "P10",
    title: "Hardening & launch",
    summary: "Security headers, load tests, backup/restore drill, help centre & legal.",
    status: "done",
  },
]
