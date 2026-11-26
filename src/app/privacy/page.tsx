import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Privacy Policy · QR Feed" }

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-6" })}
      >
        ← Back to QR Feed
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Aligned with the India DPDP Act 2023 and EU/UK GDPR.
      </p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Minimal Collection</h2>
          <p>
            Public QR feedback is anonymous by default. Name, email and phone number are optional
            and collected only when a guest chooses to receive progress updates. All uploaded photo
            EXIF and GPS location metadata is automatically stripped before storage.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            2. Multi-Tenant Isolation
          </h2>
          <p>
            Every organisation&apos;s data is logically isolated at the repository layer with
            automated cross-tenant isolation tests verified in CI. Private tracking links and API
            keys are stored exclusively as SHA-256 hashes.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            3. Export, Retention &amp; Deletion
          </h2>
          <p>
            Organisation admins can export all workspace data in JSON format, run retention-based
            reporter PII anonymisation, or request full tenant deletion directly from Settings →
            Data &amp; Privacy.
          </p>
        </section>
      </div>
    </main>
  )
}
