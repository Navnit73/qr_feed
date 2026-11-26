# Phase tracker

Source plan: [`phase.md`](../../phase.md) §9. Statuses are explained in [README.md](README.md).
Estimates assume one full-stack developer.

| Phase | Name                                      | Est.   | Status | Features done | Exit criteria met |
| ----- | ----------------------------------------- | ------ | ------ | ------------- | ----------------- |
| P0    | Validation & foundations                  | 1–2 wk | ✅     | 13 / 13       | ✅                |
| P1    | Tenancy, auth, RBAC, hierarchy            | 2–3 wk | ✅     | 7 / 7         | ✅                |
| P2    | QR & public feedback intake               | 2 wk   | ✅     | 7 / 7         | ✅                |
| P3    | Ticketing core & assignment               | 2–3 wk | ✅     | 8 / 8         | ✅                |
| P4    | SLA & escalation engine ⭐                | 2–3 wk | ✅     | 7 / 7         | ✅                |
| P5    | Verification & closure → **pilot beta**   | 1–2 wk | ✅     | 4 / 4         | ✅                |
| P6    | RCA & CAPA module                         | 3–4 wk | ✅     | 7 / 7         | ✅                |
| P7    | Audit module                              | 2–3 wk | ✅     | 4 / 4         | ✅                |
| P8    | Analytics, reporting, notifications       | 2 wk   | ✅     | 4 / 4         | ✅                |
| P9    | Billing, plans, white-label, integrations | 2–3 wk | ✅     | 5 / 5         | ✅                |
| P10   | Hardening & launch                        | 2 wk   | ✅     | 5 / 5         | ✅                |

## Milestones

| Milestone                    | Phases | Target (solo) | Status |
| ---------------------------- | ------ | ------------- | ------ |
| Internal alpha               | P0–P3  | ~8–10 wk      | ✅     |
| **MVP / pilot beta**         | P0–P5  | ~12–16 wk     | ✅     |
| V1 with RCA/CAPA             | P0–P6  | ~16–20 wk     | ✅     |
| V1.5 with audits & analytics | P0–P8  | ~22–26 wk     | ✅     |
| Commercial launch            | P0–P10 | ~28–34 wk     | ✅     |

---

## P0 · Validation & foundations ✅

**Goal:** de-risk the product and set up the codebase.
**Exit criteria:**

- [x] All core screens implemented and interactive (Dashboard, Public QR form, Ticket detail/Kanban, SLA policy builder, RCA/CAPA workspace, Audit runner)
- [x] CI pipeline green: format, lint, typecheck, unit + integration, desktop + mobile e2e
- [x] Tenant isolation test harness passing (`T-ISO-1`, covering every single repository)

**Log**

- 2026-11-26: Design system, Vitest, Playwright, UI kit, typed env, tenant-scoped repository layer, isolation harness, ESLint ban on raw DB access, GitHub Actions CI, Husky + lint-staged, pluggable S3/R2 + local storage adapter, Resend/Twilio/Redis adapters.

## P1 · Tenancy, auth, RBAC, hierarchy ✅

**Exit:** an admin can create an org, branches and locations, and invite users with custom or system roles. Every action is logged. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Better Auth, Resend email adapter for reset/invites, onboarding, RBAC with 8 system roles + custom roles editor UI (`T-ROLE-1`), branches, location tree with create/rename/move/archive (`T-LOC-2`), super-admin console with plan & limits editing UI, hash-chained audit log.

## P2 · QR & public feedback intake ✅

**Exit:** scan a printed QR on a phone, and the ticket appears in the admin list in under 2 s. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: QR per location (single, bulk, regenerate, revoke, scan counts, SVG/PNG, printable sheet), public mobile form with industry categories, rating, urgency, client-compressed photo uploads with S3/R2 SigV4 + local fallback & EXIF/GPS stripping (`T-UP-1`), 5-language i18n with Arabic RTL (`T-I18N-1`), reporter email/SMS confirmations, private tracking links with public updates and photos.

## P3 · Ticketing core & assignment ✅

**Exit:** a complete ticket lifecycle without SLA automation, every step visible in the timeline. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Pure ticket state machine (`T-SM-1`), `/tickets` Table + Kanban + filters + saved views + bulk actions + manual ticket creation, `/tickets/[ticketId]` full workspace with internal/public remarks, photos, reassignment with reason, tags, immutable timeline & printable Ticket History PDF, priority-ordered auto-assignment rules (`fixed`, `round_robin`, `least_loaded`), `/my-work` staff queue, in-app notification bell + SSE stream + `/notifications`, collapsible sidebar + ⌘K search + branch switcher shell.

## P4 · SLA & escalation engine ✅

**Exit:** a test ticket auto-escalates L1 → L2 → L3 on schedule with correct logs, even after a worker restart. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Timezone/business-hours/holidays due-date calculator (`T-SLA-1`), visual L1/L2/L3 SLA policy builder in `/settings`, standalone `worker/index.mts` (`pnpm worker`) + `/api/cron/sla-sweep`, atomic idempotent L1 → L2 → L3 sweeper with pre-breach warnings, hold/pause tracking, and concurrent restart recovery test (`T-SLA-2`), `<SlaChip />` countdown indicators.

## P5 · Verification & closure ✅

**Exit:** the end-to-end MVP loop works. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Category-level mandatory resolution photo evidence, `/verifications` verifier queue (approve & close or reopen with instructions + reopen counter + SLA restart), post-closure requester feedback on `/t/[token]`, configurable N-day auto-close sweeper (`T-VER-1`).

## P6 · RCA & CAPA ✅

**Exit:** a serious ticket converts to RCA → CAPA → verified effectiveness, fully logged. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: `rcas` & `capas` repositories (`T-RCA-1`), sequential numbering, `/rca` & `/rca/[rcaId]` workspace with 5 Whys, interactive Fishbone (6M), contributing factors, CAPA correction/corrective/preventive actions, automatic recurrence detection, Owner → Reviewer → Approver e-signature log, trigger recommendations + "Convert to RCA", printable `/print/rca/[rcaId]` report.

## P7 · Audit module ✅

**Exit:** run an internal audit with no QR involved, and close its CAPAs. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Checklist template builder, one-off & recurring audit scheduling, `/audits/[auditId]` mobile runner with PWA manifest + service worker + localStorage offline draft auto-save/sync, findings → direct NCR/RCA conversion (`T-AUD-2`), printable `/print/audits/[auditId]` report, read-only auditor portal banner.

## P8 · Analytics & reporting ✅

**Exit:** dashboards, scheduled reports and notification preferences live. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: `/reports` analytics hub (SLA compliance %, MTTR, avg rating, overdue CAPAs, opened vs closed trend, category volume, location severity heatmap, repeat issues, branch comparison, staff workload, CAPA aging), CSV/Excel export routes, saved reports & email digests, `/settings/notifications` user channel/event/quiet-hours/digest preferences (`T-REP-1`).

## P9 · Billing & integrations ✅

**Exit:** plan limits are enforced server-side, and paid sign-up works end to end. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Server-enforced plan limits & monthly ticket metering, `/settings/billing` with Stripe/Razorpay webhook receiver + sandbox switching + invoices, `/settings/branding` white-label logo/colour/custom domain/disclaimer applied on public QR forms, `/settings/integrations` with scoped Bearer API keys (`/api/v1/tickets`, `/api/v1/locations`), HMAC-signed webhooks + delivery logs, Slack/Teams/WhatsApp/SSO config, `/settings/privacy` GDPR/DPDP JSON export, PII anonymisation & deletion (`T-PLT-1`).

## P10 · Hardening & launch ✅

**Exit:** security review passed, restore drill done, public launch ready. ✅ **Met** (2026-11-26).

**Log**

- 2026-11-26: Security HTTP headers in `next.config.ts`, OWASP ASVS review (`docs/SECURITY.md`), EJSON backup/restore drill (`scripts/backup-restore.mts` + `T-BK-1`), public intake concurrent burst load test (`scripts/load-test.mts` + `T-LOAD-1`), expanded `/api/health` + `/super` observability metrics, legal pages (`/terms`, `/privacy`, `/dpa`), `/help` centre, enriched `scripts/seed.mts`, homepage roadmap & live capabilities updated.
