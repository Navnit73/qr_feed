# QR Feed

A Next.js app with a lime, amber, white and black design system. Read this file before changing UI.

@AGENTS.md

## Stack

- **Next.js 16** (App Router, Turbopack, `src/` dir), **React 19**, **TypeScript**. Next 16 has breaking changes, so check `node_modules/next/dist/docs/` before using an API from memory (see AGENTS.md).
- **Tailwind CSS v4**, configured in CSS in `src/app/globals.css`. There is no `tailwind.config`.
- **shadcn/ui** in the `base-nova` style, built on `@base-ui/react` (not Radix). Components live in `src/components/ui/`. Class merging uses the `cn` package, re-exported from `@/lib/utils`.
- **lucide-react** for icons, **Geist** and **Geist Mono** for fonts.
- **pnpm** is the package manager. Don't use npm or yarn.
- **Prettier** with Tailwind class sorting, and **ESLint** (Next config plus `eslint-config-prettier`).
- **Playwright** runs end-to-end tests in Chromium.

## Commands

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm dev`             | Dev server (port 3000, or the next free port)                  |
| `pnpm build`           | Production build                                               |
| `pnpm lint`            | ESLint                                                         |
| `pnpm format`          | Prettier writes all files                                      |
| `pnpm format:check`    | Prettier checks only (use in CI)                               |
| `pnpm test:e2e`        | Builds, serves on :3210, runs Playwright on desktop and mobile |
| `pnpm test:e2e:ui`     | Playwright interactive UI mode                                 |
| `pnpm test:e2e:report` | Opens the last HTML test report                                |

Add a shadcn component with `pnpm dlx shadcn@latest add <name>`.

Before calling work done, run `pnpm format && pnpm lint && pnpm test:e2e`.

## Layout

```
src/app/            routes (App Router). /design is the live design-system reference
src/app/globals.css design tokens, palette, base styles, utilities
src/components/ui/  shadcn components (ours to edit; they carry our variants)
src/components/     app components: section.tsx (Section, Eyebrow), theme-toggle.tsx
src/lib/utils.ts    cn()
e2e/                Playwright specs
```

## Code style

- Prettier settings: no semicolons, double quotes, trailing commas, 100-character lines. Don't hand-format; run `pnpm format`.
- Use the `@/` import alias, never long relative paths.
- Use `cn()` for conditional classes. Put Tailwind classes in `cn()` or `cva()` so Prettier sorts them.
- Default to Server Components. Add `"use client"` only for state, effects or browser APIs, and keep client components small (see `theme-toggle.tsx`).
- Write comments that explain why, not what.

---

## Design system

The tokens are in `src/app/globals.css`. Open `/design` to see every token and component rendered. The look follows the sibling project `../mymacstorage.com`.

**Lime is for action, amber is for attention, and white and black carry the page.**

### Colour tokens

| Token                                       | Light                            | Dark          | Use it for                                                   |
| ------------------------------------------- | -------------------------------- | ------------- | ------------------------------------------------------------ |
| `background/foreground`                     | white / black                    | black / white | the page                                                     |
| `primary`                                   | lime-600                         | lime-600      | the main action on a screen: CTAs, selection                 |
| `primary-hover`                             | lime-700                         | lime-500      | hover and pressed state of primary                           |
| `secondary`                                 | amber-400                        | amber-400     | highlights: "New" or "Featured" badges, promos, a second CTA |
| `inverse` (`bg-foreground text-background`) | black                            | white         | strong neutral buttons and badges                            |
| `muted`                                     | gray-100                         | gray-900      | quiet surfaces, table headers, skeletons                     |
| `muted-foreground`                          | gray-500                         | gray-400      | subtitles, captions, helper text                             |
| `accent`                                    | gray-100                         | gray-900      | hover background for menus and list items                    |
| `success`                                   | lime-700                         | lime-500      | confirmed states, success text, links                        |
| `warning`                                   | orange-600                       | orange-500    | something needs attention soon                               |
| `destructive`                               | red-600                          | red-500       | errors, delete                                               |
| `info`                                      | sky-600                          | sky-500       | neutral tips                                                 |
| `border` / `input`                          | gray-200                         | white 12%     | every border                                                 |
| `ring`                                      | lime-600                         | lime-500      | focus indicators                                             |
| `chart-1…5`                                 | lime and amber shades, then gray |               | charts                                                       |

- Every colour has a `-foreground` pair. Always put `bg-X` together with `text-X-foreground`.
- Warning is orange, not amber, on purpose. Amber is the brand highlight, so an amber warning would look like a promo.
- Dark mode is the `.dark` class on `<html>` (`@custom-variant dark`). Both themes are defined in `:root` and `.dark` in globals.css.

### Rules

1. **Use semantic tokens first.** Write `bg-primary`, `text-muted-foreground` and `border-border`, not `bg-lime-600`. Use raw shades only for one-off decoration.
2. **The palette is restricted.** `@theme` resets `--color-*`. Only white, black, gray (neutral values), lime, amber, orange, red and sky exist. A class like `bg-blue-500` or `text-zinc-400` produces no CSS at all, and a test enforces this. To add a colour, add it to `@theme` on purpose and document it here.
3. **No shadows.** The `shadow-*`, `drop-shadow-*` and `text-shadow-*` utilities are disabled. Show depth with a `border`, a tint (`bg-muted`, `bg-warning/10`) or `backdrop-blur`. `ring-*` still works.
4. **Use one primary button per view.** Further actions use `outline`, `ghost` or `secondary`.
5. **Status tints use opacity.** Soft surfaces use `bg-warning/10 text-warning border-warning/30`. The `Badge` and `Alert` variants already do this, so use them rather than re-creating them.
6. **Focus must always be visible.** Plain elements get a global 2px lime outline. shadcn controls use a lime `ring`. Never remove both.
7. **Mind contrast.** Lime-600 with white text is about 3:1. That's acceptable on buttons with medium-weight text at 14px or larger, never for small body text. For lime text on white, use `text-success` (lime-700). Amber always gets black text.
8. **Mobile first.** Use a 16px side gutter (`px-4`, then `sm:px-6`), never scroll sideways, and make touch targets at least 44px (`size="xl"`, `size="icon-lg"`).

### Type

- Geist Sans for everything, Geist Mono for codes, IDs and token names.
- Headings use `font-bold tracking-tight text-balance`. Section titles use `text-[clamp(1.85rem,6.4vw,3rem)] leading-[1.08]`, and page heroes use `text-[clamp(2.25rem,7vw,4rem)] leading-[1.05]`.
- Body text is 16px with `leading-relaxed`. Keep lines under about 70 characters (`max-w-prose`). Subtitles use `text-muted-foreground text-pretty`.
- The eyebrow label above section titles is `<Eyebrow>` from `@/components/section`: uppercase, `tracking-[0.14em]`, `text-success`, with lime rules on each side.
- Numbers in stats and tables use `tabular-nums`.

### Shape and spacing

- Radius base is `--radius: 0.625rem`. Inputs and small buttons use `rounded-lg`. Cards, alerts and the `xl` CTA use `rounded-xl`. Featured cards use `rounded-2xl`. Pills and badges use `rounded-full` or `rounded-4xl`.
- Sections use `px-4 py-14 sm:px-6 sm:py-20 lg:py-24` with content in `mx-auto max-w-6xl`. Use `<Section eyebrow title subtitle>` rather than rebuilding it.
- Cards use `border` (or the shadcn `ring-1 ring-foreground/10`) on `bg-card`. No shadows.

### Component variants

| Component                | Variants                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                 | `default` (lime), `secondary` (amber), `inverse`, `outline`, `ghost`, `link`, `success`, `warning`, `destructive`                                |
| Button sizes             | `xs`, `sm`, `default`, `lg`, `xl` (hero CTA, 44px), `icon`, `icon-xs`, `icon-sm`, `icon-lg`                                                      |
| `Badge`                  | `default`, `secondary`, `inverse`, `success`, `warning`, `destructive`, `info`, `muted`, `outline`, `ghost`, `link` (status ones are soft tints) |
| `Alert`                  | `default`, `success`, `warning`, `destructive`, `info` (tinted border and background, icon in the status colour)                                 |
| `Card`, `Input`, `Label` | shadcn defaults, themed by tokens                                                                                                                |

Icons inside buttons take `data-icon="inline-start"` or `"inline-end"` for correct padding.

After adding a shadcn component, check it for hard-coded colours (`bg-black/…`, `text-white`, palette shades) and `shadow-*`. Swap them for tokens, then add its variants to the `/design` page.

### Utilities (in globals.css)

- `.bg-dots`: a fine dot grid for heroes and CTAs. Set `--dot` to recolour it on dark surfaces.
- `.bg-glow` and `.bg-glow-amber`: a soft radial lime or amber light at the top of an element.
- `.edge-lime`: a gradient edge for a featured card. Wrap the card in an element with `rounded-2xl p-px`.
- `.reveal`: the element rises in as it scrolls into view. CSS only, and it respects `prefers-reduced-motion`.
- `animate-fade-in`.

---

## Testing (Playwright and Chromium)

- Config: `playwright.config.ts`. Specs: `e2e/*.spec.ts`. It runs two projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7, also Chromium).
- Tests run against a **production build on port 3210** (`E2E_PORT` overrides it). It isn't the dev server, for two reasons: Next allows only one `next dev` per project folder, and other projects on this machine often hold port 3000.
- Locally, an already-running server on 3210 is reused. On CI (`CI=1`) it always builds fresh, retries twice and uses the GitHub reporter.
- Artifacts (`test-results/`, `playwright-report/`) are gitignored. Screenshots are saved on failure, and traces on the first retry.
- `e2e/design-system.spec.ts` guards the design system: brand colours on buttons, colours outside the palette compiling to nothing, no sideways scroll, the dark toggle, visible keyboard focus, and the home page loading with no console errors.
- Write new tests with role-based locators (`getByRole`, `getByLabel`). To compare colours, compare against a rendered palette swatch rather than hard-coding oklch or rgb strings.
- If browsers are missing, run `pnpm exec playwright install chromium`.

## Git

- `.gitignore` covers Next.js defaults, `.env*` (except `.env.example`), editor files except shared `.vscode/settings.json` and `extensions.json`, logs, and Playwright output.
- Don't commit `.env` files or secrets.
