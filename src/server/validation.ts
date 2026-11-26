import { ObjectId } from "mongodb"
import { z } from "zod"

/** Accepts an ObjectId or its 24-char hex string (what forms and URLs carry). */
export const objectId = z
  .union([z.instanceof(ObjectId), z.string().regex(/^[a-f\d]{24}$/i, "Invalid id")])
  .transform((v) => (typeof v === "string" ? new ObjectId(v) : v))

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const timeZone = z.string().refine(isValidTimeZone, "Choose a valid time zone")

export const name = (label: string, min = 2) =>
  z
    .string({ error: `Enter a ${label}` })
    .trim()
    .min(min, min > 1 ? `Enter a ${label} (at least ${min} characters)` : `Enter a ${label}`)
    .max(80, `Keep the ${label} under 80 characters`)

/** MongoDB duplicate-key error. */
export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000
}
