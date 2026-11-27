// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildTree } from "./location-tree"
import { setupSteps, summarizeTree } from "./location-stats"

const id = (s: string) => ({ toString: () => s })
const node = (key: string, type: string, parent: string | null) => ({
  _id: id(key),
  parentId: parent ? id(parent) : null,
  name: key,
  type: type as "building" | "floor" | "department" | "location",
})

const tree = buildTree([
  node("main", "building", null),
  node("f2", "floor", "main"),
  node("ward", "department", "f2"),
  node("nurses", "location", "ward"),
  node("wardA", "location", "ward"),
  node("wc", "location", "f2"),
  node("emptyFloor", "floor", "main"),
  node("lobby", "location", null),
])

describe("summarizeTree", () => {
  const qrs = new Map([
    ["nurses", 4],
    ["wc", 10],
  ])
  const s = summarizeTree(tree, qrs)

  it("totals areas, locations, QR coverage and scans across the branch", () => {
    expect(s.totals).toEqual({ areas: 4, locations: 4, withQr: 2, scans: 14 })
  })

  it("rolls each subtree up into its container", () => {
    expect(s.byId.get("f2")).toEqual({ locations: 3, withQr: 2, scans: 14 })
    expect(s.byId.get("ward")).toEqual({ locations: 2, withQr: 1, scans: 4 })
    expect(s.byId.get("emptyFloor")).toEqual({ locations: 0, withQr: 0, scans: 0 })
  })

  it("names the most scanned location", () => {
    expect(s.top).toEqual({ name: "wc", scans: 10 })
  })

  it("has no top location before anything is scanned", () => {
    expect(summarizeTree(tree, new Map()).top).toBeNull()
  })
})

describe("setupSteps", () => {
  it("walks map → spots → codes → first scan", () => {
    const empty = setupSteps({ areas: 0, locations: 0, withQr: 0, scans: 0 })
    expect(empty.map((s) => s.done)).toEqual([false, false, false, false])

    const partial = setupSteps({ areas: 2, locations: 3, withQr: 1, scans: 0 })
    expect(partial.map((s) => s.done)).toEqual([true, true, false, false])

    const live = setupSteps({ areas: 0, locations: 3, withQr: 3, scans: 1 })
    expect(live.every((s) => s.done)).toBe(true)
  })
})
