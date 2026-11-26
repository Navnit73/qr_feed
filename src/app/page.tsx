import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Icon, type IconName } from "@/components/icons"
import { Eyebrow, Section } from "@/components/section"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ROADMAP, type PhaseStatus } from "@/lib/roadmap"
import { cn } from "@/lib/utils"
import { getCurrentUser } from "@/server/auth/session"

export const metadata: Metadata = {
  title: "QR Feed · Every QR scan becomes a resolved ticket",
  description:
    "QR feedback for hospitals, hotels, clinics, malls and factories. Guests scan and report; your team gets tickets with SLA escalation, RCA/CAPA and a tamper-evident audit trail.",
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "qr",
    title: "Scan",
    text: "A guest scans the QR code on a washroom, room or machine. No app, no login.",
  },
  {
    icon: "ticket",
    title: "Ticket",
    text: "Their report becomes a numbered ticket for that exact location, with a tracking link.",
  },
  {
    icon: "escalate",
    title: "Escalate",
    text: "If L1 doesn't act within the SLA, it climbs to L2, then L3, automatically.",
  },
  {
    icon: "rca",
    title: "Fix & find the cause",
    text: "Staff resolve it. Serious or repeat issues go through RCA and CAPA.",
  },
  {
    icon: "verify",
    title: "Verify",
    text: "A verifier checks the fix before it closes. Every step is logged.",
  },
]

const INDUSTRIES: { icon: IconName; name: string; example: string }[] = [
  { icon: "verify", name: "Hospitals", example: "Patient-safety and cleanliness reports" },
  { icon: "users", name: "Clinics", example: "Waiting time and staff feedback" },
  { icon: "branch", name: "Hotels", example: "Room, housekeeping and F&B issues" },
  { icon: "location", name: "Malls", example: "Washrooms, spills, lifts and parking" },
  { icon: "settings", name: "Manufacturing", example: "Hazards, breakdowns and near misses" },
]

const FEATURES: { icon: IconName; title: string; text: string; live: boolean }[] = [
  {
    icon: "location",
    title: "A QR code for every spot",
    text: "Map branches, floors and rooms, then print a sheet of labelled codes.",
    live: true,
  },
  {
    icon: "feedback",
    title: "A 20-second mobile form",
    text: "Category, rating, what happened, how urgent. Works on any phone.",
    live: true,
  },
  {
    icon: "audit",
    title: "Tamper-evident audit trail",
    text: "Every change is hash-chained, so edited or deleted entries are detected.",
    live: true,
  },
  {
    icon: "users",
    title: "Roles that match your org",
    text: "Org and branch admins, L1–L3 staff, verifiers and auditors, scoped by branch.",
    live: true,
  },
  {
    icon: "sla",
    title: "SLA escalation engine",
    text: "Business hours, holidays and time zones, with pre-breach warnings.",
    live: false,
  },
  {
    icon: "capa",
    title: "RCA & CAPA built in",
    text: "5 Whys, fishbone, corrective and preventive actions, effectiveness checks.",
    live: false,
  },
]

const STATUS: Record<
  PhaseStatus,
  { label: string; variant: "success" | "secondary" | "info" | "muted" }
> = {
  done: { label: "Done", variant: "success" },
  "in-progress": { label: "In progress", variant: "secondary" },
  next: { label: "Next", variant: "info" },
  planned: { label: "Planned", variant: "muted" },
}

export default function HomePage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-bold tracking-tight whitespace-nowrap"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Icon name="qr" className="size-5" />
            </span>
            QR Feed
          </Link>
          <nav
            aria-label="Sections"
            className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex"
          >
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
            <a href="#industries" className="hover:text-foreground">
              Industries
            </a>
            <a href="#roadmap" className="hover:text-foreground">
              Roadmap
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Suspense fallback={<GuestLinks />}>
              <HeaderLinks />
            </Suspense>
          </div>
        </div>
      </header>

      <main>
        <Hero />

        <Section
          id="how-it-works"
          eyebrow="From scan to verified fix"
          title="How it works"
          subtitle="One loop for every complaint, from the moment someone notices to the moment it's proven fixed."
        >
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex flex-col rounded-xl border bg-card p-5">
                <span className="mb-4 flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-success">
                    <Icon name={s.icon} className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="industries"
          eyebrow="Built for physical places"
          title="Wherever people notice problems first"
          className="bg-muted/40"
        >
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {INDUSTRIES.map((ind) => (
              <li key={ind.name} className="rounded-xl border bg-card p-5">
                <Icon name={ind.icon} className="size-5 text-success" />
                <p className="mt-3 font-semibold">{ind.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{ind.example}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="features"
          eyebrow="What you get"
          title="Feedback that drives the fix, not a spreadsheet"
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border bg-card p-5">
                <span className="flex items-center justify-between">
                  <Icon name={f.icon} className="size-5 text-success" />
                  <Badge variant={f.live ? "success" : "muted"}>{f.live ? "Live" : "Coming"}</Badge>
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="roadmap"
          eyebrow="Build progress"
          title="Roadmap"
          subtitle="Built in the open, phase by phase. Pilot beta lands with phase 5."
          className="bg-muted/40"
        >
          <ol className="mx-auto max-w-3xl space-y-2">
            {ROADMAP.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-start gap-4 rounded-xl border bg-card p-4",
                  p.status === "in-progress" && "border-secondary/60",
                )}
              >
                <span className="w-9 shrink-0 font-mono text-sm text-muted-foreground">{p.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-pretty text-muted-foreground">
                    {p.summary}
                  </span>
                </span>
                <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
              </li>
            ))}
          </ol>
        </Section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="bg-dots relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-foreground px-6 py-12 text-center text-background [--dot:color-mix(in_oklch,var(--background)_14%,transparent)] sm:py-16">
            <h2 className="text-[clamp(1.85rem,6.4vw,3rem)] leading-[1.08] font-bold tracking-tight text-balance">
              Put your first QR code up today
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty opacity-75">
              Create your organisation, map a floor, print the codes. It takes about five minutes.
            </p>
            <Link href="/sign-up" className={buttonVariants({ size: "xl", className: "mt-8" })}>
              Create free account <Icon name="arrowRight" data-icon="inline-end" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p>© 2026 QR Feed</p>
          <p className="flex gap-4">
            <Link href="/design" className="hover:text-foreground">
              Design system
            </Link>
            <Link href="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
          </p>
        </div>
      </footer>
    </>
  )
}

function GuestLinks() {
  return (
    <>
      <Link
        href="/sign-in"
        className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "hidden sm:inline-flex")}
      >
        Sign in
      </Link>
      <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
        Get started
      </Link>
    </>
  )
}

async function HeaderLinks() {
  const user = await getCurrentUser()
  if (!user) return <GuestLinks />
  return (
    <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
      Open dashboard
    </Link>
  )
}

function Hero() {
  return (
    <section className="bg-dots bg-glow overflow-hidden px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <Eyebrow>QR feedback → resolution</Eyebrow>
          <h1 className="text-[clamp(2.25rem,7vw,4rem)] leading-[1.05] font-bold tracking-tight text-balance">
            Every QR scan becomes a <span className="text-success">resolved ticket</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground lg:mx-0">
            Put a QR code on every washroom, room and machine. Guests report problems in seconds.
            Your team gets a ticket that escalates L1 → L2 → L3 until it&apos;s fixed, verified and
            on the record.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link href="/sign-up" className={buttonVariants({ size: "xl" })}>
              <Icon name="qr" data-icon="inline-start" /> Create free account
            </Link>
            <a href="#how-it-works" className={buttonVariants({ size: "xl", variant: "outline" })}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            For hospitals, clinics, hotels, malls and factories.
          </p>
        </div>
        <PhonePreview />
      </div>
    </section>
  )
}

/** A static picture of the guest form, so visitors see the product without signing up. */
function PhonePreview() {
  return (
    <figure aria-label="Feedback form preview" className="relative mx-auto w-full max-w-[300px]">
      <div className="rounded-[2.5rem] border-8 border-foreground bg-background p-4 pb-16">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-muted" aria-hidden />
        <p className="text-xs text-muted-foreground">Sunrise Hotels · Floor 2</p>
        <p className="text-lg font-bold tracking-tight">Washroom F2</p>
        <p className="mt-3 text-xs font-medium">What&apos;s the issue?</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {["Cleanliness", "Maintenance", "No supplies", "Other"].map((c, i) => (
            <span
              key={c}
              className={cn(
                "rounded-lg border px-2 py-2.5",
                i === 0 && "border-primary bg-primary/10 font-medium",
              )}
            >
              {c}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs font-medium">How was it?</p>
        <p className="mt-1 flex gap-1 text-secondary" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <Icon key={n} name="rating" className={cn("size-5", n <= 2 && "fill-current")} />
          ))}
        </p>
        <div className="mt-3 h-14 rounded-lg border bg-muted/50 p-2 text-[11px] text-muted-foreground">
          Floor is wet near the sinks, no paper towels…
        </div>
        <span className="mt-4 flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground">
          Send feedback
        </span>
      </div>
      <figcaption className="absolute -bottom-8 -left-4 w-56 rounded-xl border bg-card p-3 text-left text-xs sm:-left-12">
        <span className="flex items-center justify-between">
          <span className="font-mono font-medium">TKT-2026-000123</span>
          <Badge variant="warning">L2</Badge>
        </span>
        <span className="mt-1 block text-muted-foreground">
          Escalated to the supervisor after 3 h
        </span>
      </figcaption>
    </figure>
  )
}
