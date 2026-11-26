# Phase tracker

Source plan: [`phase.md`](../../phase.md) §9. Statuses are explained in [README.md](README.md).
Estimates assume one full-stack developer.

| Phase | Name                                      | Est.   | Status | Features done | Exit criteria met |
| ----- | ----------------------------------------- | ------ | ------ | ------------- | ----------------- |
| P0    | Validation & foundations                  | 1–2 wk | 🟨     | 11 / 13       | 2 / 3             |
| P1    | Tenancy, auth, RBAC, hierarchy            | 2–3 wk | 🟨     | 4 / 7 (3 🟨)  | ✅                |
| P2    | QR & public feedback intake               | 2 wk   | 🟨     | 5 / 7 (1 🟨)  | ✅                |
| P3    | Ticketing core & assignment               | 2–3 wk | ⬜     | 0 / 8         | ⬜                |
| P4    | SLA & escalation engine ⭐                | 2–3 wk | ⬜     | 0 / 7         | ⬜                |
| P5    | Verification & closure → **pilot beta**   | 1–2 wk | ⬜     | 0 / 4         | ⬜                |
| P6    | RCA & CAPA module                         | 3–4 wk | ⬜     | 0 / 7         | ⬜                |
| P7    | Audit module                              | 2–3 wk | ⬜     | 0 / 4         | ⬜                |
| P8    | Analytics, reporting, notifications       | 2 wk   | ⬜     | 0 / 4         | ⬜                |
| P9    | Billing, plans, white-label, integrations | 2–3 wk | ⬜     | 0 / 5         | ⬜                |
| P10   | Hardening & launch                        | 2 wk   | ⬜     | 0 / 5         | ⬜                |

## Milestones

| Milestone                    | Phases | Target (solo) | Status |
| ---------------------------- | ------ | ------------- | ------ |
| Internal alpha               | P0–P3  | ~8–10 wk      | ⬜     |
| **MVP / pilot beta**         | P0–P5  | ~12–16 wk     | ⬜     |
| V1 with RCA/CAPA             | P0–P6  | ~16–20 wk     | ⬜     |
| V1.5 with audits & analytics | P0–P8  | ~22–26 wk     | ⬜     |
| Commercial launch            | P0–P10 | ~28–34 wk     | ⬜     |

---

## P0 · Validation & foundations 🟨

**Goal:** de-risk the product and set up the codebase.
**Exit criteria:**

- [ ] Clickable prototype of the 6 core screens (P1 screens are real now; ticket, SLA and
      public-form wireframes still to do: F-0.13)
- [x] CI pipeline green locally: format, lint, typecheck, unit + integration, e2e. The
      GitHub Actions workflow is written but hasn't run yet (no push)
- [x] Tenant isolation test harness passing (T-ISO-1, every repository)

**Log**

- 2026-11-26: Design system, unit/component test layer (Vitest) and reusable UI kit done
  (F-0.1 to F-0.6). Trackers created. BUG-001 found and fixed through a regression test.
- 2026-11-26: Typed env, MongoDB client, tenant-scoped repository layer, isolation harness,
  ESLint ban on raw DB access, CI workflow, Husky + lint-staged, local `pnpm db:dev`
  (F-0.7 to F-0.9, F-0.11, F-0.12). Cloud infra (F-0.10) needs accounts.

## P1 · Tenancy, auth, RBAC, hierarchy 🟨

**Exit:** an admin can create an org, branches and locations, and invite users with roles. Every
action is logged. ✅ **Met** (2026-11-26), proven end to end by T-E2E-4.

**Log**

- 2026-11-26: Better Auth (email + password, sessions, reset), onboarding, RBAC with 8 system
  roles and no-escalation granting, branches, location tree, invites and members, super-admin
  console, hash-chained audit log. BUG-002 found by e2e and fixed.
- Remaining for P1 ✅: reset emails need a provider (F-1.2), custom-role editor UI (F-1.4),
  plan-limit editing UI (F-1.6). Moving locations is deferred to P2.

## P2 · QR & public feedback intake 🟨

**Exit:** scan a printed QR on a phone, and the ticket appears in the admin list in under 2 s.
✅ **Met** (2026-11-26), proven by T-E2E-6 on desktop and mobile.

**Log**

- 2026-11-26: QR per location (single, bulk, regenerate, revoke, scan counts, SVG/PNG, printable
  sheet), public mobile form with industry categories, rating and urgency, ticket numbering,
  repeat-report merging, rate limits, optional Turnstile, private tracking links, basic ticket
  inbox. Homepage rebuilt with the product story and live roadmap. BUG-003, BUG-004 and BUG-005
  found and fixed (BUG-005 was a credential leak in the URL before hydration).
- Remaining: photo uploads need a storage bucket (R2/S3, F-0.10); i18n (F-2.7); confirmation
  email/SMS waits for the notification provider (P3).

## P3 · Ticketing core & assignment ⬜

**Exit:** a complete ticket lifecycle without SLA automation, every step visible in the timeline.

## P4 · SLA & escalation engine ⬜

**Exit:** a test ticket auto-escalates L1 → L2 → L3 on schedule with correct logs, even after a
worker restart.

## P5 · Verification & closure ⬜

**Exit:** the end-to-end MVP loop works. Beta launch with 2–3 pilot customers.

## P6 · RCA & CAPA ⬜

**Exit:** a serious ticket converts to RCA → CAPA → verified effectiveness, fully logged.

## P7 · Audit module ⬜

**Exit:** run an internal audit with no QR involved, and close its CAPAs.

## P8 · Analytics & reporting ⬜

**Exit:** dashboards, scheduled reports and notification preferences live for pilot tenants.

## P9 · Billing & integrations ⬜

**Exit:** plan limits are enforced server-side, and paid sign-up works end to end.

## P10 · Hardening & launch ⬜

**Exit:** security review passed, restore drill done, public launch.
