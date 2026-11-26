import Link from "next/link"
import { Suspense } from "react"
import { Icon, type IconName } from "@/components/icons"
import { Skeleton } from "@/components/skeleton"

/** A sample of the product, so the panel shows what signing in leads to (illustrative data). */
const preview: {
  icon: IconName
  title: string
  meta: string
  tag: string
  tagClass: string
}[] = [
  {
    icon: "qr",
    title: "Washroom F2 · Cleanliness",
    meta: "Scanned 2 min ago · TKT-2026-000123",
    tag: "New",
    tagClass: "bg-sidebar-foreground text-sidebar",
  },
  {
    icon: "escalate",
    title: "Lobby · Air conditioning",
    meta: "No response in 3 h · escalated to supervisor",
    tag: "L2",
    tagClass: "bg-orange-200 text-orange-900",
  },
  {
    icon: "verify",
    title: "Cafeteria · Spill on floor",
    meta: "Fixed, verified and rated 5 of 5",
    tag: "Closed",
    tagClass: "bg-emerald-200 text-emerald-900",
  },
]

const stats = [
  { value: "5 min", label: "to set up a floor" },
  { value: "L1 → L3", label: "auto escalation" },
  { value: "100%", label: "audit trail" },
]

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/sign-in"
      className={`flex items-center gap-2.5 text-lg font-bold tracking-tight ${className ?? ""}`}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Icon name="qr" className="size-5" />
      </span>
      QR Feed
    </Link>
  )
}

/**
 * Half-and-half auth layout for sign-in, sign-up and password pages: a flat brand panel on the
 * left (large screens only) and a flat form panel on the right. Mobile shows the form alone.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between gap-10 bg-sidebar p-12 text-sidebar-foreground lg:flex xl:p-16">
        <Link
          href="/sign-in"
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Icon name="qr" className="size-5" />
          </span>
          QR Feed
        </Link>

        <div>
          <p className="mb-4 text-sm font-semibold tracking-[0.14em] text-sidebar-foreground/60 uppercase">
            Feedback to resolution
          </p>
          <h2 className="max-w-lg text-4xl leading-[1.1] font-bold tracking-tight text-balance xl:text-5xl">
            Every QR scan becomes a resolved ticket.
          </h2>
          <p className="mt-4 max-w-md text-lg text-pretty text-sidebar-foreground/75">
            Guests report in seconds. Your team fixes it on time, and every step stays on the
            record.
          </p>

          <ul className="mt-10 max-w-lg space-y-3" aria-label="Product preview">
            {preview.map((p) => (
              <li
                key={p.title}
                className="flex items-center gap-4 rounded-xl bg-sidebar-accent p-4 ring-1 ring-sidebar-foreground/10"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sidebar-foreground/15">
                  <Icon name={p.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.title}</p>
                  <p className="truncate text-sm text-sidebar-foreground/70">{p.meta}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.tagClass}`}>
                  {p.tag}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid max-w-lg grid-cols-3 gap-6 border-t border-sidebar-border pt-6">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xl font-bold tabular-nums">{s.value}</dt>
              <dd className="text-sm text-sidebar-foreground/65">{s.label}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="flex flex-col bg-background px-4 py-8 sm:px-8">
        <Logo className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            {/* Pages read the session and search params, which stream in at request time. */}
            <Suspense fallback={<Skeleton className="h-72" />}>{children}</Suspense>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          {" · "}
          <Link href="/help" className="hover:text-foreground hover:underline">
            Help
          </Link>
        </p>
      </div>
    </main>
  )
}
