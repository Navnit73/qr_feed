import { chromium, devices } from "@playwright/test"
import { MongoClient } from "mongodb"
try {
  const c = new MongoClient("mongodb://127.0.0.1:27999/?replicaSet=rs0")
  const q = await c.db("shots5").collection("qrCodes").findOne({ status: "active" })
  await c.close()
  console.log("qr", q?.shortCode)
  const b = await chromium.launch()
  const g = await (await b.newContext({ ...devices["Pixel 7"] })).newPage()
  await g.goto("http://localhost:3210/f/" + q.shortCode)
  await g.waitForFunction(() => !document.querySelector("form button[type=submit][disabled]"))
  await g.getByRole("radiogroup", { name: "What's it about?" }).getByText("Housekeeping").click()
  await g
    .getByRole("radiogroup", { name: "How was it?" })
    .getByLabel("4 stars")
    .check({ force: true })
  await g.mouse.move(0, 0)
  await g.waitForTimeout(1200)
  await g.screenshot({
    path: "/private/tmp/claude-501/-Users-navnitrai-personal-project-qr-feed/3f926e45-de37-456b-ac2a-cf76680e7071/scratchpad/p2-form-settled.png",
    clip: { x: 0, y: 140, width: 412, height: 330 },
  })
  await b.close()
} catch (e) {
  console.log("FAILED", e.message.split("\n")[0])
}
