# Test tracker

Every suite, what it covers, and where it runs.

- `pnpm test` runs Vitest: the **unit** project (logic and components, jsdom or Node) and the
  **integration** project (services against a real `mongod` replica set from
  mongodb-memory-server, one fresh database per file).
- `pnpm test:e2e` runs Playwright on desktop and mobile Chromium, against a production build and
  a throwaway MongoDB on port 27999.

**Totals (2026-11-26):** 221 Vitest tests ✅ (31 files) · 70 e2e runs (35 specs × 2 devices) ✅

## Suites

| ID       | Layer       | File                                          | Covers                                                                                                                                                             | Features       | Tests | Status |
| -------- | ----------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----- | ------ |
| T-API-1  | Unit        | `src/lib/api/response.test.ts`                | `ok`, `fail`, `pageMeta`, `ApiError`, `withApi` hides internals                                                                                                    | F-0.6          | 10    | ✅     |
| T-API-2  | Unit        | `src/lib/api/client.test.ts`                  | `apiFetch` envelopes, network and non-JSON failures, `unwrap`                                                                                                      | F-0.6          | 7     | ✅     |
| T-ENV-1  | Unit        | `src/server/env.test.ts`                      | Required vars, all errors at once, SRV URIs, super-admin list                                                                                                      | F-0.9          | 5     | ✅     |
| T-RBAC-1 | Unit        | `src/server/rbac/rbac.test.ts`                | System roles, union of roles, custom roles, branch scope, no escalation                                                                                            | F-1.4          | 10    | ✅     |
| T-LIB-1  | Unit        | `src/lib/location-tree.test.ts`               | Nesting rules, tree building, orphans                                                                                                                              | F-1.5          | 4     | ✅     |
| T-LIB-2  | Unit        | `src/lib/safe-next.test.ts`                   | `?next=` open-redirect protection                                                                                                                                  | F-1.2          | 9     | ✅     |
| T-LIB-3  | Unit        | `src/lib/time-zones.test.ts`                  | Modern IANA names, sorted, valid (BUG-002)                                                                                                                         | F-1.1          | 4     | ✅     |
| T-UI-1   | Component   | `src/components/ui/button.test.tsx`           | Click, `loading`                                                                                                                                                   | F-0.3          | 3     | ✅     |
| T-UI-2   | Component   | `src/components/cards/cards.test.tsx`         | StatCard, EmptyState, PanelCard (BUG-001)                                                                                                                          | F-0.3          | 9     | ✅     |
| T-UI-3   | Component   | `src/components/icons.test.tsx`               | Decorative vs labelled, domain names                                                                                                                               | F-0.3          | 4     | ✅     |
| T-UI-4   | Component   | `src/components/breadcrumbs.test.tsx`         | Landmark, current page, collapsing                                                                                                                                 | F-0.4          | 4     | ✅     |
| T-UI-5   | Component   | `src/components/modal.test.tsx`               | Trigger, close, Escape, controlled                                                                                                                                 | F-0.4          | 4     | ✅     |
| T-UI-6   | Component   | `src/components/sweet-alert.test.tsx`         | Tones, confirm/cancel, async busy, error stays open                                                                                                                | F-0.4          | 6     | ✅     |
| T-UI-7   | Component   | `src/components/charts/charts.test.tsx`       | Token colours, labelled figures, data tables                                                                                                                       | F-0.5          | 7     | ✅     |
| T-UI-8   | Component   | `src/components/form.test.tsx`                | Field/select/checkbox labels, field errors wired to inputs, form message                                                                                           | F-1.x          | 8     | ✅     |
| T-UI-9   | Component   | `src/components/page-header.test.tsx`         | h1, description, trail, actions                                                                                                                                    | F-1.x          | 1     | ✅     |
| T-UI-10  | Component   | `src/components/skeleton.test.tsx`            | Decorative blocks, one loading status                                                                                                                              | F-1.x          | 2     | ✅     |
| T-LIB-4  | Unit        | `src/lib/short-code.test.ts`                  | Code alphabet, uniqueness, validation                                                                                                                              | F-2.1          | 3     | ✅     |
| T-LIB-5  | Unit        | `src/lib/feedback-presets.test.ts`            | Category presets per industry, safety = high                                                                                                                       | F-2.6          | 7     | ✅     |
| T-LIB-6  | Unit        | `src/lib/roadmap.test.ts`                     | Homepage roadmap order and consistency                                                                                                                             | –              | 3     | ✅     |
| T-QRI-1  | Unit        | `src/server/qr-image.test.ts`                 | SVG and PNG output                                                                                                                                                 | F-2.1          | 2     | ✅     |
| T-TS-1   | Unit        | `src/server/turnstile.test.ts`                | Off without keys, fail-closed, Cloudflare verdict                                                                                                                  | F-2.4          | 4     | ✅     |
| T-RL-1   | Integration | `src/server/rate-limit.int.test.ts`           | Window limit, separate keys, concurrent bursts                                                                                                                     | F-2.4          | 3     | ✅     |
| T-QR-2   | Integration | `src/server/modules/qr-codes.int.test.ts`     | One active per location, bulk, regenerate, revoke, dead-code chain, scans, permissions                                                                             | F-2.1, F-2.2   | 8     | ✅     |
| T-INT-1  | Integration | `src/server/modules/intake.int.test.ts`       | Ticket numbering, merge, severity, privacy, validation, rate limits, Turnstile, scoping, stats (BUG-003)                                                           | F-2.3–F-2.5    | 14    | ✅     |
| T-DB-1   | Integration | `src/server/db/repository.int.test.ts`        | Tenant stamping, `$and` scoping vs hostile filters, branch scope, paging, rollback                                                                                 | F-0.11         | 8     | ✅     |
| T-ISO-1  | Integration | `src/server/isolation.int.test.ts`            | Tenant B can't read, update or delete tenant A's data, for **every** repository                                                                                    | F-0.11, F-0.12 | 19    | ✅     |
| T-AUD-1  | Integration | `src/server/audit/audit-log.int.test.ts`      | Hash chain, tamper and deletion detection, concurrency, rollback, append-only                                                                                      | F-1.7          | 8     | ✅     |
| T-ORG-1  | Integration | `src/server/modules/organization.int.test.ts` | Onboarding transaction, slugs, validation, branches, context, suspension, plan limits                                                                              | F-1.1, F-1.6   | 12    | ✅     |
| T-LOC-2  | Integration | `src/server/modules/locations.int.test.ts`    | Paths, invalid nesting, cross-branch/tenant parents, rename, archive, scope                                                                                        | F-1.5          | 7     | ✅     |
| T-MEM-1  | Integration | `src/server/modules/members.int.test.ts`      | Token hashing, accept once, expiry/revoke/email checks, no escalation, last-admin guard                                                                            | F-1.3, F-1.4   | 9     | ✅     |
| T-E2E-1  | E2E         | `e2e/design-system.spec.ts`                   | Brand colours, palette lock, no sideways scroll, dark mode, focus                                                                                                  | F-0.1          | 7     | ✅     |
| T-E2E-2  | E2E         | `e2e/components.spec.ts` (kit)                | Modal focus, sweet alert flows, breadcrumbs, chart colours                                                                                                         | F-0.3–F-0.5    | 6     | ✅     |
| T-E2E-3  | E2E         | `e2e/components.spec.ts` (API)                | `/api/health` envelope                                                                                                                                             | F-0.6          | 1     | ✅     |
| T-E2E-4  | E2E         | `e2e/phase1.spec.ts`                          | Sign-in redirect, sign-up → onboarding, wrong password, location tree, invite round trip with limited nav, audit chain, super-admin suspension, no sideways scroll | F-1.1–F-1.7    | 8     | ✅     |

## Planned critical suites

Write these **before** the features they guard (red first).

| ID      | Layer       | Covers                                                                      | Guards       | Status |
| ------- | ----------- | --------------------------------------------------------------------------- | ------------ | ------ |
| T-QR-1  | E2E         | Scan → public form → ticket appears in the admin list                       | F-2.3, F-2.5 | ⬜     |
| T-SM-1  | Unit        | Ticket state machine: every allowed and rejected transition                 | F-3.4        | ⬜     |
| T-SLA-1 | Unit        | Due dates across business hours, weekends, holidays, timezones, pauses      | F-4.2        | ⬜     |
| T-SLA-2 | Integration | Escalation L1 → L2 → L3 is idempotent; the sweeper recovers after a restart | F-4.3, F-4.7 | ⬜     |
| T-UP-1  | Integration | Uploads: type and size limits, EXIF GPS stripped                            | F-2.3        | ⬜     |

## Conventions

- Query by role and label (`getByRole`, `getByLabel`), never by CSS class, except to assert a
  design token.
- E2E: Next 16 keeps visited pages mounted but hidden, so scope form fields with
  `.filter({ visible: true })`. Next's route announcer also has `role="alert"`, so filter alerts
  by text.
- Every new repository needs a factory in `isolation.int.test.ts`, or that test fails.
- Integration tests call `setupTestDb()` once per file and build contexts with `testContext()`.
- A bug's regression test names the bug ID in a comment.
- To test "before hydration", block `**/_next/static/chunks/**`. Don't turn JavaScript off:
  Suspense content streams in through inline scripts.
- Stop leftover servers by port (`kill $(lsof -ti :3210 -ti :27999)`): Next renames its process
  to `next-server`, and Playwright silently reuses a stale build on 3210.
