"use client"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center text-foreground">
        <h1 className="text-2xl font-bold">Unexpected error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading QR Feed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reload
        </button>
      </body>
    </html>
  )
}
