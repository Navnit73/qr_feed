import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Data Processing Addendum · QR Feed" }

export default function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-6" })}
      >
        ← Back to QR Feed
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Data Processing Addendum (DPA)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Applies to Customer Personal Data processed under GDPR and India DPDP Act 2023.
      </p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Roles</h2>
          <p>
            The tenant organisation acts as Data Controller / Data Fiduciary. QR Feed acts strictly
            as Data Processor, processing operational feedback, ticket logs, and staff user accounts
            solely on the organisation&apos;s instructions.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. Technical Measures</h2>
          <p>
            TLS in transit, encryption at rest via MongoDB Atlas / S3-compatible object storage,
            per-tenant repository scoping, hash-chained audit logs, EXIF GPS stripping, and tested
            backup/restore recovery drills.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. Data Subject Requests</h2>
          <p>
            Controllers can self-serve data exports, reporter PII anonymisation, and workspace
            deletion under Settings → Data &amp; Privacy.
          </p>
        </section>
      </div>
    </main>
  )
}
