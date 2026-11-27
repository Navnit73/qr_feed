"use client"

import Link from "next/link"
import { Icon } from "@/components/icons"
import { Button, buttonVariants } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon name="warning" className="size-6" />
      </span>
      <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-pretty text-muted-foreground">
        {error.message && error.message.length < 180
          ? error.message
          : "We couldn't load this page. Try again or return to the dashboard."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={reset}>
          <Icon name="refresh" data-icon="inline-start" /> Try again
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
