/**
 * Seeds a demo organisation into the database in .env.local: a sign-in user, a hospital with
 * two branches, a location tree, QR codes and a handful of feedback tickets.
 *
 * Goes through the real services (not raw inserts) so tenant scoping, limits and the audit
 * hash-chain all hold. Safe to re-run: it stops if the demo user already exists.
 *
 *   pnpm db:seed
 */
import { auth } from "@/server/auth/auth"
import { resolveTenantContext } from "@/server/auth/context"
import { mongoClient } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"
import { createBranch } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { generateMissingQrCodes, listQrCodes } from "@/server/modules/qr-codes"
import type { TenantContext } from "@/server/db/tenant-context"
import type { ObjectId } from "mongodb"

const DEMO = {
  email: "admin@demo.qrfeed.test",
  password: "DemoPass123!",
  name: "Demo Admin",
}

type Tree = {
  type: "building" | "floor" | "department" | "location"
  name: string
  children?: Tree[]
}

const HOSPITAL_TREE: Tree[] = [
  {
    type: "building",
    name: "Main Block",
    children: [
      {
        type: "floor",
        name: "Ground Floor",
        children: [
          {
            type: "department",
            name: "Emergency",
            children: [
              { type: "location", name: "Triage Desk" },
              { type: "location", name: "Waiting Area" },
            ],
          },
          { type: "location", name: "Reception" },
          { type: "location", name: "Washroom GF" },
        ],
      },
      {
        type: "floor",
        name: "Floor 2",
        children: [
          {
            type: "department",
            name: "General Ward",
            children: [
              { type: "location", name: "Ward A" },
              { type: "location", name: "Ward B" },
              { type: "location", name: "Nurses Station" },
            ],
          },
          { type: "location", name: "Washroom F2" },
        ],
      },
    ],
  },
  {
    type: "building",
    name: "OPD Block",
    children: [
      { type: "location", name: "OPD Waiting Hall" },
      { type: "location", name: "Pharmacy" },
      { type: "location", name: "Billing Counter" },
    ],
  },
]

const CLINIC_TREE: Tree[] = [
  {
    type: "floor",
    name: "Ground Floor",
    children: [
      { type: "location", name: "Front Desk" },
      { type: "location", name: "Consultation Room 1" },
      { type: "location", name: "Consultation Room 2" },
      { type: "location", name: "Washroom" },
    ],
  },
]

async function buildTree(
  ctx: TenantContext,
  branchId: ObjectId,
  nodes: Tree[],
  parentId?: ObjectId,
) {
  for (const node of nodes) {
    const loc = await createLocation(ctx, { branchId, parentId, type: node.type, name: node.name })
    if (node.children) await buildTree(ctx, branchId, node.children, loc._id)
  }
}

const REPORTS = [
  { cat: "cleanliness", rating: 2, description: "Floor is wet and there is no caution sign." },
  { cat: "waiting_time", rating: 3, description: "Waited over 40 minutes to be called." },
  { cat: "staff_behaviour", rating: 5, description: "Nurse on duty was very kind and helpful." },
  { cat: "facilities", rating: 2, description: "AC not working, the room is very hot." },
  { cat: "safety", description: "Exposed wiring near the door.", urgency: "urgent" },
  { cat: "billing", rating: 3, description: "Bill had a duplicate charge for a test." },
  { cat: "patient_care", rating: 4, description: "Doctor explained everything clearly." },
  { cat: "cleanliness", rating: 1, description: "Dustbin overflowing, bad smell." },
]

async function main() {
  await ensureIndexes()

  const existing = await mongoClient()
    .db(process.env.MONGODB_DB)
    .collection("user")
    .findOne({ email: DEMO.email })
  if (existing) {
    console.info(`Demo user ${DEMO.email} already exists. Nothing to do.`)
    return
  }

  const { user } = await auth().api.signUpEmail({ body: DEMO })
  console.info(`✓ user ${user.email}`)

  const { tenant, branch } = await createOrganization(
    { id: user.id, email: user.email, name: user.name },
    {
      orgName: "Sunrise Hospital",
      industry: "hospital",
      branchName: "Delhi Central",
      timezone: "Asia/Kolkata",
    },
  )
  console.info(`✓ organisation ${tenant.name} (${tenant.slug})`)

  const ctx = (await resolveTenantContext(user.id, tenant._id))!
  const second = await createBranch(ctx, { name: "Noida Clinic", timezone: "Asia/Kolkata" })
  console.info(`✓ branches ${branch.name}, ${second.name}`)

  await buildTree(ctx, branch._id, HOSPITAL_TREE)
  await buildTree(ctx, second._id, CLINIC_TREE)
  console.info("✓ locations")

  const made =
    (await generateMissingQrCodes(ctx, branch._id)) +
    (await generateMissingQrCodes(ctx, second._id))
  console.info(`✓ ${made} QR codes`)

  const cats = await listCategories(ctx, "hospital")
  const byKey = new Map(cats.map((c) => [c.key, c._id.toHexString()]))
  const codes = await listQrCodes(ctx, branch._id)
  let tickets = 0
  for (const [i, r] of REPORTS.entries()) {
    const qr = codes[i % codes.length]
    await submitFeedback(
      qr.shortCode,
      {
        categoryId: byKey.get(r.cat) ?? byKey.get("other"),
        rating: r.rating,
        description: r.description,
        urgency: r.urgency ?? "normal",
        consent: "on",
        ...(i % 3 === 0 ? { name: "Asha Verma", email: "asha@example.com" } : {}),
      },
      { ip: "127.0.0.1", limits: null },
    )
    tickets++
  }
  console.info(`✓ ${tickets} feedback tickets`)

  console.info(`\nSign in at /sign-in with ${DEMO.email} / ${DEMO.password}`)
}

try {
  await main()
} finally {
  await mongoClient().close()
}
