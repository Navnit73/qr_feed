import { auth } from "@/server/auth/auth"

// Better Auth's endpoints: sign-up, sign-in, sign-out, session, password reset.
export const GET = (req: Request) => auth().handler(req)
export const POST = (req: Request) => auth().handler(req)
