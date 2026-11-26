import type { z } from "zod"
import { ApiError, type FieldErrors } from "@/lib/api/errors"

/** Zod issues → `{ field: [messages] }`, the shape forms render next to each input. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const details: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form"
    ;(details[key] ??= []).push(issue.message)
  }
  return details
}

/** Parses input or throws a VALIDATION ApiError carrying field-level messages. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  throw new ApiError(
    "VALIDATION",
    "Please check the highlighted fields.",
    fieldErrors(result.error),
  )
}
