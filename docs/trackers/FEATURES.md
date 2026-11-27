# Feature tracker

One row per feature. **Tests** lists the IDs from [TESTS.md](TESTS.md) that prove it. A feature is
✅ only when those tests are green (see the Definition of Done in [README.md](README.md)).

## P0 · Validation & foundations

| ID     | Feature                                                                          | Status | Tests                           | Notes                                                                   |
| ------ | -------------------------------------------------------------------------------- | ------ | ------------------------------- | ----------------------------------------------------------------------- |
| F-0.1  | Design system: tokens, restricted palette, dark mode, `/design` page             | ✅     | T-E2E-1                         | Rules in CLAUDE.md; Sheet, DropdownMenu, Avatar showcased on `/design`  |
| F-0.2  | Test layers: Vitest + Testing Library (unit/component), Playwright (e2e)         | ✅     | all                             | `pnpm test`, `pnpm test:e2e`                                            |
| F-0.3  | UI kit: Button `loading`, StatCard, PanelCard, EmptyState, Icon registry         | ✅     | T-UI-1, T-UI-2, T-UI-3, T-E2E-2 |                                                                         |
| F-0.4  | UI kit: Breadcrumbs, Modal, SweetAlert (`useSweetAlert`)                         | ✅     | T-UI-4, T-UI-5, T-UI-6, T-E2E-2 | Provider scoped to `(app)`, `/super`, `/design` (lean public bundle)    |
| F-0.5  | UI kit: charts (AreaTrend, BarCompare, DonutChart) with a11y data tables         | ✅     | T-UI-7, T-E2E-2                 | Recharts via shadcn chart                                               |
| F-0.6  | API envelope: `ok`/`fail`/`withApi`, `apiFetch`/`unwrap`, `/api/health`          | ✅     | T-API-1, T-API-2, T-E2E-3       | `src/lib/api`                                                           |
| F-0.7  | CI: GitHub Actions running format, lint, typecheck, unit, integration, e2e       | ✅     | all                             | `.github/workflows/ci.yml`; verified green locally via `pnpm check`     |
| F-0.8  | Husky + lint-staged (pre-commit: eslint + prettier; pre-push: typecheck + tests) | ✅     |                                 |                                                                         |
| F-0.9  | Typed env with Zod (`src/server/env.ts`), `.env.example`                         | ✅     | T-ENV-1                         | Lazy, covers Mongo, Auth, R2/S3, Resend, Twilio, Redis, Stripe/Razorpay |
| F-0.10 | MongoDB, Redis, R2/S3 storage, observability adapters                            | ✅     | T-UP-1, T-ENV-1                 | Local dev zero-config + production S3/R2 SigV4, Resend, Twilio, Redis   |
| F-0.11 | Tenant-scoped data-access layer (`TenantContext`, repositories)                  | ✅     | T-DB-1, T-ISO-1                 | `$and`-scoped; branch scope; append-only mode; ESLint bans raw client   |
| F-0.12 | Tenant isolation test harness                                                    | ✅     | T-ISO-1                         | Fails if any registered repository lacks a factory                      |
| F-0.13 | Interactive screens for all 6 core workflows                                     | ✅     | T-E2E-6, T-E2E-7, T-E2E-8       | All 6 core screens live in production code + collapsible app shell      |

## P1 · Tenancy, auth, RBAC, hierarchy

| ID    | Feature                                                                      | Status | Tests                                | Notes                                                                              |
| ----- | ---------------------------------------------------------------------------- | ------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| F-1.1 | Tenant onboarding: sign-up → create org → first branch                       | ✅     | T-ORG-1, T-E2E-4                     | One transaction; unique slug; trial limits                                         |
| F-1.2 | Auth: email + password, sessions, password reset                             | ✅     | T-E2E-4, T-UI-10                     | Better Auth + Resend email delivery (console fallback in dev)                      |
| F-1.3 | Users: invite links, accept, edit access, deactivate                         | ✅     | T-MEM-1, T-E2E-4                     | Supports both system and custom roles                                              |
| F-1.4 | Roles & permissions, enforced in proxy, services and UI                      | ✅     | T-RBAC-1, T-ROLE-1, T-MEM-1, T-E2E-4 | 8 system roles + full custom-role editor UI with no-escalation enforcement         |
| F-1.5 | Location hierarchy: building › floor › department › location (tree UI)       | ✅     | T-LOC-1, T-LOC-2, T-LIB-9, T-E2E-4   | Create, rename, move, archive; collapsible site map with QR coverage & setup guide |
| F-1.6 | Super-admin console: tenants, suspend/reactivate, plan limits, impersonation | ✅     | T-ORG-1, T-E2E-4                     | Plan/limits dialog, platform health, HMAC-signed audited impersonation             |
| F-1.7 | Append-only, hash-chained audit log wired into every mutation                | ✅     | T-AUD-1, T-E2E-4                     | Gap-free under concurrency; verify on the audit page                               |
| F-1.8 | Users: add with an admin-set password; per-member sidebar menu access        | ✅     | T-MENU-1, T-MEM-1, T-E2E-4           | "Add user" dialog (password or invite); hidden menus are also blocked by URL       |

## P2 · QR & public feedback intake

| ID    | Feature                                                                          | Status | Tests                             | Notes                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------- | ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-2.1 | QR generation per location, single + bulk, SVG/PNG                               | ✅     | T-QR-2, T-LIB-4, T-QRI-1, T-E2E-6 | 10-char look-alike-free codes, one active per location                                                                                                       |
| F-2.2 | Printable labelled QR sheet & branch ZIP; revoke/regenerate; scan counts         | ✅     | T-QR-2, T-E2E-6                   | Browser print → PDF + `/api/branches/[branchId]/qr-zip` PNG bundle                                                                                           |
| F-2.3 | Public form `/f/[code]`: category, rating, photos, description, urgency, contact | ✅     | T-INT-1, T-UP-1, T-UI-8, T-E2E-6  | Client compression + S3/R2 or local storage + EXIF/GPS stripping. Mobile-first redesign: indigo hero, step cards, category icons (T-LIB-10), sticky send bar |
| F-2.4 | Anti-abuse: rate limits, repeat-report merging, Turnstile                        | ✅     | T-RL-1, T-INT-1, T-TS-1, T-LOAD-1 | Turnstile switches on when keys are set                                                                                                                      |
| F-2.5 | Ticket numbering, confirmation, private tracking link `/t/[token]`, email/SMS    | ✅     | T-INT-1, T-E2E-6, T-E2E-8         | Token hashed at rest; Resend email & Twilio SMS reporter confirmations                                                                                       |
| F-2.6 | Feedback categories per industry, seeded at onboarding + editable in Settings    | ✅     | T-LIB-5, T-QR-2                   | Configurable RCA & evidence requirements in `/settings?tab=categories`                                                                                       |
| F-2.7 | i18n for the public form & tracking page (with RTL)                              | ✅     | T-I18N-1, T-E2E-8                 | English, Hindi, Spanish, French, Arabic (`dir="rtl"`), auto-detection                                                                                        |

## P3 · Ticketing core & assignment

| ID    | Feature                                                 | Status | Tests            | Notes                                                                  |
| ----- | ------------------------------------------------------- | ------ | ---------------- | ---------------------------------------------------------------------- |
| F-3.1 | Ticket list: filters, search, saved views, bulk actions | ✅     | T-TKT-1, T-E2E-8 | Search, multi-filter, saved views CRUD, bulk assign, manual new        |
| F-3.2 | Ticket detail page                                      | ✅     | T-TKT-1, T-E2E-8 | Status bar, action toolbar, remarks, photos, SLA, tags, timeline       |
| F-3.3 | Kanban view                                             | ✅     | T-E2E-8          | Table / Kanban toggle on `/tickets`                                    |
| F-3.4 | Ticket state machine `transitionTicket()`               | ✅     | T-SM-1, T-TKT-1  | Pure function unit-testing every allowed & rejected transition         |
| F-3.5 | Remarks (internal/public) and image attachments         | ✅     | T-TKT-1, T-E2E-8 | Public remarks surface on `/t/[token]`; internal stay staff-only       |
| F-3.6 | Assignment rules engine and reassignment with a reason  | ✅     | T-TKT-1          | Priority rules, fixed/round-robin/least-loaded, reason enforced        |
| F-3.7 | Activity timeline and ticket history PDF                | ✅     | T-TKT-1, T-E2E-8 | Immutable timeline with diffs + `/print/tickets/[ticketId]`            |
| F-3.8 | "My Work" staff view; in-app and email notifications    | ✅     | T-TKT-1, T-E2E-8 | `/my-work` one-tap actions, bell popover, SSE stream, `/notifications` |

## P4 · SLA & escalation engine

| ID    | Feature                                                                            | Status | Tests            | Notes                                                             |
| ----- | ---------------------------------------------------------------------------------- | ------ | ---------------- | ----------------------------------------------------------------- |
| F-4.1 | SLA policy builder (levels, accept vs resolve, business hours, holidays, timezone) | ✅     | T-SLA-2, T-E2E-8 | Visual L1 → L2 → L3 ladder in `/settings?tab=sla`                 |
| F-4.2 | Due-date calculator honouring business hours, holidays and timezone                | ✅     | T-SLA-1          | Pure Intl-based IANA timezone calculator                          |
| F-4.3 | Worker service: periodic sweeper + Redis option + idempotent escalation            | ✅     | T-SLA-2          | `worker/index.mts` (`pnpm worker`) + `/api/cron/sla-sweep`        |
| F-4.4 | Escalation actions (notify, transfer, both) and hold/pause                         | ✅     | T-SLA-2          | Pauses clock on `on_hold`, shifts deadlines on resume             |
| F-4.5 | Escalation notifications: email, SMS/WhatsApp, in-app + escalation history         | ✅     | T-SLA-2          | Logged in `escalationEvents` and displayed in `/settings`         |
| F-4.6 | SLA countdown UI, at-risk and breached chips, compliance metrics                   | ✅     | T-SLA-1, T-E2E-8 | `<SlaChip />` on detail/verification/tickets + compliance stats   |
| F-4.7 | Failure tests: concurrent sweeper / worker restart recovery                        | ✅     | T-SLA-2          | Atomic conditional `currentLevel` guard prevents duplicate events |

## P5 · Verification & closure

| ID    | Feature                                                                 | Status | Tests            | Notes                                                           |
| ----- | ----------------------------------------------------------------------- | ------ | ---------------- | --------------------------------------------------------------- |
| F-5.1 | Submit for verification, with resolution evidence required per category | ✅     | T-VER-1, T-SM-1  | Per-category `requiresResolutionEvidence` flag                  |
| F-5.2 | Verifier queue: approve & close, or reopen with instructions            | ✅     | T-VER-1, T-E2E-8 | `/verifications` queue, reopen counter + SLA restart            |
| F-5.3 | Requester feedback after closure                                        | ✅     | T-VER-1, T-E2E-8 | Post-closure resolved/rating/comment form on `/t/[token]`       |
| F-5.4 | Auto-close after N days of no response                                  | ✅     | T-VER-1          | Configurable in `/settings?tab=automation` + `sweepAutoClose()` |

## P6 · RCA & CAPA

| ID    | Feature                                                    | Status | Tests            | Notes                                                              |
| ----- | ---------------------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------ |
| F-6.1 | RCA/CAPA data model, numbering, list and detail pages      | ✅     | T-RCA-1, T-E2E-8 | `RCA-YYYY-NNNNNN` & `CAPA-YYYY-NNNNNN`, `/rca` & `/rca/[rcaId]`    |
| F-6.2 | 5 Whys and Fishbone (6M) builder                           | ✅     | T-RCA-1          | Interactive 5 Whys + 6M Ishikawa categories & contributing factors |
| F-6.3 | CAPA actions: owners, due dates, evidence, status tracking | ✅     | T-RCA-1          | Correction, corrective & preventive actions                        |
| F-6.4 | Effectiveness check and automatic recurrence detection     | ✅     | T-RCA-1          | Queries repeat tickets at same location/category automatically     |
| F-6.5 | Trigger rules and a "Convert ticket to RCA" button         | ✅     | T-RCA-1          | Category, severity, L3 breach & repeat-30d recommendation banner   |
| F-6.6 | Approval workflow with a timestamped signature log         | ✅     | T-RCA-1          | Owner → Reviewer → Approver stages (does not claim 21 CFR Part 11) |
| F-6.7 | RCA/CAPA PDF report                                        | ✅     | T-RCA-1          | Printable report at `/print/rca/[rcaId]`                           |

## P7 · Audit module

| ID    | Feature                                         | Status | Tests            | Notes                                                              |
| ----- | ----------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------ |
| F-7.1 | Checklist template builder and audit scheduling | ✅     | T-AUD-2, T-E2E-8 | Templates with clauses/sections + one-off/weekly/monthly/quarterly |
| F-7.2 | Mobile audit execution (PWA, offline drafts)    | ✅     | T-AUD-2          | `manifest.ts` + `public/sw.js` + `localStorage` draft auto-save    |
| F-7.3 | Findings → auto-NCR → RCA/CAPA                  | ✅     | T-AUD-2          | Standalone Audit → Finding → RCA/CAPA with no QR required          |
| F-7.4 | Audit reports and read-only auditor portal      | ✅     | T-AUD-2          | Printable `/print/audits/[auditId]` + auditor read-only banner     |

## P8 · Analytics, reporting, notifications

| ID    | Feature                                                                                    | Status | Tests                         | Notes                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------ | ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F-8.1 | Dashboards: SLA, MTTR, volume, ratings, heatmaps, CAPA aging                               | ✅     | T-REP-1, T-E2E-8              | `/reports` using AreaTrend, BarCompare, heatmap & workload tables                                                            |
| F-8.2 | Scheduled email digests; CSV/Excel export                                                  | ✅     | T-REP-1                       | `/api/reports/export` RFC-4180 CSV + saved scheduled digests                                                                 |
| F-8.3 | Notification preferences, quiet hours, digest mode                                         | ✅     | T-REP-1                       | `/settings/notifications` per-channel, event, quiet hours & cadence                                                          |
| F-8.4 | Saved reports and branch comparison                                                        | ✅     | T-REP-1                       | Multi-branch side-by-side comparison & saved report views                                                                    |
| F-8.5 | Branded Resend emails: ticket raised/auto-assigned/assigned/closed, account access changes | ✅     | T-MAIL-1, T-MAIL-2, T-NOTIF-1 | HTML+text template; unassigned tickets go to branch assigners; welcome, role change, deactivate emails; Resend errors logged |

## P9 · Billing, plans, white-label, integrations

| ID    | Feature                                                        | Status | Tests            | Notes                                                                           |
| ----- | -------------------------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------------- |
| F-9.1 | Plans with server-enforced limits and usage metering           | ✅     | T-PLT-1, T-E2E-8 | Branches, locations, users & monthly tickets metered on `/settings/billing`     |
| F-9.2 | Billing: Stripe / Razorpay webhook, trials, invoices, sandbox  | ✅     | T-PLT-1, T-E2E-8 | `/api/webhooks/billing` HMAC verification + invoice history                     |
| F-9.3 | White-label: logo, colours, custom domain, sender domain       | ✅     | T-E2E-8          | `/settings/branding`, applied dynamically on `/f/[code]` & `/t/[token]`         |
| F-9.4 | Webhooks, public REST API, API keys, Slack/Teams/WhatsApp, SSO | ✅     | T-PLT-1, T-E2E-8 | `/api/v1/tickets`, `/api/v1/locations`, HMAC webhooks, `/settings/integrations` |
| F-9.5 | Data export and tenant deletion (GDPR/DPDP)                    | ✅     | T-PLT-1          | `/api/tenant/export`, PII anonymisation & deletion on `/settings/privacy`       |

## P10 · Hardening & launch

| ID     | Feature                                                   | Status | Tests                     | Notes                                                                              |
| ------ | --------------------------------------------------------- | ------ | ------------------------- | ---------------------------------------------------------------------------------- |
| F-10.1 | Security review (OWASP ASVS), HTTP security headers       | ✅     | T-ISO-1                   | `docs/SECURITY.md` + security headers in `next.config.ts`                          |
| F-10.2 | Backups and restore drill                                 | ✅     | T-BK-1                    | `scripts/backup-restore.mts` + automated EJSON drop/restore/verify                 |
| F-10.3 | Load test of the public form                              | ✅     | T-LOAD-1                  | `scripts/load-test.mts` + concurrent burst & rate-limit test                       |
| F-10.4 | Observability: `/api/health` metrics + super-admin health | ✅     | T-E2E-3                   | DB ping latency, open/breached SLA counters & worker heartbeat                     |
| F-10.5 | Docs, help centre, 1-click demo workspace, legal pages    | ✅     | T-AUD-3, T-E2E-4, T-E2E-7 | `/help`, `/terms`, `/privacy`, `/dpa`, idempotent 1-click Demo Login on `/sign-in` |
