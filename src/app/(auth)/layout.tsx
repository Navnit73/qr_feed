import Link from "next/link"
import { Suspense } from "react"
import { Skeleton } from "@/components/skeleton"
import { Icon } from "@/components/icons"

/** Centred single-card layout for sign-in, sign-up and password pages. Mobile first. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-dots bg-glow flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold tracking-tight">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Icon name="qr" className="size-5" />
        </span>
        QR Feed
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 sm:p-8">
        {/* Pages read the session and search params, which stream in at request time. */}
        <Suspense fallback={<Skeleton className="h-72" />}>{children}</Suspense>
      </div>
    </main>
  )
}
