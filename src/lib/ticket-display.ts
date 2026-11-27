/*
 * How tickets look, shared by every list and chart so a "high" is the same orange everywhere.
 */
import type { Severity } from "@/lib/feedback-presets"

export const SEVERITY_BADGE: Record<Severity, "muted" | "info" | "warning" | "destructive"> = {
  low: "muted",
  medium: "info",
  high: "warning",
  critical: "destructive",
}

/** Chart and dot colours, matching the badges above. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "var(--muted-foreground)",
  medium: "var(--info)",
  high: "var(--warning)",
  critical: "var(--destructive)",
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ")
}

export type TicketRow = {
  id: string
  number: string
  locationName: string
  locationParent: string
  categoryName: string
  description: string
  severity: Severity
  status: string
  rating: number | null
  reportCount: number
  assigneeName: string | null
  currentLevel: number
  slaBreached: boolean
  slaPausedAt: string | null
  slaResolvedAt: string | null
  resolveDueAt: string | null
  createdAt: string
}
