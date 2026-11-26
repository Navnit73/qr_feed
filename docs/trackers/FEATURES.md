# Feature tracker

One row per feature. **Tests** lists the IDs from [TESTS.md](TESTS.md) that prove it. A feature is
✅ only when those tests are green (see the Definition of Done in [README.md](README.md)).

## P0 · Validation & foundations

| ID     | Feature                                                                          | Status | Tests                           | Notes                                                                 |
| ------ | -------------------------------------------------------------------------------- | ------ | ------------------------------- | --------------------------------------------------------------------- |
| F-0.1  | Design system: tokens, restricted palette, dark mode, `/design` page             | ✅     | T-E2E-1                         | Rules in CLAUDE.md                                                    |
| F-0.2  | Test layers: Vitest + Testing Library (unit/component), Playwright (e2e)         | ✅     | all                             | `pnpm test`, `pnpm test:e2e`                                          |
| F-0.3  | UI kit: Button `loading`, StatCard, PanelCard, EmptyState, Icon registry         | ✅     | T-UI-1, T-UI-2, T-UI-3, T-E2E-2 |                                                                       |
| F-0.4  | UI kit: Breadcrumbs, Modal, SweetAlert (`useSweetAlert`)                         | ✅     | T-UI-4, T-UI-5, T-UI-6, T-E2E-2 | Provider mounted in root layout                                       |
| F-0.5  | UI kit: charts (AreaTrend, BarCompare, DonutChart) with a11y data tables         | ✅     | T-UI-7, T-E2E-2                 | Recharts via shadcn chart                                             |
| F-0.6  | API envelope: `ok`/`fail`/`withApi`, `apiFetch`/`unwrap`, `/api/health`          | ✅     | T-API-1, T-API-2, T-E2E-3       | `src/lib/api`                                                         |
| F-0.7  | CI: GitHub Actions running format, lint, typecheck, unit, integration, e2e       | 🟨     | all                             | `.github/workflows/ci.yml`; first run happens on push                 |
| F-0.8  | Husky + lint-staged (pre-commit: eslint + prettier; pre-push: typecheck + tests) | ✅     |                                 |                                                                       |
| F-0.9  | Typed env with Zod (`src/server/env.ts`), `.env.example`                         | ✅     | T-ENV-1                         | Lazy, so `next build` needs no secrets                                |
| F-0.10 | MongoDB Atlas (replica set), Redis, R2 bucket, Sentry, staging                   | 🟨     |                                 | Local: `pnpm db:dev` (no Docker). Cloud accounts needed               |
| F-0.11 | Tenant-scoped data-access layer (`TenantContext`, repositories)                  | ✅     | T-DB-1, T-ISO-1                 | `$and`-scoped; branch scope; append-only mode; ESLint bans raw client |
| F-0.12 | Tenant isolation test harness                                                    | ✅     | T-ISO-1                         | Fails if any registered repository lacks a factory                    |
| F-0.13 | Wireframes / clickable prototype for 6 core screens                              | ⬜     |                                 | Public form, ticket detail, SLA builder still to sketch               |

## P1 · Tenancy, auth, RBAC, hierarchy

| ID    | Feature                                                                | Status | Tests                      | Notes                                                                                      |
| ----- | ---------------------------------------------------------------------- | ------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| F-1.1 | Tenant onboarding: sign-up → create org → first branch                 | ✅     | T-ORG-1, T-E2E-4           | One transaction; unique slug; trial limits                                                 |
| F-1.2 | Auth: email + password, sessions, password reset                       | 🟨     | T-E2E-4, T-UI-10           | Better Auth. Reset email only logged until a provider lands (P3). Google SSO and 2FA later |
| F-1.3 | Users: invite links, accept, edit access, deactivate                   | ✅     | T-MEM-1, T-E2E-4           | Admin copies the link; emailing it lands with notifications                                |
| F-1.4 | Roles & permissions, enforced in proxy, services and UI                | 🟨     | T-RBAC-1, T-MEM-1, T-E2E-4 | 8 system roles, custom-role resolution, no escalation. Custom-role editor UI to do         |
| F-1.5 | Location hierarchy: building › floor › department › location (tree UI) | ✅     | T-LOC-1, T-LOC-2, T-E2E-4  | Create, rename (paths rewritten), archive. Move deferred to P2                             |
| F-1.6 | Super-admin console: tenants, suspend/reactivate, plan limits          | 🟨     | T-ORG-1, T-E2E-4           | Limits enforced and settable in code; editing UI to do                                     |
| F-1.7 | Append-only, hash-chained audit log wired into every mutation          | ✅     | T-AUD-1, T-E2E-4           | Gap-free under concurrency; verify on the audit page                                       |

## P2 · QR & public feedback intake

| ID    | Feature                                                                           | Status | Tests                             | Notes                                                                    |
| ----- | --------------------------------------------------------------------------------- | ------ | --------------------------------- | ------------------------------------------------------------------------ |
| F-2.1 | QR generation per location, single + bulk, SVG/PNG                                | ✅     | T-QR-2, T-LIB-4, T-QRI-1, T-E2E-6 | 10-char look-alike-free codes, one active per location                   |
| F-2.2 | Printable labelled QR sheet; revoke/regenerate; scan counts                       | ✅     | T-QR-2, T-E2E-6                   | Browser print → PDF; no PDF library                                      |
| F-2.3 | Public form `/f/[code]`: category, rating, description, urgency, contact, consent | 🟨     | T-INT-1, T-UI-8, T-E2E-6          | **Photos pending** a storage bucket (F-0.10)                             |
| F-2.4 | Anti-abuse: rate limits, repeat-report merging, Turnstile                         | ✅     | T-RL-1, T-INT-1, T-TS-1           | Turnstile switches on when keys are set                                  |
| F-2.5 | Ticket numbering, confirmation, private tracking link `/t/[token]`, admin inbox   | ✅     | T-INT-1, T-E2E-6                  | Token hashed at rest. Email/SMS confirmation lands with P3 notifications |
| F-2.6 | Feedback categories per industry, seeded at onboarding                            | ✅     | T-LIB-5, T-QR-2                   | Editing UI in P3                                                         |
| F-2.7 | i18n for the public form                                                          | ⬜     |                                   |                                                                          |

## P3 · Ticketing core & assignment

| ID    | Feature                                                 | Status | Tests | Notes                               |
| ----- | ------------------------------------------------------- | ------ | ----- | ----------------------------------- |
| F-3.1 | Ticket list: filters, search, saved views, bulk actions | ⬜     |       |                                     |
| F-3.2 | Ticket detail page                                      | ⬜     |       |                                     |
| F-3.3 | Kanban view                                             | ⬜     |       |                                     |
| F-3.4 | Ticket state machine `transition(ticket, event, actor)` | ⬜     |       | Pure function, unit-test every edge |
| F-3.5 | Remarks (internal/public) and image attachments         | ⬜     |       |                                     |
| F-3.6 | Assignment rules engine and reassignment with a reason  | ⬜     |       |                                     |
| F-3.7 | Activity timeline and ticket history PDF                | ⬜     |       |                                     |
| F-3.8 | "My Work" staff view; in-app and email notifications    | ⬜     |       |                                     |

## P4 · SLA & escalation engine

| ID    | Feature                                                                            | Status | Tests | Notes         |
| ----- | ---------------------------------------------------------------------------------- | ------ | ----- | ------------- |
| F-4.1 | SLA policy builder (levels, accept vs resolve, business hours, holidays, timezone) | ⬜     |       |               |
| F-4.2 | Due-date calculator honouring business hours and timezone                          | ⬜     |       | Pure function |
| F-4.3 | BullMQ worker: delayed jobs, sweeper, idempotent escalation                        | ⬜     |       |               |
| F-4.4 | Escalation actions (notify, transfer, both) and hold/pause                         | ⬜     |       |               |
| F-4.5 | Escalation notifications: email, SMS/WhatsApp, push                                | ⬜     |       |               |
| F-4.6 | SLA countdown UI, at-risk and breached chips, compliance metrics                   | ⬜     |       |               |
| F-4.7 | Failure tests: kill the worker or Redis mid-SLA, and the sweeper recovers          | ⬜     |       |               |

## P5 · Verification & closure

| ID    | Feature                                                                 | Status | Tests | Notes |
| ----- | ----------------------------------------------------------------------- | ------ | ----- | ----- |
| F-5.1 | Submit for verification, with resolution evidence required per category | ⬜     |       |       |
| F-5.2 | Verifier queue: approve & close, or reopen with instructions            | ⬜     |       |       |
| F-5.3 | Requester feedback after closure                                        | ⬜     |       |       |
| F-5.4 | Auto-close after N days of no response                                  | ⬜     |       |       |

## P6 · RCA & CAPA

| ID    | Feature                                                                  | Status | Tests | Notes |
| ----- | ------------------------------------------------------------------------ | ------ | ----- | ----- |
| F-6.1 | RCA/CAPA data model, numbering, list and detail pages                    | ⬜     |       |       |
| F-6.2 | 5 Whys and Fishbone builder                                              | ⬜     |       |       |
| F-6.3 | CAPA actions: owners, due dates, evidence, reminders, overdue escalation | ⬜     |       |       |
| F-6.4 | Effectiveness check and recurrence detection                             | ⬜     |       |       |
| F-6.5 | Trigger rules and a "Convert ticket to RCA" button                       | ⬜     |       |       |
| F-6.6 | Approval workflow with a signature log                                   | ⬜     |       |       |
| F-6.7 | RCA/CAPA PDF report                                                      | ⬜     |       |       |

## P7 · Audit module

| ID    | Feature                                         | Status | Tests | Notes |
| ----- | ----------------------------------------------- | ------ | ----- | ----- |
| F-7.1 | Checklist template builder and audit scheduling | ⬜     |       |       |
| F-7.2 | Mobile audit execution (PWA, works offline)     | ⬜     |       |       |
| F-7.3 | Findings → auto-NCR → RCA/CAPA                  | ⬜     |       |       |
| F-7.4 | Audit reports and read-only auditor portal      | ⬜     |       |       |

## P8 · Analytics, reporting, notifications

| ID    | Feature                                                      | Status | Tests | Notes             |
| ----- | ------------------------------------------------------------ | ------ | ----- | ----------------- |
| F-8.1 | Dashboards: SLA, MTTR, volume, ratings, heatmaps, CAPA aging | ⬜     |       | Uses F-0.5 charts |
| F-8.2 | Scheduled email digests; CSV/Excel/PDF export                | ⬜     |       |                   |
| F-8.3 | Notification preferences, quiet hours, digest mode           | ⬜     |       |                   |
| F-8.4 | Saved reports and branch comparison                          | ⬜     |       |                   |

## P9 · Billing, plans, white-label, integrations

| ID    | Feature                                                        | Status | Tests | Notes |
| ----- | -------------------------------------------------------------- | ------ | ----- | ----- |
| F-9.1 | Plans with server-enforced limits and usage metering           | ⬜     |       |       |
| F-9.2 | Billing: Stripe / Razorpay, trials, invoices, dunning          | ⬜     |       |       |
| F-9.3 | White-label: logo, colours, custom domain                      | ⬜     |       |       |
| F-9.4 | Webhooks, public REST API, API keys, Slack/Teams/WhatsApp, SSO | ⬜     |       |       |
| F-9.5 | Data export and tenant deletion (GDPR/DPDP)                    | ⬜     |       |       |

## P10 · Hardening & launch

| ID     | Feature                                                     | Status | Tests | Notes |
| ------ | ----------------------------------------------------------- | ------ | ----- | ----- |
| F-10.1 | Security review (OWASP ASVS), dependency scanning           | ⬜     |       |       |
| F-10.2 | Backups and restore drill                                   | ⬜     |       |       |
| F-10.3 | Load test of the public form                                | ⬜     |       |       |
| F-10.4 | Observability: dashboards, queue-lag alerts                 | ⬜     |       |       |
| F-10.5 | Docs, help centre, demo tenant, legal pages, marketing site | ⬜     |       |       |
