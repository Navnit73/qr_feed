/*
 * Pure location-tree rules, shared by the server and the tree UI. No database here.
 * Hierarchy (phase.md §4.4): Branch › Building › Floor › Department/Zone › Location.
 * Levels may be skipped (a clinic may have no buildings) but never reversed.
 */

export const LOCATION_TYPES = ["building", "floor", "department", "location"] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  building: "Building",
  floor: "Floor",
  department: "Department / zone",
  location: "Location",
}

const RANK: Record<LocationType, number> = { building: 1, floor: 2, department: 3, location: 4 }

/** Can a `child` sit directly under `parent` (null = the branch root)? */
export function canNest(parent: LocationType | null, child: LocationType) {
  return parent === null || RANK[child] > RANK[parent]
}

/** Types allowed under a parent, for form dropdowns. */
export function childTypes(parent: LocationType | null): LocationType[] {
  return LOCATION_TYPES.filter((t) => canNest(parent, t))
}

type Node = { _id: { toString(): string }; parentId: { toString(): string } | null; name: string }
export type TreeNode<T extends Node> = T & { children: TreeNode<T>[] }

/** Flat list → nested tree, siblings sorted by name. Orphans surface as roots, never vanish. */
export function buildTree<T extends Node>(flat: T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>()
  for (const item of flat) byId.set(item._id.toString(), { ...item, children: [] })
  const roots: TreeNode<T>[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId.toString()) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}
