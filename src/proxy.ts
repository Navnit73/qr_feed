import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Optimistic check only: no session cookie → straight to sign-in, without rendering the page.
 * The real check (valid session, active membership, permissions) runs in every page and action.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()
  const url = new URL("/sign-in", request.url)
  url.searchParams.set("next", request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tickets/:path*",
    "/print/:path*",
    "/branches/:path*",
    "/users/:path*",
    "/audit-log/:path*",
    "/onboarding",
    "/super/:path*",
  ],
}
