import type { Metadata } from "next"
import Link from "next/link"
import { PanelCard } from "@/components/cards/panel-card"
import { Icon, type IconName } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Help Centre · QR Feed" }

const GUIDES: { icon: IconName; title: string; steps: string[] }[] = [
  {
    icon: "qr",
    title: "1. Set up locations & QR codes",
    steps: [
      "Create branches with each facility's local time zone under Branches.",
      "Build your hierarchy: Building → Floor → Department → Location.",
      "Click Generate QR codes and Print QR sheet to place stickers at every spot.",
    ],
  },
  {
    icon: "ticket",
    title: "2. Manage tickets & auto-assignment",
    steps: [
      "Configure round-robin or least-loaded rules under Settings → Assignment rules.",
      "Staff use My Work for one-tap Accept, Start, Hold (pauses SLA) and Submit actions.",
      "Switch between Table and Kanban views on Tickets, and save frequent filters.",
    ],
  },
  {
    icon: "sla",
    title: "3. Configure SLA escalation (L1 → L2 → L3)",
    steps: [
      "Build L1/L2/L3 ladders under Settings → SLA & Escalation with business-hours or 24×7 clocks.",
      "Run the standalone worker (`pnpm worker`) or schedule `POST /api/cron/sla-sweep`.",
      "Pre-breach warnings fire at 80% elapsed; escalations transfer and notify idempotently.",
    ],
  },
  {
    icon: "rca",
    title: "4. Run RCA, CAPA & Audits",
    steps: [
      "Convert repeat or critical tickets into RCA records (5 Whys & Fishbone 6M).",
      "Track CAPA actions to completion, verify 30-day effectiveness with auto-recurrence checks, and capture Owner/Reviewer/Approver signatures.",
      "Schedule standalone internal audits under Audits with offline mobile checklist drafts.",
    ],
  },
  {
    icon: "apiKey",
    title: "5. Connect API, Webhooks & Branding",
    steps: [
      "Customise logo, brand colour and custom domain in Settings → Branding.",
      "Generate scoped Bearer API keys for `/api/v1/tickets` and `/api/v1/locations`.",
      "Export CSV reports in Reports or download full GDPR/DPDP JSON archives in Settings → Privacy.",
    ],
  },
]

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Back to QR Feed
        </Link>
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Open dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Help Centre</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Everything your team needs to roll out QR feedback, SLAs, verifications, RCA/CAPA and audits
        across your sites.
      </p>

      <div className="mt-8 space-y-4">
        {GUIDES.map((g) => (
          <PanelCard
            key={g.title}
            title={g.title}
            action={<Icon name={g.icon} className="size-5 text-success" />}
          >
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </PanelCard>
        ))}
      </div>
    </main>
  )
}
