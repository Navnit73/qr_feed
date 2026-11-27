import "server-only"
import { betterAuth } from "better-auth"
import { mongodbAdapter } from "better-auth/adapters/mongodb"
import { nextCookies } from "better-auth/next-js"
import { db, mongoClient } from "@/server/db/client"
import { env } from "@/server/env"
import { renderEmail } from "@/server/email-template"
import { sendMail } from "@/server/mail"

/*
 * Better Auth owns identity only: users, passwords, sessions and reset tokens (collections
 * `user`, `session`, `account`, `verification`). Organisations, roles and branches are ours
 * (members collection), so one person can belong to several tenants.
 */
function createAuth() {
  const e = env()
  const devOrigins =
    e.NODE_ENV !== "production"
      ? [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:3001",
        ]
      : []
  const trustedOrigins = [
    ...new Set([
      new URL(e.BETTER_AUTH_URL).origin,
      ...devOrigins,
      ...e.BETTER_AUTH_TRUSTED_ORIGINS,
    ]),
  ]
  return betterAuth({
    appName: "QR Feed",
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    trustedOrigins,
    database: mongodbAdapter(db(), { client: mongoClient() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Reset your QR Feed password",
          ...renderEmail({
            preheader: "Use this link within an hour to choose a new password.",
            heading: "Reset your password",
            intro: [
              `Someone asked to reset the password for ${user.email}. If it was you, choose a new one below.`,
              "The link expires in 1 hour and signs you out everywhere else once used.",
            ],
            cta: { label: "Choose a new password", url },
            footnote: "Didn't ask for this? Ignore this email; your password stays the same.",
          }),
        })
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Signed short-lived cookie cache avoids a MongoDB session+user $lookup on every navigation.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    rateLimit: { enabled: e.AUTH_RATE_LIMIT === "on" },
    // Lets server actions set the session cookie (sign-in from a form action).
    plugins: [nextCookies()],
  })
}

type Auth = ReturnType<typeof createAuth>
let instance: Auth | undefined

/** Created on first use, so `next build` never needs secrets or a database. */
export function auth(): Auth {
  instance ??= createAuth()
  return instance
}
