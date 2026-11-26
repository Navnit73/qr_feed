// @vitest-environment node
import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { buildTree, canNest } from "@/lib/location-tree"

describe("canNest()", () => {
  it("follows building › floor › department › location, skipping levels allowed", () => {
    expect(canNest(null, "building")).toBe(true)
    expect(canNest(null, "location")).toBe(true)
    expect(canNest("building", "floor")).toBe(true)
    expect(canNest("building", "location")).toBe(true)
    expect(canNest("floor", "department")).toBe(true)
  })

  it("never nests upwards or sideways", () => {
    expect(canNest("floor", "building")).toBe(false)
    expect(canNest("floor", "floor")).toBe(false)
    expect(canNest("location", "location")).toBe(false)
  })
})

describe("buildTree()", () => {
  const id = () => new ObjectId()
  it("nests children under parents and sorts by name", () => {
    const f2 = { _id: id(), parentId: null, name: "Floor 2" }
    const f1 = { _id: id(), parentId: null, name: "Floor 1" }
    const wc = { _id: id(), parentId: f2._id, name: "Washroom" }
    const lobby = { _id: id(), parentId: f1._id, name: "Lobby" }
    const tree = buildTree([wc, f2, lobby, f1])
    expect(tree.map((n) => n.name)).toEqual(["Floor 1", "Floor 2"])
    expect(tree[1].children.map((n) => n.name)).toEqual(["Washroom"])
    expect(tree[0].children[0].children).toEqual([])
  })

  it("treats a node with a missing parent as a root rather than dropping it", () => {
    const orphan = { _id: id(), parentId: id(), name: "Orphan" }
    expect(buildTree([orphan]).map((n) => n.name)).toEqual(["Orphan"])
  })
})
