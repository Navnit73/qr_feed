"use client"

import { useSyncExternalStore } from "react"
import { greeting } from "@/lib/dashboard-metrics"

const noop = () => () => {}

/**
 * "Good morning, Asha". The hour has to come from the viewer's clock, not the server's, so
 * the server render says "Welcome back" and the client swaps in the greeting after hydration.
 */
export function Greeting({ name, org }: { name: string; org: string }) {
  const hello = useSyncExternalStore(
    noop,
    () => greeting(new Date().getHours()),
    () => "Welcome back",
  )
  return (
    <>
      {hello}, {name}. Here’s what’s happening at {org}.
    </>
  )
}
