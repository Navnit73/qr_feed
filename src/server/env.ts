import "server-only"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z
    .string({ error: "is required" })
    .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  MONGODB_DB: z.string().min(1).default("qr_feed"),
  BETTER_AUTH_SECRET: z
    .string({ error: "is required (generate one with: openssl rand -base64 32)" })
    .min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url({ error: "must be the app's public URL, e.g. http://localhost:3000" }),
  /** Comma-separated emails that may use the super-admin console. */
  SUPER_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  /** Turn auth rate limiting off only for automated tests. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  /** Rate limits on the public feedback form. "off" only for automated tests. */
  INTAKE_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  /** Cloudflare Turnstile on the public form. Both set = on; both empty = off. */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
})

export type Env = z.infer<typeof schema>

/** Validates an env source and reports every problem at once, not just the first. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
  throw new Error(`Invalid environment. Fix these in .env.local:\n${lines.join("\n")}`)
}

let cached: Env | undefined

/** Read lazily so `next build` works without secrets; the first request validates them. */
export function env(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
