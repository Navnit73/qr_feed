import { PageSkeleton } from "@/components/skeleton"

/** Triggers instant shell transition on client navigations between (app) routes (Next.js 16). */
export default function AppLoading() {
  return <PageSkeleton />
}
