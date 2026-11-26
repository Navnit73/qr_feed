# QR Feed Security & OWASP ASVS Checklist (F-10.1)

## Multi-Tenancy Isolation

- Every tenant-scoped collection goes through `defineRepository()` in `src/server/repositories.ts`, automatically `$and`-scoping `tenantId` (and `branchId` when branch-scoped).
- ESLint blocks importing `@/server/db/client` outside `src/server/{db,auth,audit}`, `modules/tenants.ts`, and `rate-limit.ts`.
- `src/server/isolation.int.test.ts` fails CI automatically if any registered collection lacks cross-tenant read/update/delete isolation tests.
- Public intake (`/f/[code]`), tracking links (`/t/[token]`), invite links (`/invite/[token]`), and API keys (`Authorization: Bearer qrf_…`) resolve `tenantId` strictly from unguessable/hashed server tokens—never from client input.

## Authentication, Sessions & RBAC

- Identity and password hashing managed by Better Auth; rate limiting enabled in production (`AUTH_RATE_LIMIT=on`).
- Every server action and service function enforces `assertCan(ctx, "perm:name", { branchId })`. Never relies on UI hiding.
- `canGrantRoles()` prevents privilege escalation when inviting members, editing access, or creating custom roles or API keys.
- Pre-hydration GET submission leak prevented (`method="post"` + disabled until `useHydrated()`, guarded by BUG-005 e2e test).

## Public Intake & File Uploads

- Fixed-window rate limits per IP and per QR short code (`src/server/rate-limit.ts`).
- Optional Cloudflare Turnstile verification (`src/server/turnstile.ts`, fail-closed when keys are configured).
- Uploaded images validated by magic bytes (JPEG, PNG, WebP only), limited to 5 MB, and stripped of EXIF/GPS/XMP/tEXt metadata (`src/server/image-sanitize.ts`, tested in `T-UP-1`).
- Files served with `X-Content-Type-Options: nosniff` and authorized either by tenant session + branch scope or by matching reporter tracking token.

## Auditability & Data Protection

- Every mutation writes an append-only, SHA-256 hash-chained `auditLogs` entry inside the same MongoDB replica-set transaction.
- GDPR/DPDP tooling supports full tenant JSON export (`/api/tenant/export`), retention-based PII anonymisation, and audited deletion requests (`/settings/privacy`).
- HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) applied globally in `next.config.ts`.

## Backup, Recovery & Secrets Rotation

- Production MongoDB Atlas PITR (RPO ≤ 5 min, RTO ≤ 30 min) complemented by `scripts/backup-restore.mts` and automated drill test `src/server/backup-restore.int.test.ts`.
- Rotating `BETTER_AUTH_SECRET`, `STORAGE_SECRET_ACCESS_KEY`, `CRON_SECRET`, or webhook/API keys requires zero schema migration.
