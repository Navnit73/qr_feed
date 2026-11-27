import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Optimistic check only: no session cookie → straight to sign-in, without rendering the page.
 * The real check (valid session, active membership, permissions) runs in every page and action.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    // Overwritten, never trusted from the client: pages use it for per-member menu access.
    const headers = new Headers(request.headers)
    headers.set("x-qrf-pathname", request.nextUrl.pathname)
    return NextResponse.next({ request: { headers } })
  }
  const url = new URL("/sign-in", request.url)
  url.searchParams.set("next", request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tickets/:path*",
    "/surveys/:path*",
    "/my-work/:path*",
    "/verifications/:path*",
    "/rca/:path*",
    "/audits/:path*",
    "/reports/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/print/:path*",
    "/branches/:path*",
    "/users/:path*",
    "/audit-log/:path*",
    "/onboarding",
    "/super/:path*",
  ],
}
