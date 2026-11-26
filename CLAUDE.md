# QR Feed

A Next.js app with an indigo-on-soft-gray design system (indigo sidebar, tinted KPI tiles). Read this file before changing UI.

@AGENTS.md

## Stack

- **Next.js 16** (App Router, Turbopack, `src/` dir), **React 19**, **TypeScript**. Next 16 has breaking changes, so check `node_modules/next/dist/docs/` before using an API from memory (see AGENTS.md).
- **Tailwind CSS v4**, configured in CSS in `src/app/globals.css`. There is no `tailwind.config`.
- **shadcn/ui** in the `base-nova` style, built on `@base-ui/react` (not Radix). Components live in `src/components/ui/`. Class merging uses the `cn` package, re-exported from `@/lib/utils`.
- **lucide-react** for icons, **Geist** and **Geist Mono** for fonts.
- **MongoDB** (native driver 7, replica set for transactions) through tenant-scoped repositories in `src/server`. **Zod 4** validates every input.
- **Better Auth** for identity only (users, sessions, password reset). Organisations, roles and branches are ours.
- **pnpm** is the package manager. Don't use npm or yarn.
- **Prettier** with Tailwind class sorting, and **ESLint** (Next config plus `eslint-config-prettier`).
- **Playwright** runs end-to-end tests in Chromium.

## Commands

| Command                | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm db:dev`          | Local MongoDB replica set on 27017, data in `.data/` (no Docker) |
| `pnpm dev`             | Dev server (port 3000, or the next free port)                    |
| `pnpm worker`          | Standalone SLA escalation, auto-close & retention sweep worker   |
| `pnpm build`           | Production build                                                 |
| `pnpm lint`            | ESLint                                                           |
| `pnpm format`          | Prettier writes all files                                        |
| `pnpm format:check`    | Prettier checks only (use in CI)                                 |
| `pnpm typecheck`       | `next typegen` (route types) then `tsc --noEmit`                 |
| `pnpm test`            | Vitest: unit + integration (real mongod), once                   |
| `pnpm test:unit`       | Only the fast unit/component project                             |
| `pnpm test:int`        | Only the integration project (services against MongoDB)          |
| `pnpm test:watch`      | Vitest in watch mode, for the red-green loop                     |
| `pnpm test:coverage`   | Vitest with v8 coverage of `src/components` and `src/lib`        |
| `pnpm test:e2e`        | Builds, serves on :3210, runs Playwright on desktop and mobile   |
| `pnpm test:e2e:ui`     | Playwright interactive UI mode                                   |
| `pnpm test:e2e:report` | Opens the last HTML test report                                  |
| `pnpm check`           | Everything CI runs: format check, lint, types, unit, e2e         |

Add a shadcn component with `pnpm dlx shadcn@latest add <name>`.

Before calling work done, run `pnpm format && pnpm check`.

## Layout

```
src/app/            routes (App Router). /design is the live design-system reference
src/app/globals.css design tokens, palette, base styles, utilities
src/components/ui/  shadcn components (ours to edit; they carry our variants)
src/app/(auth)/     sign-in, sign-up, forgot/reset password (Better Auth client)
next.config.ts      `/` redirects to /sign-in (no landing page); signed-in users are then sent to /dashboard
src/app/(app)/      signed-in shell: dashboard, tickets, my-work, verifications, rca, audits, reports, branches (+ QR), users, settings, notifications, audit-log
src/app/f/[code]    public feedback form a QR opens (no login, 5 languages + RTL + photos)
src/app/t/[token]   reporter's private tracking page + post-closure satisfaction feedback
src/app/print/      printable QR sheets, ticket history, RCA/CAPA & audit reports (outside the app shell)
src/app/onboarding, invite/[token], super, help, terms, privacy, dpa   onboarding, invites, platform console, help & legal pages
src/app/api/        route handlers (use withApi + ok/fail); api/auth/[...all], api/v1/*, api/webhooks/*, api/cron/*
src/proxy.ts        optimistic "has session cookie" redirect only (Next 16's middleware)
src/server/         server-only: env, db/, auth/, rbac/, audit/, modules/, repositories.ts, storage.ts, mail.ts
worker/             standalone SLA escalation & maintenance worker (worker/index.mts)
src/test/           Vitest helpers: global mongod, setupTestDb(), testContext()
scripts/            dev-db.mts (local Mongo), e2e-db.mts (Playwright's Mongo)
src/components/     the reusable kit (see "Component kit" below)
src/lib/api/        API envelope: errors.ts, response.ts (server), client.ts (browser)
src/lib/utils.ts    cn()
e2e/                Playwright specs
docs/trackers/      phase, feature, bug and test trackers (read README.md there first)
phase.md            the product plan the trackers follow
```

## Getting started

1. `pnpm install`, then `cp .env.example .env.local` and set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).
2. `pnpm db:dev` in one terminal, `pnpm dev` in another. Sign up at `/sign-up`.
3. Put your email in `SUPER_ADMIN_EMAILS` to reach `/super`.

## Backend rules (multi-tenancy, phase.md §4.3)

- **Never touch MongoDB directly.** Use the repositories in `src/server/repositories.ts`: `branches.forTenant(ctx).find(...)`. They AND `tenantId` (and branch scope) into every query and stamp it on inserts. ESLint blocks importing `@/server/db/client` outside `src/server/{db,auth,audit}` and `modules/tenants.ts`.
- **A new collection** = `defineRepository()` in `repositories.ts`, indexes in `db/indexes.ts` (starting with `tenantId`), and a factory in `src/server/isolation.int.test.ts`. That test fails until you add one.
- **Every service function takes a `TenantContext`** and starts with `assertCan(ctx, "perm:name", { branchId })`. Check permissions, never role names. Hiding UI is not security.
- **Every mutation writes `appendAudit(ctx, {...}, { session })` inside the same `withTransaction`.** The audit log is append-only and hash-chained; `verifyChain` must stay green.
- **Validate input with `parseInput(schema, raw)`.** It throws `ApiError("VALIDATION")` with field errors that `FormField` renders under each input.
- **Granting access:** `canGrantRoles` stops anyone giving more than they hold; keep that check on any new role or permission UI.
- **Lookups that resolve a tenant** (invite tokens, later QR codes) use `repo.unscoped()` with a hashed or unguessable key, never a client-supplied tenantId.

## Pages, actions and Cache Components

- `cacheComponents` is on. Anything that reads the session, cookies, params or searchParams must sit inside `<Suspense>`. The `(app)` and `(auth)` layouts already wrap `{children}`. Standalone pages render a static shell plus `<Suspense fallback={<PageSkeleton/>}>` around an async body.
- Pages call `requireTenantContext()` (or `requireUser()` / `requireSuperAdmin()`) themselves; `src/proxy.ts` only does the optimistic cookie check.
- Server actions: `"use server"` files next to the route, returning `runAction(async () => { ... revalidatePath(...) })`. That gives the `ActionState` envelope. Return plain data, not ObjectIds. Forms use `useActionState` plus `FormField`, `FormSelect`, `CheckboxGroup`, `FormMessage` and `SubmitButton` from `@/components/form`.
- Dialog forms mount fresh on open (`{open && <Form onDone=…/>}`) and close when `state.ok`. Destructive one-off actions use `useSweetAlert().fire({ onConfirm })` and throw on failure, so the alert shows the error.
- Pure logic shared by server and client (location tree rules, time zones, `safeNext`) goes in `src/lib`, never `src/server`.
- Public pages that only read route params (`/f/[code]`, `/t/[token]`, `/invite/[token]`) must `await connection()` before data access, or Next tries to prerender them.
- **Forms that submit from JS** (`onSubmit` + `preventDefault`, e.g. Better Auth calls, the public form) must set `method="post"` and keep submit disabled until `useHydrated()` is true. Otherwise an early tap does a GET and leaks fields into the URL (BUG-005). Server-action forms are safe by default.
- Style links as buttons with `buttonVariants()` (it returns merged classes). To add classes, use `cn(buttonVariants(...), "...")`.

## Public intake (phase.md §6.4)

- The QR short code alone resolves the tenant: `resolvePublicQr(code)` walks code → tenant → branch → location, and any inactive link makes it a dead code. Never accept a tenant or location id from the public form.
- `submitFeedback` rate-limits by IP and by code (Mongo fixed window, `src/server/rate-limit.ts`), checks Turnstile when `TURNSTILE_SECRET_KEY` is set, and merges a repeat report (same location and category, open, within 2 h) into the open ticket.
- Tracking and invite tokens are stored as sha256 hashes only; the raw token exists only in the link.
- Services take config as arguments (limits, Turnstile secret), and the server action reads `env()`. That keeps services testable without env vars.

## Workflow: trackers and TDD

- Work is tracked in `docs/trackers/`: `PHASES.md`, `FEATURES.md` (`F-<phase>.<n>`), `BUGS.md`
  (`BUG-nnn`) and `TESTS.md` (`T-<area>-<n>`). Update them in the same change as the code.
- **Test first.** For a feature: write the failing Vitest and/or Playwright tests, run them and
  see them fail, then implement. For a bug: write a test that reproduces it, then fix it, and
  log it in `BUGS.md` with that test.
- Unit and component tests sit next to the code as `*.test.ts(x)`. Pure logic runs in Node
  (`// @vitest-environment node`), components in jsdom.

## Code style

- Prettier settings: no semicolons, double quotes, trailing commas, 100-character lines. Don't hand-format; run `pnpm format`.
- Use the `@/` import alias, never long relative paths.
- Use `cn()` for conditional classes. Put Tailwind classes in `cn()` or `cva()` so Prettier sorts them.
- Default to Server Components. Add `"use client"` only for state, effects or browser APIs, and keep client components small (see `theme-toggle.tsx`).
- Write comments that explain why, not what.

---

## Design system

The tokens are in `src/app/globals.css`. Open `/design` to see every token and component rendered. The signed-in app follows the Cancer Healer Center dashboard sample: a deep indigo sidebar, soft gray page, slightly deeper gray cards, pastel icon tiles and a rose trend line.

**Indigo is for action and the sidebar, emerald is for success, and soft grays carry the page.** Pastel tones (`indigo`, `emerald`, `rose`, `amber`, `cyan`, `orange`, `sky`) tint icon tiles and progress bars via `components/cards/tone.ts`.

### Colour tokens

| Token                                       | Light                              | Dark          | Use it for                                                   |
| ------------------------------------------- | ---------------------------------- | ------------- | ------------------------------------------------------------ |
| `background/foreground`                     | gray-50 / gray-950                 | black / white | the page (`card` is gray-100, popovers are white)            |
| `primary`                                   | indigo-800                         | indigo-500    | the main action on a screen: CTAs, selection                 |
| `primary-hover`                             | indigo-900                         | indigo-400    | hover and pressed state of primary                           |
| `secondary`                                 | indigo-100                         | indigo-950    | soft actions: Refresh, "New" badges, a second CTA            |
| `inverse` (`bg-foreground text-background`) | black                              | white         | strong neutral buttons and badges                            |
| `muted`                                     | gray-200                           | gray-900      | quiet surfaces, table headers, skeletons                     |
| `muted-foreground`                          | gray-600                           | gray-400      | subtitles, captions, helper text                             |
| `accent`                                    | indigo-50                          | indigo-950    | hover background for menus and list items                    |
| `success`                                   | emerald-700                        | emerald-500   | confirmed states and success text (links use `text-primary`) |
| `warning`                                   | orange-600                         | orange-500    | something needs attention soon                               |
| `destructive`                               | rose-600                           | rose-500      | errors, delete                                               |
| `info`                                      | sky-600                            | sky-500       | neutral tips                                                 |
| `border` / `input`                          | gray-200 / gray-300                | white 12%     | every border                                                 |
| `ring`                                      | indigo-600                         | indigo-400    | focus indicators                                             |
| `chart-1…5`                                 | rose, indigo, emerald, amber, gray |               | charts (first series is the rose trend line)                 |
| `sidebar-*`                                 | indigo-800, white text             | indigo-950    | the signed-in sidebar and mobile drawer                      |

- Every colour has a `-foreground` pair. Always put `bg-X` together with `text-X-foreground`.
- Warning is orange, not amber, on purpose, so it stays distinct from the amber rating tile.
- Dark mode is the `.dark` class on `<html>` (`@custom-variant dark`). Both themes are defined in `:root` and `.dark` in globals.css.

### Rules

1. **Use semantic tokens first.** Write `bg-primary`, `text-muted-foreground` and `border-border`, not `bg-indigo-800`. Use raw shades only for one-off decoration.
2. **The palette is restricted.** `@theme` resets `--color-*`. Only white, black, gray (neutral values), indigo, emerald, cyan, rose, amber, orange, red and sky exist. A class like `bg-blue-500` or `text-zinc-400` produces no CSS at all, and a test enforces this. To add a colour, add it to `@theme` on purpose and document it here.
3. **No shadows.** The `shadow-*`, `drop-shadow-*` and `text-shadow-*` utilities are disabled. Show depth with a `border`, a tint (`bg-muted`, `bg-warning/10`) or `backdrop-blur`. `ring-*` still works.
4. **Use one primary button per view.** Further actions use `outline`, `ghost` or `secondary`.
5. **Status tints use opacity.** Soft surfaces use `bg-warning/10 text-warning border-warning/30`. The `Badge` and `Alert` variants already do this, so use them rather than re-creating them.
6. **Focus must always be visible.** Plain elements get a global 2px indigo outline. shadcn controls use an indigo `ring`. Never remove both.
7. **Mind contrast.** Indigo-800 with white text has strong contrast everywhere. For brand-coloured text and links use `text-primary`; keep `text-success` for confirmed states only. Amber always gets black or amber-700 text.
8. **Mobile first.** Use a 16px side gutter (`px-4`, then `sm:px-6`), never scroll sideways, and make touch targets at least 44px (`size="xl"`, `size="icon-xl"`).

### Type

- Geist Sans for everything, Geist Mono for codes, IDs and token names.
- Headings use `font-bold tracking-tight text-balance`. Section titles use `text-[clamp(1.85rem,6.4vw,3rem)] leading-[1.08]`, and page heroes use `text-[clamp(2.25rem,7vw,4rem)] leading-[1.05]`.
- Body text is 16px with `leading-relaxed`. Keep lines under about 70 characters (`max-w-prose`). Subtitles use `text-muted-foreground text-pretty`.
- The eyebrow label above section titles is `<Eyebrow>` from `@/components/section`: uppercase, `tracking-[0.14em]`, `text-primary`, with indigo rules on each side.
- Numbers in stats and tables use `tabular-nums`.

### Shape and spacing

- Radius base is `--radius: 0.625rem`. Inputs and small buttons use `rounded-lg`. Cards, alerts and the `xl` CTA use `rounded-xl`. Featured cards use `rounded-2xl`. Pills and badges use `rounded-full` or `rounded-4xl`.
- Sections use `px-4 py-14 sm:px-6 sm:py-20 lg:py-24` with content in `mx-auto max-w-6xl`. Use `<Section eyebrow title subtitle>` rather than rebuilding it.
- Cards use `border` (or the shadcn `ring-1 ring-foreground/10`) on `bg-card`. No shadows.

### Component variants

| Component                | Variants                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                 | `default` (indigo), `secondary` (soft indigo), `inverse`, `outline`, `ghost`, `link`, `success`, `warning`, `destructive`                        |
| Button sizes             | `xs`, `sm`, `default`, `lg`, `xl` (hero CTA, 44px), `icon`, `icon-xs`, `icon-sm`, `icon-lg`, `icon-xl` (44px)                                    |
| `Badge`                  | `default`, `secondary`, `inverse`, `success`, `warning`, `destructive`, `info`, `muted`, `outline`, `ghost`, `link` (status ones are soft tints) |
| `Alert`                  | `default`, `success`, `warning`, `destructive`, `info` (tinted border and background, icon in the status colour)                                 |
| `Card`, `Input`, `Label` | shadcn defaults, themed by tokens                                                                                                                |

Icons inside buttons take `data-icon="inline-start"` or `"inline-end"` for correct padding.

After adding a shadcn component, check it for hard-coded colours (`bg-black/…`, `text-white`, palette shades) and `shadow-*`. Swap them for tokens, then add its variants to the `/design` page.

### Component kit

Reuse these before building anything new. Each one has tests next to it and a demo on `/design`.

| Need                    | Use                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button with async work  | `<Button loading>` (spinner, `aria-busy`, blocks clicks)                                                                                                                |
| Icon                    | `<Icon name="sla" />` from `@/components/icons`; domain names, not raw lucide imports                                                                                   |
| KPI tile                | `<StatCard label value delta lowerIsBetter featured icon />` (`@/components/cards/…`)                                                                                   |
| Panel for a chart/table | `<PanelCard title description action footer>`                                                                                                                           |
| Empty list              | `<EmptyState icon title description action />`                                                                                                                          |
| Page top                | `<PageHeader title description breadcrumbs actions />`; `<PageSkeleton />` as Suspense fallback                                                                         |
| Form fields             | `FormField`, `FormSelect`, `FormTextarea`, `CheckboxGroup`, `RadioCards`, `RatingInput`, `FormMessage`, `SubmitButton` (`@/components/form`)                            |
| Copy / print            | `<CopyButton text />`, `<PrintButton />`                                                                                                                                |
| Page trail              | `<Breadcrumbs items={[{label, href}]} maxItems />` (collapses long trails)                                                                                              |
| Form/detail dialog      | `<Modal trigger title description footer size>` or controlled with `open`/`onOpenChange`                                                                                |
| Confirm / result popup  | `const swal = useSweetAlert()`; `swal.fire({tone, title, text, confirmText, cancelText, onConfirm})` or `swal.confirm(...)`. The provider is already in the root layout |
| Charts                  | `AreaTrend`, `BarCompare`, `DonutChart` from `@/components/charts/…`; colours come from `--chart-1…5` via `chartConfig()`                                               |
| API route               | `export const GET = withApi(async () => ok(data, { meta: pageMeta(...) }))`; throw `new ApiError("NOT_FOUND", "…")`                                                     |
| API call from client    | `const res = await apiFetch<T>(url, { method, json })`, then `if (!res.ok) res.error.code`; `unwrap(res)` throws                                                        |

Envelope: `{ ok: true, data, meta? }` or `{ ok: false, error: { code, message, details? } }`.
Codes and HTTP statuses are in `src/lib/api/errors.ts`. Unknown errors become `INTERNAL`, and
their messages are never sent to the client.

Gotcha (BUG-001): tailwind-merge reads `bg-dots`, `bg-glow` and `bg-glow-amber` as background
colours, so inside one `cn()` call they knock out `bg-card` and the like. Put them on their own
element.

### Utilities (in globals.css)

- `.bg-dots`: a fine dot grid for heroes and CTAs. Set `--dot` to recolour it on dark surfaces.
- `.bg-glow` and `.bg-glow-amber`: a soft radial indigo or amber light at the top of an element.
- `.edge-primary`: a gradient edge for a featured card. Wrap the card in an element with `rounded-2xl p-px`.
- `.reveal`: the element rises in as it scrolls into view. CSS only, and it respects `prefers-reduced-motion`.
- `animate-fade-in`.

---

## Testing

### Unit and component (Vitest)

- Config: `vitest.config.mts` and `vitest.setup.ts` (jest-dom matchers, cleanup, ResizeObserver
  and matchMedia stubs). Globals are off, so import `describe`, `it` and `expect` from `vitest`.
- Use Testing Library with `userEvent` and role-based queries. jsdom has no layout, so charts are
  tested through their screen-reader data tables, and their real rendering in e2e.

### Integration (Vitest + real MongoDB)

- `*.int.test.ts` files run in the `integration` project. `src/test/global-db.ts` starts one mongod replica set (mongodb-memory-server); `setupTestDb()` gives each file its own database and clears it before each test.
- Build contexts with `testContext({ tenantId, ...resolveAccess({ roles, branchIds }, []) })` to test as a specific role.

### End-to-end (Playwright and Chromium)

- Config: `playwright.config.ts`. Specs: `e2e/*.spec.ts`. It runs two projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7, also Chromium).
- Playwright also starts a throwaway MongoDB on **27999** (`scripts/e2e-db.mts`) and passes test env vars to the server (`AUTH_RATE_LIMIT=off`, per-project super-admin emails).
- Stop leftover servers **by port** (`kill $(lsof -ti :3210 -ti :27999)`). Next renames its process to `next-server`, so `pkill -f "next start"` misses it, and Playwright then silently reuses the stale build.
- To test "before hydration", block `**/_next/static/chunks/**`. With JavaScript off, Suspense content never streams in.
- Next 16 keeps visited pages mounted but hidden, so target fields with `.filter({ visible: true })`. Next's route announcer is also `role="alert"`, so filter alerts by text.
- Tests run against a **production build on port 3210** (`E2E_PORT` overrides it). It isn't the dev server, for two reasons: Next allows only one `next dev` per project folder, and other projects on this machine often hold port 3000.
- Locally, an already-running server on 3210 is reused. On CI (`CI=1`) it always builds fresh, retries twice and uses the GitHub reporter.
- Artifacts (`test-results/`, `playwright-report/`) are gitignored. Screenshots are saved on failure, and traces on the first retry.
- `e2e/design-system.spec.ts` guards the design system: brand colours on buttons, colours outside the palette compiling to nothing, no sideways scroll, the dark toggle, visible keyboard focus, and the home page loading with no console errors.
- `e2e/components.spec.ts` covers the kit in a real browser (modal focus, sweet alert flows, chart colours) and the `/api/health` envelope.
- Write new tests with role-based locators (`getByRole`, `getByLabel`). To compare colours, compare against a rendered palette swatch rather than hard-coding oklch or rgb strings.
- If browsers are missing, run `pnpm exec playwright install chromium`.

## Git

- `.gitignore` covers Next.js defaults, `.env*` (except `.env.example`), editor files except shared `.vscode/settings.json` and `extensions.json`, logs, and Playwright output.
- Don't commit `.env` files or secrets.
