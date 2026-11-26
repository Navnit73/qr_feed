# FeedbackLoop – Phase-wise Product & Engineering Plan

**Product:** Multi-tenant QR Feedback → Ticket → SLA Escalation (L1/L2/L3) → RCA/CAPA → Verification platform, plus standalone Audit RCA/CAPA.
**Stack:** Next.js (App Router) · MongoDB · shadcn/ui + Tailwind · Material-style UX
**Targets:** Hospitals, hotels, clinics, malls, manufacturing units

> Note: This plan is based on my own knowledge of the domain, standards and tooling, not live web research. Prices, timelines and library versions are estimates: verify before committing.

---

## 1. Product summary

| Actor              | What they do                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Tenant Admin       | Creates branches, floors, locations, generates QR codes, adds users and roles, sets SLA rules, verifies/closes tickets |
| End user (public)  | Scans QR, submits feedback/complaint with rating, photos, urgency. No login                                            |
| L1 / L2 / L3 staff | Accept ticket, start work, add remarks, images, RCA/CAPA; escalations flow upward automatically                        |
| Verifier / Auditor | Verifies resolution, reviews RCA/CAPA and logs, runs audits                                                            |
| Super Admin (you)  | Manages tenants, plans, billing, platform health                                                                       |

**Core flow**

```
QR scan → Feedback form → Ticket created → Auto-assign (L1)
  → L1 accepts → Start work → Remarks/images/(RCA-CAPA)
  → Submit for closure → Admin verifies → Closed (or Reopened)
  ↳ If SLA breached: L1 → L2 → L3 (each event logged)
```

Standalone path: Admin/Auditor creates an **Audit finding / NCR → RCA → CAPA → Effectiveness check** with no QR involved.

---

## 2. Competitive landscape (from my knowledge – verify)

| Category                    | Examples                                    | Gap you can exploit                                         |
| --------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Feedback/CX tools           | Qualtrics, Medallia, Typeform, Google Forms | Collect feedback but do not drive operational resolution    |
| Facility/CMMS & helpdesk    | Fiix, UpKeep, Limble, Freshdesk, Zendesk    | Heavy, generic; no QR-per-location feedback, weak RCA/CAPA  |
| QMS / CAPA software         | MasterControl, Qualio, ETQ, Greenlight Guru | Expensive, built for pharma/med-device, no public QR intake |
| Hospital incident reporting | Datix, RLDatix, Vizient                     | Enterprise pricing, hospital-only                           |
| Hotel tools                 | HotelRunner, ReviewPro, Quore               | Guest-experience focus, little RCA/CAPA                     |

**Positioning:** "Incident-to-Resolution platform for physical businesses." QR = entry, SLA = engine, RCA/CAPA = differentiator, audit module = second use case. Affordable vs. enterprise QMS.

**Validation before heavy build:** talk to 10 prospects (3 hospitals/clinics, 3 hotels, 2 malls, 2 factories). Ask: who handles complaints today, how are escalations done, do they need RCA/CAPA, what would they pay.

---

## 3. Domain/compliance notes

- **Hospitals:** NABH (India), JCI, Joint Commission style incident reporting, infection-control observations, patient-safety events. Need confidentiality and audit trails.
- **Manufacturing:** ISO 9001 (CAPA clause 10.2), ISO 45001, IATF 16949 / 8D reports for automotive, GMP for pharma.
- **Hotels/Malls:** ISO 22000/HACCP (food), fire/safety observations.
- **Data protection:** India DPDP Act 2023, GDPR (for EU/UK tenants), HIPAA only if PHI is stored. Recommendation: tell users **not to enter patient-identifying details** in public forms; add a disclaimer and optional redaction.
- **Audit-grade logging:** immutable, timestamped, who/what/before/after.
- **Data residency:** offer region choice (MongoDB Atlas region per deployment) later for enterprise.

---

## 4. Architecture

### 4.1 High-level

```
Public QR page (Next.js, no auth, signed token) ─┐
Admin / Staff app (Next.js + shadcn)             ├─► API layer (Route Handlers / Server Actions)
Super-admin console                              ─┘        │
                                                           ├─► MongoDB Atlas (replica set)
                                                           ├─► Redis + BullMQ (SLA timers, notifications)
                                                           ├─► Object storage (S3 / Cloudflare R2) via presigned URLs
                                                           └─► Email / SMS / WhatsApp / Push providers
Worker process (separate Node service): SLA scheduler, escalation, notifications, report generation
```

**Important:** run background jobs in a **separate worker process**, not inside Next.js serverless functions. SLA escalation must run reliably even when nobody is using the app.

### 4.2 Recommended stack choices

| Concern        | Recommendation                                        | Why                                               |
| -------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Framework      | Next.js App Router + TypeScript                       | Single codebase for public page, admin, API       |
| UI             | shadcn/ui, Tailwind, Radix, lucide-react              | Material-like polish, full control                |
| Data tables    | TanStack Table                                        | Ticket lists, filters, bulk actions               |
| Forms          | React Hook Form + Zod                                 | Shared validation client/server                   |
| Server state   | TanStack Query                                        | Caching, optimistic updates                       |
| DB             | MongoDB Atlas (must be replica set for transactions)  | Your preference; flexible for custom forms        |
| ODM            | Mongoose (or native driver + Zod)                     | Schemas, plugins for tenant scoping               |
| Auth           | Auth.js (NextAuth) or Better Auth; JWT/session        | Credentials + Google/Microsoft SSO later          |
| RBAC           | CASL (or custom permission-matrix)                    | Permission-based, not role-name-based             |
| Jobs/timers    | BullMQ + Redis (delayed jobs)                         | Reliable SLA timers, retries                      |
| Realtime       | Server-Sent Events first; WebSocket later             | In-app notifications, live ticket board           |
| Files          | S3/R2 presigned upload, image compression client-side | Avoid proxying large files                        |
| Email          | Resend / SES                                          | Transactional                                     |
| SMS/WhatsApp   | Twilio / MSG91 / Gupshup                              | Escalation alerts matter more via WhatsApp/SMS    |
| PDF            | Puppeteer/Playwright or @react-pdf/renderer           | RCA/CAPA and audit reports                        |
| QR             | `qrcode` lib → SVG/PNG, bulk ZIP/PDF sheet            | Printable QR stickers with location label         |
| Charts         | Recharts (shadcn charts)                              | Analytics                                         |
| i18n           | next-intl                                             | Multi-language public form (important for guests) |
| Monitoring     | Sentry, Better Stack/Logtail, uptime checks           | Production safety                                 |
| Rate limiting  | Upstash Ratelimit / Redis                             | Protect public endpoints                          |
| Bot protection | Cloudflare Turnstile                                  | Anonymous forms get spammed                       |
| Testing        | Vitest, Playwright                                    | Tenant isolation tests are critical               |

### 4.3 Multi-tenancy in MongoDB

**Recommended model: shared database, shared collections, `tenantId` on every document.** Simple, cheap, scales well to hundreds of tenants.

Rules:

1. Every collection has `tenantId` (ObjectId) and a compound index starting with it, e.g. `{ tenantId: 1, status: 1, createdAt: -1 }`.
2. **Never query Mongo directly from route handlers.** All access goes through a repository/data-access layer that requires a `TenantContext` and injects `tenantId` automatically (Mongoose plugin or wrapper). This is your main isolation guarantee.
3. Within a tenant, scope by **branch** access: users have `branchIds[]`; queries filter by them unless user has org-wide permission.
4. Write automated tests: "user of tenant A cannot read/update any record of tenant B" for every endpoint.
5. Public QR endpoints resolve `tenantId` from the QR record, never from client input.
6. Optional later: dedicated DB per enterprise tenant (database-per-tenant) as a premium tier. Design the data layer so tenant → connection resolution is swappable.

### 4.4 Location hierarchy

```
Tenant (Organisation)
 └─ Branch (Hospital A, Hotel Delhi …)
     └─ Building (optional)
         └─ Floor
             └─ Department / Zone
                 └─ Location (Washroom F2, Room 305, Machine M-12)
                     └─ QR code(s)
```

Store as a **flat `locations` collection with `path` array + `type`** (materialized path) rather than deep nesting. Allows queries like "all tickets under Floor 2" with one index on `ancestors`.

---

## 5. Data model (MongoDB collections)

```
tenants            { name, slug, plan, status, settings, branding, limits }
branches           { tenantId, name, address, timezone, businessHours, holidays[] }
locations          { tenantId, branchId, type, name, parentId, ancestors[], code }
qrCodes            { tenantId, branchId, locationId, token(random, unguessable), shortCode,
                     status, categoryPresetIds[], formTemplateId, createdBy, scanCount }
users              { tenantId, name, email, phone, passwordHash?, roleIds[], branchIds[],
                     departmentIds[], status, availability, language }
roles              { tenantId|null(system), name, permissions[], isSystem }
teams/departments  { tenantId, branchId, name, headUserId }
categories         { tenantId, name, parentId, departmentId, defaultSeverity, requiresRCA, slaPolicyId }
formTemplates      { tenantId, fields[], ratingType, requiredFields, industryPreset }
tickets            { tenantId, branchId, locationId, qrCodeId?, number (TKT-2026-000123),
                     source (qr|manual|audit), categoryId, severity, priority, status,
                     rating, description, attachments[], reporter{name?,email?,phone?,anonymous},
                     publicTrackingToken, assignee, currentLevel(1|2|3), slaPolicyId,
                     sla{ acceptDueAt, resolveDueAt, acceptedAt, resolvedAt, breached, pausedMs },
                     rcaId?, tags[], createdAt, updatedAt }
ticketActivities   { tenantId, ticketId, type, actorId|system, at, before, after, note, meta }   // append-only log
comments/remarks   { tenantId, ticketId, authorId, body, visibility(internal|public), attachments[] }
slaPolicies        { tenantId, name, appliesTo{category,severity,location},
                     levels[{level, acceptWithinMin, resolveWithinMin, escalateAfterMin,
                             assigneeRule, notify[], action(notify|transfer|both)}],
                     businessHoursMode, pauseStatuses[] }
escalationEvents   { tenantId, ticketId, fromLevel, toLevel, reason, at, notifiedUserIds[] }
assignmentRules    { tenantId, priority, conditions{branch,location,category,severity},
                     strategy(fixed|round_robin|least_loaded), userIds[]|teamId }
rcas               { tenantId, number, sourceTicketId?, sourceAuditFindingId?, method(5why|fishbone|8d),
                     problemStatement, why[], fishbone{categories}, contributingFactors[],
                     rootCause, owner, status, attachments[] }
capas              { tenantId, number, rcaId, type(correction|corrective|preventive),
                     actions[{title, ownerId, dueDate, status, evidence[]}],
                     effectivenessCheck{dueDate, method, recurred, evidence, verifierId, result},
                     status }
audits             { tenantId, branchId, templateId, auditorId, scheduledAt, checklistResults[], findings[] }
auditFindings      { tenantId, auditId, severity(minor|major|critical|observation), clause, description, evidence[], rcaId? }
notifications      { tenantId, userId, channel, type, payload, readAt, sentAt, status }
auditLogs          { tenantId, actorId, action, entity, entityId, before, after, ip, ua, at, hash, prevHash }
subscriptions      { tenantId, plan, status, limits, usage{tickets, locations, users}, billingRef }
```

**Key indexes**

- `tickets`: `{tenantId, branchId, status, createdAt:-1}`, `{tenantId, assignee.userId, status}`, `{tenantId, "sla.resolveDueAt":1, status:1}`, `{tenantId, locationId}`, unique `{tenantId, number}`.
- `qrCodes`: unique `{token}`; unique `{shortCode}`.
- `ticketActivities`: `{tenantId, ticketId, at}`.

---

## 6. Core engine designs

### 6.1 Ticket state machine

```
NEW → ASSIGNED → ACCEPTED → IN_PROGRESS → PENDING_VERIFICATION → CLOSED
                     │            │                │
                     │            └─ ON_HOLD (SLA pause, reason required)
                     └─ REJECTED/REASSIGNED (reason required)
PENDING_VERIFICATION → REOPENED → IN_PROGRESS
Any → CANCELLED/DUPLICATE/MERGED (admin only)
```

Implement as a pure function `transition(ticket, event, actor)` with allowed-transition table, permission checks, validation (e.g. cannot close without resolution remarks/evidence when category requires), and automatic activity log writing, all in one MongoDB transaction.

### 6.2 SLA & escalation engine

- On ticket creation compute `acceptDueAt` and `resolveDueAt` per level from the matching `slaPolicy`, honouring **business hours, weekends, holidays, branch timezone**.
- Schedule BullMQ **delayed jobs**: `warn@80%`, `breach@100%`, `escalate@threshold` per level. Job IDs deterministic (`ticketId:level:type`) so they can be cancelled/rescheduled.
- **Safety net:** a repeating sweeper job (every 1–5 min) queries `tickets` with `status in open states AND dueAt < now AND not escalated` to catch missed jobs after Redis loss or deploys. Make escalation **idempotent**.
- On escalate: increment `currentLevel`, resolve L2/L3 assignee (supervisor of L1, or rule-defined), apply policy action: **notify only / transfer ownership / both**, write `escalationEvents` + activity log, send notifications.
- Separate **acceptance SLA** (e.g. 15 min) and **resolution SLA** (e.g. 3 h).
- **Pause SLA** on `ON_HOLD` ("waiting for spare part"), tracked as `pausedMs`.
- Pre-breach warnings to assignee/supervisor.
- Severity can override timings (critical = shorter).
- Example default: L1 0–3h → L2 3–5h → L3 5h+.

### 6.3 Auto-assignment

Rules ordered by priority; first match wins: by **location → category → department → severity**. Strategies: fixed owner, round-robin, least-loaded, on-duty only (shift/availability). Fallback to admin queue if no match. Manual reassignment requires a reason and is logged.

### 6.4 Public QR intake

- QR encodes `https://app.domain.com/f/{shortCode}` → resolves to tenant/branch/location. Unguessable tokens; ability to **revoke/regenerate** a QR.
- Mobile-first page, no login, loads in <2 s, works on poor networks, supports camera upload with client compression.
- Fields: category (preset per location type), description, star rating, severity/urgency, photos (max N, 5–10 MB each), optional name/phone/email, consent checkbox.
- Anti-abuse: Turnstile, IP rate limits, per-QR limits, duplicate detection ("a similar open ticket exists for this location").
- Confirmation screen with ticket number and **tracking link** (`/t/{publicTrackingToken}`) showing status and public remarks only.
- Optional: location-specific language and branding (logo, colours).

### 6.5 Logging & audit trail (your explicit requirement)

Two layers:

1. **Ticket timeline (`ticketActivities`)**: every event is a row: created, assigned, accepted, started, remark added, image uploaded, field changed (before/after), SLA warning, escalated, reassigned, hold/resume, RCA linked, submitted, verified, reopened, closed. Visible in UI as a timeline with actor, timestamp, and diff.
2. **System audit log (`auditLogs`)**: security and admin actions (login, role changes, QR created/revoked, settings changes, exports). **Append-only**; no update/delete API. Optional **hash chain** (`hash = H(prevHash + record)`) for tamper evidence. Exportable as CSV/PDF.

Per-ticket downloadable **"Ticket history report" PDF** (all activity, remarks, images, SLA metrics).

### 6.6 RCA / CAPA module

- **Trigger rules:** category flag `requiresRCA`, severity ≥ threshold, repeat issue at same location (e.g. 3 tickets/30 days), SLA breach L3, or manual.
- **Methods:** 5 Whys, Fishbone (Ishikawa) with 6M categories (Man, Machine, Method, Material, Measurement, Environment), later 8D and Fault-tree.
- **CAPA:** correction (containment) → corrective → preventive actions, each with owner, due date, evidence, status; reminders and escalation of overdue actions.
- **Effectiveness check:** scheduled date (e.g. 30/60/90 days), method, "did it recur?" (system can auto-suggest by querying recurrence), verifier sign-off.
- **Link both ways:** Ticket ↔ RCA ↔ CAPA ↔ Audit finding. One RCA can cover multiple tickets.
- Approval workflow: Owner → Reviewer → Approver, with e-signature-style approvals (name, timestamp, comment). (Full 21 CFR Part 11 compliance is out of scope: do not claim it.)

### 6.7 Audit module (traditional RCA/CAPA)

Checklist templates → schedule audit → auditor fills checklist (mobile friendly) → findings with severity → auto-create NCR/CAPA → track to closure → audit report PDF. Reuse RCA/CAPA module; tickets are optional.

---

## 7. RBAC design

**Permission-based**, roles are bundles of permissions. Scope = tenant → branch → department.

| Role                                  | Scope         | Key permissions                                                 |
| ------------------------------------- | ------------- | --------------------------------------------------------------- |
| Super Admin                           | Platform      | tenants, plans, impersonation (logged)                          |
| Org Admin                             | Tenant        | everything in tenant, billing, branches                         |
| Branch Admin                          | Branch(es)    | users, QR, tickets, verify/close in branch                      |
| Dept Manager                          | Department    | tickets & staff of department                                   |
| L3 Manager / L2 Supervisor / L1 Staff | Assigned      | `ticket.accept`, `ticket.work`, `ticket.escalate.receive`, etc. |
| Verifier                              | Branch/Tenant | `ticket.verify`, `capa.verify`                                  |
| Auditor                               | Tenant        | read-only logs, RCA/CAPA, audit module                          |
| Custom                                | any           | admin-defined permission sets                                   |

Permission strings example: `ticket:read`, `ticket:assign`, `ticket:close`, `ticket:verify`, `qr:create`, `user:invite`, `role:manage`, `rca:approve`, `audit:run`, `report:export`, `settings:sla`.

Enforce in **three places**: middleware (route), server action/handler (policy check), and UI (hide actions). Never rely on UI hiding.

---

## 8. UX / UI guidelines (shadcn + Material feel)

- **Design system:** shadcn/ui + Tailwind tokens (CSS variables), 8-px spacing grid, Inter/Roboto font, elevation via subtle shadows, rounded-xl cards, light/dark mode, tenant-brandable primary colour.
- **App shell:** collapsible sidebar (Dashboard, Tickets, My Work, Locations & QR, RCA/CAPA, Audits, Reports, Users & Roles, Settings), top bar with branch switcher, global search (⌘K command palette), notification bell.
- **Key screens**
  1. Public feedback form (mobile-first, big touch targets, stepper, star rating, camera button).
  2. Ticket board/list: table + Kanban toggle, saved filters, SLA countdown chips (green/amber/red).
  3. Ticket detail: header (status, SLA timer, level badge), left = description/images/remarks, right = assignee, SLA, location, tags; bottom/tab = **Activity timeline**, RCA/CAPA tab, attachments.
  4. "My Work" for staff: due-soon list, one-tap Accept / Start / Submit.
  5. QR manager: tree of locations, bulk generate, print sheet PDF with location name.
  6. SLA policy builder: visual L1→L2→L3 ladder with time inputs.
  7. RCA/CAPA workspace: stepper (Problem → Analysis → Root cause → Actions → Verification), interactive fishbone.
  8. Dashboards: open/overdue tickets, SLA compliance %, MTTR, avg rating, top problem locations (heatmap), repeat-issue list, CAPA overdue.
- **UX details:** skeleton loaders, optimistic updates, toasts, empty states with guidance, keyboard shortcuts, responsive tables, accessible (WCAG 2.1 AA), i18n and RTL-ready.
- **Staff mobile:** build as **PWA** (installable, push notifications, offline draft for audits). Native app only if needed later.

---

## 9. Phase-wise plan

Estimates assume 1 full-stack developer (+ part-time designer). Halve calendar time with 2 devs.

### Phase 0 – Validation & foundations (1–2 weeks)

**Goals:** de-risk and set up.

- Customer interviews (10+), pick **one launch vertical** (recommendation: **hotels/clinics** first: simpler, faster sales; hospitals later because compliance and procurement are slower).
- Finalise decisions: anonymous + optional contact; auto + manual assignment; RCA/CAPA trigger rules.
- Repo setup: Next.js + TS, ESLint, Prettier, Husky, CI (GitHub Actions), env management.
- Design tokens, shadcn setup, Figma wireframes for 6 core screens.
- MongoDB Atlas (replica set), Redis, storage bucket, Sentry, staging environment.
- Write tenant-scoped data-access layer and the isolation test harness **first**.
  **Exit criteria:** clickable prototype, CI green, tenant isolation test passing.

### Phase 1 – Tenancy, auth, RBAC, hierarchy (2–3 weeks)

- Tenant onboarding (sign-up → create org → first branch).
- Auth (email+password, invite links, password reset, optional Google SSO), sessions, 2FA optional.
- Users CRUD, invite flow, roles & permissions (system roles + custom), branch assignment.
- Branch → Building → Floor → Department → Location management (tree UI).
- Super-admin console (tenant list, suspend, plan limits).
- Audit log foundation (append-only) wired into every mutation.
  **Exit:** an admin can create org, branches, locations, invite users with roles; all actions logged.

### Phase 2 – QR & public feedback intake (2 weeks)

- QR generation per location, single + bulk, SVG/PNG, printable PDF sheets with labels, revoke/regenerate, scan analytics.
- Public feedback form: categories, rating, images (presigned upload + compression), severity, optional contact, Turnstile, rate limit, i18n.
- Ticket creation + numbering + tracking link + confirmation page + email/SMS confirmation (if contact given).
- Form templates per industry (hospital, hotel, mall, factory presets).
  **Exit:** scan a printed QR on a phone → ticket appears in admin list in <2 s.

### Phase 3 – Ticketing core & assignment (2–3 weeks)

- Ticket list (filters, search, saved views, bulk actions), ticket detail page, Kanban view.
- State machine, accept/start/hold/submit actions, remarks (internal/public), image attachments.
- Assignment rules engine (location/category based, round-robin, manual with reason), reassignment.
- **Ticket activity timeline** (full per-ticket logs) and ticket history PDF.
- In-app + email notifications (assigned, status change).
- "My Work" staff view.
  **Exit:** complete ticket lifecycle without SLA automation; every step visible in timeline.

### Phase 4 – SLA & escalation engine (2–3 weeks) ⭐ core differentiator

- SLA policy builder (levels L1/L2/L3, accept vs resolve SLAs, business hours, holidays, timezone).
- BullMQ worker service: delayed jobs, sweeper, idempotent escalation, pre-breach warnings.
- Escalation actions (notify / transfer / both), hold-pause logic.
- Escalation notifications via email + SMS/WhatsApp + push; escalation history view.
- SLA countdown UI, breached/at-risk indicators, SLA compliance metrics.
- Load & failure tests (kill worker/Redis mid-SLA; verify sweeper recovers).
  **Exit:** a test ticket auto-escalates L1→L2→L3 on schedule, with correct logs, even after worker restart.

### Phase 5 – Verification & closure workflow (1–2 weeks)

- Submit-for-verification with mandatory resolution remarks/evidence (configurable per category).
- Verifier queue: approve & close, or reopen with instructions (reopen counter, SLA re-start rules).
- Requester feedback after closure ("Was your issue resolved?" + rating) via tracking link/SMS.
- Auto-close after N days of no response (configurable).
  **Exit:** end-to-end MVP loop works → **beta launch with 2–3 pilot customers.**

### Phase 6 – RCA & CAPA module (3–4 weeks)

- RCA/CAPA data model, numbering, list/detail pages.
- 5 Whys, Fishbone builder, contributing factors, root-cause statement.
- CAPA actions (correction/corrective/preventive), owners, due dates, evidence, reminders, overdue escalation.
- Effectiveness check scheduling & recurrence detection.
- Trigger rules (category, severity, repeat issues, L3 breach) + "Convert ticket to RCA" button.
- Approval workflow (owner → reviewer → approver) with signature log.
- RCA/CAPA PDF report.
  **Exit:** serious ticket converts to RCA → CAPA → verified effectiveness, fully logged.

### Phase 7 – Audit module (2–3 weeks)

- Checklist/template builder, audit scheduling (recurring), mobile audit execution (PWA, offline-tolerant).
- Findings (minor/major/critical/observation) → auto-NCR → RCA/CAPA.
- Audit reports, auditor role, read-only auditor portal.
  **Exit:** run an internal audit with no QR involved and close its CAPAs.

### Phase 8 – Analytics, reporting, notifications polish (2 weeks)

- Dashboards: SLA compliance, MTTR, volume by location/category, rating trends, heatmaps, repeat issues, CAPA aging, staff workload.
- Scheduled email reports (daily/weekly digest), CSV/Excel/PDF export.
- Notification preferences per user/channel, quiet hours, digest mode.
- Saved reports, branch comparison for chains.

### Phase 9 – Billing, plans, white-label, integrations (2–3 weeks)

- Subscription plans with limits (locations, users, monthly tickets) enforced server-side; usage metering.
- Billing: Stripe (global) / Razorpay (India); trials, invoices, dunning.
- White-label (logo, colours, custom domain/subdomain for public form), email sender domain.
- Webhooks + public REST API + API keys; integrations (Slack/Teams, WhatsApp, Zapier); SSO (SAML/OIDC) for enterprise.
- Data export & tenant deletion tooling (GDPR/DPDP).

### Phase 10 – Hardening & launch (2 weeks, then continuous)

- Security review (OWASP ASVS), pen-test basics, dependency scanning, secrets rotation, backups + restore drill (Atlas PITR).
- Performance (indexes, pagination, caching), load test public form (burst of scans).
- Observability dashboards, alerts on queue lag/escalation failures.
- Docs, help centre, onboarding checklist, demo tenant with seed data, ToS/Privacy/DPA.
- Marketing site + SEO landing pages per industry.

### Indicative timeline

| Milestone                    | Phases | Cumulative (solo) |
| ---------------------------- | ------ | ----------------- |
| Internal alpha               | 0–3    | ~8–10 weeks       |
| **MVP / pilot beta**         | 0–5    | ~12–16 weeks      |
| V1 with RCA/CAPA             | 0–6    | ~16–20 weeks      |
| V1.5 with audits & analytics | 0–8    | ~22–26 weeks      |
| Commercial launch            | 0–10   | ~28–34 weeks      |

**Scope advice:** ship at Phase 5 to a few pilots and charge early. Use their feedback to prioritise Phase 6+ (RCA/CAPA depth may matter more for hospitals/manufacturing than for hotels).

---

## 10. Security & privacy checklist

- Tenant isolation tests in CI; no raw DB access outside the data layer.
- Hash passwords (argon2/bcrypt), session rotation, brute-force lockout, optional TOTP 2FA.
- Signed, unguessable QR tokens; revocation; rate limiting; Turnstile.
- File uploads: type/size validation, virus scanning (ClamAV or provider), strip EXIF GPS, private bucket with short-lived signed URLs.
- Encrypt at rest (Atlas) and in transit; field-level encryption for sensitive reporter contact data if needed.
- Data retention policies per tenant; anonymise/delete on request.
- Impersonation by super-admin only with reason and logging.
- Secrets in a vault/env manager; least-privilege cloud IAM.
- Backup & disaster recovery plan (RPO/RTO documented).

---

## 11. Risks & mitigations

| Risk                                      | Mitigation                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Tenant data leak                          | Central data layer, isolation tests, code reviews                          |
| Missed escalations (Redis/worker failure) | Sweeper job, idempotent handlers, queue-lag alerts                         |
| Public form spam                          | Turnstile, rate limits, moderation queue                                   |
| Scope creep (4 industries + audits)       | One engine + templates; launch one vertical first                          |
| MongoDB transactions/relations complexity | Use replica set, keep activity log append-only, denormalise carefully      |
| Hospital sales cycle is long              | Start with clinics/hotels; pursue hospitals with pilot + compliance docs   |
| Staff adoption (low-tech workers)         | PWA, WhatsApp/SMS notifications, very simple "My Work" UI, local languages |
| Notification costs (SMS/WhatsApp)         | Plan limits, pass-through pricing, email/push default                      |

---

## 12. Pricing (hypotheses to test, not validated)

| Plan       | Price/mo | Includes                                           |
| ---------- | -------- | -------------------------------------------------- |
| Starter    | $39      | 1 branch, ≤10 users, ≤300 tickets, basic SLA       |
| Growth     | $79      | 3 branches, ≤30 users, RCA/CAPA basic              |
| Business   | $149     | 10 branches, audits, analytics, API                |
| Enterprise | Custom   | SSO, white-label, SLA support, dedicated DB/region |

Add-ons: extra branches, SMS/WhatsApp credits, white-label, advanced analytics. Test whether a small hotel/clinic will pay ~$79 before building Phases 7–9.

---

## 13. Suggested folder structure (Next.js)

```
/src
  /app
    /(public)/f/[code]        # QR feedback form
    /(public)/t/[token]       # ticket tracking
    /(auth)/login, /invite
    /(app)/dashboard, tickets, my-work, locations, qr, rca, capa, audits, reports, settings, users
    /(admin)/super            # platform console
    /api                      # route handlers, webhooks
  /server
    /db (connection, models, tenant-scoped repositories)
    /auth, /rbac (CASL abilities)
    /modules/{tickets,sla,assignment,rca,capa,audits,notifications,qr,billing}
    /jobs (BullMQ queues + processors)  → run in separate worker entrypoint
  /components (ui/ shadcn, tickets/, rca/, charts/)
  /lib (zod schemas, utils, i18n)
/worker                       # node worker entry (SLA, notifications, reports)
/tests (unit, integration, e2e, tenant-isolation)
```

---

## 14. Next steps (this week)

1. Pick the launch vertical and 3–5 pilot prospects.
2. Create the repo, set up Atlas replica set + Redis + R2, and build the tenant-scoped data layer with isolation tests.
3. Wireframe: public form, ticket detail with timeline, SLA policy builder.
4. Implement Phase 1 (tenant, auth, RBAC, hierarchy) and Phase 2 (QR + intake) for a first demo.
5. Build the SLA worker early as a spike (Phase 4 risk is the highest).
