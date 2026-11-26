import type { Metadata } from "next"
import Link from "next/link"
import { Icon } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Terms of Service · QR Feed" }

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-6" })}
      >
        ← Back to QR Feed
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective date: 26 November 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Scope of Service</h2>
          <p>
            QR Feed provides a multi-tenant incident-to-resolution platform including QR code
            feedback intake, ticketing, SLA escalation, Root Cause Analysis (RCA), CAPA tracking,
            and compliance audits for physical facilities.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            2. Customer Responsibilities
          </h2>
          <p>
            Organisations are responsible for managing user permissions, configuring branch-scoped
            access, and advising public reporters not to enter sensitive personal health identifiers
            (PHI) on unauthenticated QR feedback forms.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            3. Availability &amp; Auditability
          </h2>
          <p>
            QR Feed maintains append-only hash-chained audit logs per organisation. While our
            approval workflows record timestamped sign-offs, QR Feed does not claim FDA 21 CFR Part
            11 certification unless separately contracted.
          </p>
        </section>
        <p className="flex items-center gap-2 border-t pt-6 text-xs">
          <Icon name="qr" className="size-3.5" /> See also:{" "}
          <Link href="/privacy" className="text-success hover:underline">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/dpa" className="text-success hover:underline">
            Data Processing Addendum
          </Link>
        </p>
      </div>
    </main>
  )
}
