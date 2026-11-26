# Trackers

Four linked markdown trackers. They live in the repo so every change to scope, a bug or a
test lands in the same commit as the code. The product plan they track is
[`phase.md`](../../phase.md).

| Tracker                    | Holds                                                         | ID format       |
| -------------------------- | ------------------------------------------------------------- | --------------- |
| [PHASES.md](PHASES.md)     | Phases 0 to 10: goal, exit criteria, status, progress         | `P0` … `P10`    |
| [FEATURES.md](FEATURES.md) | Every feature, grouped by phase, with the tests that prove it | `F-<phase>.<n>` |
| [BUGS.md](BUGS.md)         | Every bug, with its regression test                           | `BUG-<nnn>`     |
| [TESTS.md](TESTS.md)       | Every test suite, what it covers, and planned critical tests  | `T-<area>-<n>`  |

The IDs link the trackers: a feature lists its test IDs, a bug names the test that guards it,
and a test lists the features or bugs it covers. Put the ID in commit messages too
(`feat(F-2.3): public feedback form`, `fix(BUG-001): …`).

## Status

| Mark | Meaning                                      |
| ---- | -------------------------------------------- |
| ⬜   | Not started                                  |
| 🟨   | In progress                                  |
| 🧪   | Tests written and failing (red)              |
| ✅   | Done: tests green and Definition of Done met |
| ⛔   | Blocked (say why in Notes)                   |

## Test-driven workflow

Every feature and every bug fix follows red, green, refactor.

1. **Pick** a feature from FEATURES.md and mark it 🟨.
2. **Red.** Write the tests first: unit or component tests next to the code
   (`*.test.ts(x)`, Vitest), plus a Playwright spec in `e2e/` for anything a user clicks
   through. Run them and watch them fail for the right reason. Add them to TESTS.md and
   mark the feature 🧪.
3. **Green.** Write the least code that makes them pass.
4. **Refactor** with the tests green. Reuse the kit in `src/components` (see CLAUDE.md).
5. **Bugs:** first write a test that reproduces the bug and fails, then fix it. Log the bug in
   BUGS.md with that test's ID.

### Which test where

| Layer     | Tool                         | Use it for                                                            |
| --------- | ---------------------------- | --------------------------------------------------------------------- |
| Unit      | Vitest (node)                | Pure logic: state machine, SLA maths, permissions, API envelope       |
| Component | Vitest + Testing Library     | A component's behaviour and accessibility, by role and label          |
| E2E       | Playwright (desktop, mobile) | Real browser: flows, focus, layout, colours, routes and API responses |

### Definition of Done

- [ ] Tests written first, now green: `pnpm test` and `pnpm test:e2e`
- [ ] `pnpm format && pnpm lint && pnpm typecheck` clean (`pnpm check` runs everything)
- [ ] Uses design tokens and kit components; new components shown on `/design`
- [ ] Works on mobile (no sideways scroll, 44px touch targets) and in dark mode
- [ ] Tenant-scoped data access, once Phase 0's data layer exists
- [ ] Trackers updated: feature ✅, tests listed, bugs logged
