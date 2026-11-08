import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AuthUnconfiguredError } from './supabase-auth.js'

// Reusable Bearer preHandlers. The ONLY authorization input is the user id Supabase verified for the
// token: never profile metadata, the email, or anything in the request body. Admin is a
// fixed allow-list (ADMIN_USER_IDS) matched against that verified id.

export interface AuthUser {
  id: string
  email: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser
  }
}

export type VerifyUser = (token: string) => Promise<AuthUser | null>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parse the comma-separated ADMIN_USER_IDS. Invalid tokens are dropped; unset or empty means nobody is admin. */
export function parseAdminIds(raw: string | undefined): Set<string> {
  const ids = new Set<string>()
  if (!raw) return ids
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (UUID_RE.test(id)) ids.add(id.toLowerCase())
  }
  return ids
}

/** Register the request decorator once in each plugin that uses the guards below. */
export function decorateAuthUser(app: FastifyInstance): void {
  app.decorateRequest('authUser', null as unknown as AuthUser)
}

const deny = (reply: FastifyReply, statusCode: number, message: string) =>
  reply.status(statusCode).send({ error: true, statusCode, message })

async function authenticate(request: FastifyRequest, reply: FastifyReply, verifyUser: VerifyUser): Promise<AuthUser | null> {
  const header = request.headers.authorization
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null
  if (!match) {
    await deny(reply, 401, 'Sign in to continue')
    return null
  }
  let user: AuthUser | null
  try {
    user = await verifyUser(match[1])
  } catch (err) {
    if (err instanceof AuthUnconfiguredError) {
      await deny(reply, 503, 'Accounts are not available right now')
      return null
    }
    throw err
  }
  if (!user) {
    await deny(reply, 401, 'Your session is not valid. Please sign in again.')
    return null
  }
  return user
}

/** preHandler: a valid signed-in user; sets request.authUser. */
export function requireUser({ verifyUser }: { verifyUser: VerifyUser }) {
  return async function requireUserHook(request: FastifyRequest, reply: FastifyReply) {
    const user = await authenticate(request, reply, verifyUser)
    if (!user) return reply
    request.authUser = user
  }
}

/** preHandler: a valid signed-in user whose verified id is in the admin allow-list. */
export function requireAdmin({ verifyUser, adminIds }: { verifyUser: VerifyUser; adminIds: ReadonlySet<string> }) {
  return async function requireAdminHook(request: FastifyRequest, reply: FastifyReply) {
    const user = await authenticate(request, reply, verifyUser)
    if (!user) return reply
    if (!adminIds.has(user.id.toLowerCase())) return deny(reply, 403, 'Not allowed')
    request.authUser = user
  }
}
