import type { Metadata } from "next"
import { AlertTriangle, ArrowRight, CheckCircle2, Info, QrCode, XCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { AreaTrend } from "@/components/charts/area-trend"
import { BarCompare } from "@/components/charts/bar-compare"
import { DonutChart } from "@/components/charts/donut-chart"
import { Icon, iconNames } from "@/components/icons"
import { Eyebrow } from "@/components/section"
import { SweetAlertProvider } from "@/components/sweet-alert"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { LoadingButtonDemo, ModalDemo, ShellPrimitivesDemo, SweetAlertDemo } from "./demos"

export const metadata: Metadata = {
  title: "Design system · QR Feed",
  robots: { index: false },
}

const semantic = [
  { name: "background", bg: "bg-background", fg: "text-foreground", note: "gray-50 / black" },
  {
    name: "primary",
    bg: "bg-primary",
    fg: "text-primary-foreground",
    note: "indigo-800 · CTAs, sidebar",
  },
  {
    name: "primary-hover",
    bg: "bg-primary-hover",
    fg: "text-primary-foreground",
    note: "indigo-900",
  },
  {
    name: "secondary",
    bg: "bg-secondary",
    fg: "text-secondary-foreground",
    note: "indigo-100 · soft actions",
  },
  { name: "inverse", bg: "bg-foreground", fg: "text-background", note: "black / white" },
  { name: "muted", bg: "bg-muted", fg: "text-muted-foreground", note: "gray-200 · quiet surfaces" },
  { name: "success", bg: "bg-success", fg: "text-success-foreground", note: "emerald-700" },
  { name: "warning", bg: "bg-warning", fg: "text-warning-foreground", note: "orange-600" },
  {
    name: "destructive",
    bg: "bg-destructive",
    fg: "text-destructive-foreground",
    note: "rose-600",
  },
  { name: "info", bg: "bg-info", fg: "text-info-foreground", note: "sky-600" },
]

// Written out in full so Tailwind can see every class.
const scales = {
  indigo: [
    "bg-indigo-50",
    "bg-indigo-100",
    "bg-indigo-200",
    "bg-indigo-300",
    "bg-indigo-400",
    "bg-indigo-500",
    "bg-indigo-600",
    "bg-indigo-700",
    "bg-indigo-800",
    "bg-indigo-900",
    "bg-indigo-950",
  ],
  emerald: [
    "bg-emerald-50",
    "bg-emerald-100",
    "bg-emerald-200",
    "bg-emerald-300",
    "bg-emerald-400",
    "bg-emerald-500",
    "bg-emerald-600",
    "bg-emerald-700",
    "bg-emerald-800",
    "bg-emerald-900",
    "bg-emerald-950",
  ],
  rose: [
    "bg-rose-50",
    "bg-rose-100",
    "bg-rose-200",
    "bg-rose-300",
    "bg-rose-400",
    "bg-rose-500",
    "bg-rose-600",
    "bg-rose-700",
    "bg-rose-800",
    "bg-rose-900",
    "bg-rose-950",
  ],
  amber: [
    "bg-amber-50",
    "bg-amber-100",
    "bg-amber-200",
    "bg-amber-300",
    "bg-amber-400",
    "bg-amber-500",
    "bg-amber-600",
    "bg-amber-700",
    "bg-amber-800",
    "bg-amber-900",
    "bg-amber-950",
  ],
  gray: [
    "bg-gray-50",
    "bg-gray-100",
    "bg-gray-200",
    "bg-gray-300",
    "bg-gray-400",
    "bg-gray-500",
    "bg-gray-600",
    "bg-gray-700",
    "bg-gray-800",
    "bg-gray-900",
    "bg-gray-950",
  ],
}
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Sample data for the chart demos, shaped like the real dashboard queries will be.
const weekly = [
  { day: "Mon", opened: 12, closed: 9 },
  { day: "Tue", opened: 18, closed: 15 },
  { day: "Wed", opened: 9, closed: 11 },
  { day: "Thu", opened: 22, closed: 17 },
  { day: "Fri", opened: 15, closed: 19 },
  { day: "Sat", opened: 27, closed: 21 },
  { day: "Sun", opened: 19, closed: 24 },
]
const byLocation = [
  { location: "Washrooms", tickets: 42 },
  { location: "Lobby", tickets: 28 },
  { location: "Rooms F3", tickets: 19 },
  { location: "Cafeteria", tickets: 14 },
  { location: "Parking", tickets: 6 },
]
const sla = [
  { key: "met", label: "Met", value: 182 },
  { key: "atRisk", label: "At risk", value: 14 },
  { key: "breached", label: "Breached", value: 9, color: "var(--destructive)" },
]

const successJson = `{
  "ok": true,
  "data": [{ "number": "TKT-2026-000123" }],
  "meta": { "total": 45, "page": 1,
            "pageSize": 20, "totalPages": 3 }
}`
const failureJson = `{
  "ok": false,
  "error": {
    "code": "VALIDATION",
    "message": "Check the form",
    "details": { "email": ["Enter a valid email"] }
  }
}`

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="reveal border-t py-10 sm:py-14">
      <h2 className="mb-6 text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function DesignPage() {
  return (
    <SweetAlertProvider>
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="relative -mx-4 flex flex-col items-center px-4 pt-16 pb-14 text-center sm:-mx-6 sm:pt-24">
          <div className="absolute top-4 right-4 sm:right-6">
            <ThemeToggle />
          </div>
          <Eyebrow>Design system</Eyebrow>
          <h1 className="text-[clamp(2.25rem,7vw,4rem)] leading-[1.05] font-bold tracking-tight text-balance">
            Indigo for action, <span className="text-success">emerald</span> for success.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
            Soft grays carry the page and indigo carries the brand. Every colour, button and alert
            below comes from the tokens in{" "}
            <code className="font-mono text-foreground">globals.css</code>.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="xl">
              <QrCode data-icon="inline-start" /> Create a QR code
            </Button>
            <Button size="xl" variant="outline">
              See examples <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </header>

        <Block title="Semantic colours">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {semantic.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-xl border">
                <div className={`flex h-20 items-end p-3 text-sm font-semibold ${c.bg} ${c.fg}`}>
                  Aa
                </div>
                <div className="p-3">
                  <p className="font-mono text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Brand palette">
          <div className="space-y-4">
            {Object.entries(scales).map(([name, classes]) => (
              <div key={name}>
                <p className="mb-2 text-sm font-medium capitalize">{name}</p>
                <div className="grid grid-cols-11 overflow-hidden rounded-xl border">
                  {classes.map((cls, i) => (
                    <div key={cls} className={`h-14 ${cls}`} title={cls}>
                      <span
                        className={cn(
                          "block p-1.5 font-mono text-[10px]",
                          i < 5 ? "text-black/60" : "text-white/80",
                        )}
                      >
                        {steps[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Typography">
          <div className="space-y-4">
            <p className="text-5xl font-bold tracking-tight">Display · 48 bold</p>
            <p className="text-3xl font-bold tracking-tight">Heading · 30 bold</p>
            <p className="text-xl font-semibold">Title · 20 semibold</p>
            <p className="max-w-prose text-base leading-relaxed">
              Body · 16 regular. Keep lines under about 70 characters, use{" "}
              <span className="font-semibold">semibold</span> for emphasis and{" "}
              <a href="#" className="font-medium text-primary underline-offset-4 hover:underline">
                indigo-800 for links
              </a>
              .
            </p>
            <p className="text-sm text-muted-foreground">Caption · 14 muted-foreground</p>
            <p className="font-mono text-sm">Mono · Geist Mono for codes and IDs</p>
          </div>
        </Block>

        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="inverse">Inverse</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="success">Success</Button>
            <Button variant="warning">Warning</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button>default</Button>
            <Button size="lg">lg</Button>
            <Button size="xl">xl · hero CTA</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LoadingButtonDemo />
            <Button loading variant="outline">
              Loading
            </Button>
          </div>
        </Block>

        <Block title="Icons">
          <p className="mb-4 max-w-prose text-sm text-muted-foreground">
            Use <code className="font-mono text-foreground">{`<Icon name="sla" />`}</code> from{" "}
            <code className="font-mono text-foreground">@/components/icons</code>, not lucide
            directly, so a domain concept keeps one glyph everywhere.
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {iconNames.map((name) => (
              <li
                key={name}
                className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center"
              >
                <Icon name={name} className="size-5" />
                <span className="font-mono text-[11px] text-muted-foreground">{name}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Stat cards">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              featured
              label="Tickets this month"
              value={12480}
              icon="ticket"
              delta={18}
              deltaLabel="vs last month"
            />
            <StatCard
              label="SLA compliance"
              value="94%"
              icon="sla"
              delta={-3}
              deltaLabel="vs last month"
            />
            <StatCard
              label="Overdue CAPAs"
              value={4}
              icon="capa"
              delta={-20}
              deltaLabel="lower is better"
              lowerIsBetter
            />
            <StatCard label="Avg rating" value="4.6" icon="rating" />
          </div>
        </Block>

        <Block title="Empty states">
          <EmptyState
            icon="qr"
            title="No QR codes yet"
            description="Add a location, then print its QR code. Feedback shows up here as tickets."
            action={
              <Button size="xl">
                <Icon name="qr" data-icon="inline-start" /> Create a QR code
              </Button>
            }
          />
        </Block>

        <Block title="Breadcrumbs">
          <div className="space-y-4">
            <Breadcrumbs
              items={[
                { label: "Dashboard", href: "/dashboard" },
                { label: "Branches", href: "/branches" },
                { label: "Hotel Delhi", href: "/branches/delhi" },
                { label: "Floor 2", href: "/branches/delhi/f2" },
                { label: "Washroom F2" },
              ]}
            />
            <Breadcrumbs
              maxItems={5}
              items={[
                { label: "Dashboard", href: "/dashboard" },
                { label: "Tickets", href: "/tickets" },
                { label: "TKT-2026-000123" },
              ]}
            />
          </div>
        </Block>

        <Block title="Dialogs & alerts">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Modal: forms and details</p>
              <ModalDemo />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Sweet alert: <code className="font-mono">useSweetAlert().fire()</code> for results
                and confirmations
              </p>
              <SweetAlertDemo />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Shell primitives: Sheet, DropdownMenu &amp; Avatar
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <ShellPrimitivesDemo />
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>AR</AvatarFallback>
                  </Avatar>
                  <Avatar>
                    <AvatarFallback className="bg-foreground text-background">AR</AvatarFallback>
                  </Avatar>
                  <Avatar size="lg">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      QF
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>
          </div>
        </Block>

        <Block title="Charts">
          <div className="grid gap-4 lg:grid-cols-3">
            <PanelCard
              className="lg:col-span-2"
              title="Tickets this week"
              description="Opened vs closed"
              action={<Badge variant="success">+12%</Badge>}
            >
              <AreaTrend
                title="Tickets this week"
                data={weekly}
                xKey="day"
                series={[
                  { key: "opened", label: "Opened" },
                  { key: "closed", label: "Closed" },
                ]}
              />
            </PanelCard>
            <PanelCard title="SLA compliance" description="Last 30 days">
              <DonutChart title="SLA compliance" data={sla} centerLabel="tickets" />
            </PanelCard>
            <PanelCard className="lg:col-span-3" title="Top problem locations">
              <BarCompare
                title="Top problem locations"
                data={byLocation}
                xKey="location"
                layout="horizontal-bars"
                series={[{ key: "tickets", label: "Tickets" }]}
              />
            </PanelCard>
          </div>
        </Block>

        <Block title="API responses">
          <p className="mb-4 max-w-prose text-sm text-muted-foreground">
            Every route returns one envelope. Servers use{" "}
            <code className="font-mono text-foreground">ok()</code>,{" "}
            <code className="font-mono text-foreground">fail()</code> and{" "}
            <code className="font-mono text-foreground">withApi()</code>; clients call{" "}
            <code className="font-mono text-foreground">apiFetch()</code>, which never throws.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Success", "success", successJson],
              ["Failure", "destructive", failureJson],
            ].map(([label, variant, json]) => (
              <div key={label} className="min-w-0 overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between border-b bg-muted px-4 py-2">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge variant={variant as "success" | "destructive"}>
                    {label === "Success" ? "200" : "422"}
                  </Badge>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">{json}</pre>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Primary</Badge>
            <Badge variant="secondary">New</Badge>
            <Badge variant="inverse">Pro</Badge>
            <Badge variant="success">Active</Badge>
            <Badge variant="warning">Expiring</Badge>
            <Badge variant="destructive">Failed</Badge>
            <Badge variant="info">Beta</Badge>
            <Badge variant="muted">Draft</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Block>

        <Block title="Alerts">
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert variant="success">
              <CheckCircle2 />
              <AlertTitle>QR code published</AlertTitle>
              <AlertDescription>Scans will start appearing in your feed.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Link expires in 3 days</AlertTitle>
              <AlertDescription>Renew it to keep the code working.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <XCircle />
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>The image is over 5 MB. Try a smaller file.</AlertDescription>
            </Alert>
            <Alert variant="info">
              <Info />
              <AlertTitle>Tip</AlertTitle>
              <AlertDescription>Higher contrast codes scan faster in low light.</AlertDescription>
            </Alert>
          </div>
        </Block>

        <Block title="Cards & forms">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>New QR code</CardTitle>
                <CardDescription>Point it at any link. You can change it later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="url">Destination URL</Label>
                <Input id="url" placeholder="https://example.com" />
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button variant="ghost">Cancel</Button>
                <Button>Create</Button>
              </CardFooter>
            </Card>

            <div className="edge-primary rounded-2xl p-px">
              <div className="bg-glow-amber flex h-full flex-col rounded-[calc(1rem-1px)] bg-card p-6">
                <Badge variant="secondary">Featured</Badge>
                <p className="mt-4 text-4xl font-bold tracking-tight tabular-nums">12,480</p>
                <p className="text-sm text-muted-foreground">scans this month</p>
                <p className="mt-auto pt-6 text-sm">
                  <span className="font-semibold text-success">+18%</span>{" "}
                  <span className="text-muted-foreground">vs last month</span>
                </p>
              </div>
            </div>
          </div>
        </Block>

        <Block title="Backdrops">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["bg-dots", "Dot grid"],
              ["bg-glow", "Indigo glow"],
              ["bg-glow-amber", "Amber glow"],
            ].map(([cls, label]) => (
              <div key={cls} className={`${cls} flex h-32 items-end rounded-xl border p-3`}>
                <code className="font-mono text-xs">.{cls}</code>
                <span className="sr-only">{label}</span>
              </div>
            ))}
          </div>
        </Block>
      </main>
    </SweetAlertProvider>
  )
}
