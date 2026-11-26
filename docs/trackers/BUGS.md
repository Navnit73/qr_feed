# Bug tracker

Every bug gets a row, and every fix ships with a test that failed before it and passes after it.
Severity: **S1** data leak, data loss or outage · **S2** a core flow is broken · **S3** a
workaround exists · **S4** cosmetic.

## Open

| ID  | Title | Sev | Found | Feature | Status | Owner |
| --- | ----- | --- | ----- | ------- | ------ | ----- |
| —   |       |     |       |         |        |       |

## Fixed

| ID      | Title                                                                  | Sev | Found      | Fixed      | Feature      | Regression test |
| ------- | ---------------------------------------------------------------------- | --- | ---------- | ---------- | ------------ | --------------- |
| BUG-001 | Featured StatCard renders grey, not white                              | S4  | 2026-11-26 | 2026-11-26 | F-0.3        | T-UI-2          |
| BUG-002 | "Asia/Kolkata" missing from time-zone pickers                          | S2  | 2026-11-26 | 2026-11-26 | F-1.1, F-1.5 | T-LIB-3         |
| BUG-003 | Blank feedback said "expected string" instead of asking for a category | S3  | 2026-11-26 | 2026-11-26 | F-2.3        | T-INT-1         |
| BUG-004 | Outline links styled as buttons had no border                          | S4  | 2026-11-26 | 2026-11-26 | F-0.3        | T-UI-1          |
| BUG-005 | **Password in the URL** if sign-in/up was submitted before hydration   | S1  | 2026-11-26 | 2026-11-26 | F-1.2, F-2.3 | T-E2E-4         |
| BUG-006 | Concurrent onboarding with identical org name failed with `E11000`     | S2  | 2026-11-26 | 2026-11-26 | F-1.1        | T-ORG-1         |

---

## BUG-001 · Featured StatCard renders grey, not white

- **Steps:** open `/design` → Stat cards. The featured "Tickets this month" card.
- **Expected:** white card surface with an amber glow inside the lime edge.
- **Actual:** grey surface; the `edge-lime` gradient showed through.
- **Cause:** `cn()` (tailwind-merge) treats the custom `bg-glow-amber` utility as a background
  colour and dropped `bg-card` from the same class list.
- **Fix:** the glow sits on its own layer inside an opaque `bg-card` wrapper
  (`src/components/cards/stat-card.tsx`).
- **Test:** `cards.test.tsx` › "keeps an opaque card surface inside the featured edge".
- **Watch for:** the same clash anywhere `bg-dots`, `bg-glow` or `bg-glow-amber` shares a
  `cn()` call with a `bg-*` colour.

---

## BUG-002 · "Asia/Kolkata" missing from time-zone pickers

- **Steps:** onboarding or Add branch → Time zone.
- **Expected:** Asia/Kolkata listed (the launch market's zone).
- **Actual:** only the legacy alias Asia/Calcutta. Found by the Phase 1 e2e run (T-E2E-4).
- **Cause:** `Intl.supportedValuesOf("timeZone")` returns ICU's legacy names.
- **Fix:** `src/lib/time-zones.ts` maps legacy names to current IANA names, for both the list
  and the browser's guessed zone.
- **Test:** `src/lib/time-zones.test.ts` (T-LIB-3).

---

## BUG-003 · Unfriendly message on a blank feedback form

- **Actual:** "Invalid input: expected string, received undefined" under the categories.
- **Cause:** the friendly message was on a `.refine()`, which never runs when the field is missing.
- **Fix:** give `z.string()` itself the message (`src/server/modules/intake.ts`).
- **Test:** `intake.int.test.ts` › "asks for a category in plain words when none is picked".

## BUG-004 · Outline links lost their border

- **Steps:** branch page "Print QR sheet", homepage "See how it works".
- **Cause:** `buttonVariants()` returned raw cva classes, so the base `border-transparent` and the
  outline `border-border` both applied and the transparent one won. `<Button>` merged them;
  links styled with `buttonVariants()` didn't.
- **Fix:** `buttonVariants()` now returns tailwind-merged classes.
- **Test:** `button.test.tsx` › "buttonVariants()".

## BUG-005 · Credentials in the URL before hydration (security)

- **Steps:** on a slow connection, type email + password and submit before the JS loads.
- **Actual:** the browser did a native GET: `/sign-in?email=…&password=…`, which ends up in
  history and in proxy and server logs.
- **Cause:** JS-submitted forms (`onSubmit` + `preventDefault`) had no `method`, so the browser
  default (GET) applied until React hydrated.
- **Fix:** those forms use `method="post"` and keep the submit button disabled until hydrated
  (`useHydrated()`). Applies to the auth forms and the public feedback form.
- **Test:** `phase1.spec.ts` › "before the page is interactive" (blocks the JS bundles).
- **Rule:** any form that submits from JS must do both. Server-action forms are safe by default.

## BUG-006 · Concurrent onboarding hit duplicate slug (`E11000`)

- **Steps:** two users onboard simultaneously with the exact same organisation name (caught by parallel Playwright workers in `dashboard.spec.ts`).
- **Expected:** both organisations succeed with unique slugs.
- **Actual:** one succeeded and the other failed with `MongoServerError: E11000 duplicate key error ... index: slug_1`.
- **Cause:** `uniqueSlug()` checked availability with `findOne` before the transaction inserted, creating a TOCTOU race.
- **Fix:** `createOrganization()` (`src/server/modules/onboarding.ts`) retries the transaction with a fresh random suffix when MongoDB throws `E11000`.
- **Test:** `organization.int.test.ts` › "handles concurrent onboarding with identical organisation names without E11000".

---

## Template

Copy this for each new bug, and add a row to **Open**.

```md
## BUG-nnn · <short title>

- **Steps:**
- **Expected:**
- **Actual:**
- **Env:** browser / device / tenant / build
- **Cause:**
- **Fix:**
- **Test:** <file> › "<test name>" (written first, failed before the fix)
```
