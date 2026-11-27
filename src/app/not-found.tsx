import Link from "next/link"
import { Icon } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon name="qr" className="size-7" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">
        The link you followed may be broken, expired, or moved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Go to dashboard
        </Link>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Sign in
        </Link>
      </div>
    </main>
  )
}
