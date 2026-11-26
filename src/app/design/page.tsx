import type { Metadata } from "next"
import { AlertTriangle, ArrowRight, CheckCircle2, Info, QrCode, XCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Eyebrow } from "@/components/section"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Design system · QR Feed",
  robots: { index: false },
}

const semantic = [
  { name: "background", bg: "bg-background", fg: "text-foreground", note: "white / black" },
  { name: "primary", bg: "bg-primary", fg: "text-primary-foreground", note: "lime-600 · CTAs" },
  {
    name: "primary-hover",
    bg: "bg-primary-hover",
    fg: "text-primary-foreground",
    note: "lime-700",
  },
  {
    name: "secondary",
    bg: "bg-secondary",
    fg: "text-secondary-foreground",
    note: "amber-400 · highlights",
  },
  { name: "inverse", bg: "bg-foreground", fg: "text-background", note: "black / white" },
  { name: "muted", bg: "bg-muted", fg: "text-muted-foreground", note: "gray-100 · quiet surfaces" },
  { name: "success", bg: "bg-success", fg: "text-success-foreground", note: "lime-700" },
  { name: "warning", bg: "bg-warning", fg: "text-warning-foreground", note: "orange-600" },
  { name: "destructive", bg: "bg-destructive", fg: "text-destructive-foreground", note: "red-600" },
  { name: "info", bg: "bg-info", fg: "text-info-foreground", note: "sky-600" },
]

// Written out in full so Tailwind can see every class.
const scales = {
  lime: [
    "bg-lime-50",
    "bg-lime-100",
    "bg-lime-200",
    "bg-lime-300",
    "bg-lime-400",
    "bg-lime-500",
    "bg-lime-600",
    "bg-lime-700",
    "bg-lime-800",
    "bg-lime-900",
    "bg-lime-950",
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
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <header className="bg-dots bg-glow relative -mx-4 flex flex-col items-center px-4 pt-16 pb-14 text-center sm:-mx-6 sm:pt-24">
        <div className="absolute top-4 right-4 sm:right-6">
          <ThemeToggle />
        </div>
        <Eyebrow>Design system</Eyebrow>
        <h1 className="text-[clamp(2.25rem,7vw,4rem)] leading-[1.05] font-bold tracking-tight text-balance">
          Lime for action, <span className="text-success">amber</span> for attention.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
          White and black carry the page. Every colour, button and alert below comes from the tokens
          in <code className="font-mono text-foreground">globals.css</code>.
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
            <a href="#" className="font-medium text-success underline-offset-4 hover:underline">
              lime-700 for links
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

          <div className="edge-lime rounded-2xl p-px">
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
            ["bg-glow", "Lime glow"],
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
  )
}
