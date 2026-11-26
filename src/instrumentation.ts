// Runs once when the server boots: make sure every index exists before traffic arrives.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.MONGODB_URI) return
  const { ensureIndexes } = await import("@/server/db/indexes")
  try {
    await ensureIndexes()
  } catch (err) {
    console.error("[boot] ensureIndexes failed", err)
  }
}
