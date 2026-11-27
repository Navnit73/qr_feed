import "server-only"
import { ApiError } from "@/lib/api/errors"
import { auth } from "@/server/auth/auth"
import type { IdentityProvider } from "@/server/modules/members"

/**
 * Better Auth accounts created by an admin (Users → Add user). Goes through Better Auth's
 * internal adapter rather than `signUpEmail`, because that endpoint would sign the *admin*
 * in as the new user via the nextCookies plugin.
 */
export const betterAuthIdentity: IdentityProvider = {
  async createPasswordUser({ name, email, password }) {
    const c = await auth().$context
    if (await c.internalAdapter.findUserByEmail(email)) {
      throw new ApiError(
        "CONFLICT",
        "That email already has a QR Feed account. Send them an invite instead.",
        { email: ["Already has an account; use an invite link"] },
      )
    }
    const hash = await c.password.hash(password)
    // The admin vouches for the address, as an accepted invite would.
    const user = await c.internalAdapter.createUser(
      { name, email, emailVerified: true },
      { method: "admin" },
    )
    try {
      await c.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      })
    } catch (err) {
      await c.internalAdapter.deleteUser(user.id).catch(() => {})
      throw err
    }
    return { id: user.id }
  },
  async deleteUser(id) {
    const c = await auth().$context
    await c.internalAdapter.deleteAccounts(id)
    await c.internalAdapter.deleteUser(id)
  },
}
