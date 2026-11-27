/*
 * Roll-ups for the branch site map: how many QR spots each area holds, how many already have
 * a code, and how often they're scanned. Pure, so the server page and tests share it.
 */
import type { LocationType } from "./location-tree"

type StatNode = {
  _id: { toString(): string }
  name: string
  type: LocationType
  children: StatNode[]
}

export type SubtreeStats = { locations: number; withQr: number; scans: number }
export type BranchTotals = SubtreeStats & { areas: number }

/** `scansByLocation` holds an entry (the scan count) for every location with an active QR. */
export function summarizeTree(nodes: StatNode[], scansByLocation: Map<string, number>) {
  const byId = new Map<string, SubtreeStats>()
  const totals: BranchTotals = { areas: 0, locations: 0, withQr: 0, scans: 0 }
  let top: { name: string; scans: number } | null = null

  const walk = (n: StatNode): SubtreeStats => {
    const key = n._id.toString()
    const own = scansByLocation.get(key)
    const stats: SubtreeStats = { locations: 0, withQr: 0, scans: 0 }
    if (n.type === "location") {
      stats.locations = 1
      if (own !== undefined) {
        stats.withQr = 1
        stats.scans = own
        if (own > 0 && (!top || own > top.scans)) top = { name: n.name, scans: own }
      }
    } else {
      totals.areas++
    }
    for (const child of n.children) {
      const c = walk(child)
      stats.locations += c.locations
      stats.withQr += c.withQr
      stats.scans += c.scans
    }
    byId.set(key, stats)
    return stats
  }

  for (const root of nodes) {
    const s = walk(root)
    totals.locations += s.locations
    totals.withQr += s.withQr
    totals.scans += s.scans
  }
  return { byId, totals, top: top as { name: string; scans: number } | null }
}

export type SetupStep = { key: string; title: string; description: string; done: boolean }

/** The four steps from an empty branch to live feedback, for the setup guide. */
export function setupSteps(t: BranchTotals): SetupStep[] {
  return [
    {
      key: "map",
      title: "Map your site",
      description: "Add buildings, floors or zones.",
      done: t.areas > 0 || t.locations > 0,
    },
    {
      key: "spots",
      title: "Add QR spots",
      description: "Rooms, washrooms, counters.",
      done: t.locations > 0,
    },
    {
      key: "codes",
      title: "Generate QR codes",
      description: "One code for every spot.",
      done: t.locations > 0 && t.withQr === t.locations,
    },
    {
      key: "live",
      title: "Print & put them up",
      description: "Done when the first scan arrives.",
      done: t.scans > 0,
    },
  ]
}
