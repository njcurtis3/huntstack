import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { decorateAuthUser, parseAdminIds, requireAdmin, requireUser, type AuthUser, type VerifyUser } from './auth-guard.js'
import { AuthUnconfiguredError } from './supabase-auth.js'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

const tokens: Record<string, AuthUser> = {
  'admin-token': { id: ADMIN, email: 'admin@example.com' },
  'user-token': { id: USER, email: 'user@example.com' },
}
const verifyUser = async (t: string) => tokens[t] ?? null

async function build(adminIds: ReadonlySet<string>, verify: VerifyUser = verifyUser) {
  const app = Fastify()
  app.register(async (scope) => {
    decorateAuthUser(scope)
    scope.get('/user', { preHandler: requireUser({ verifyUser: verify }) }, async (req) => ({ id: req.authUser.id, email: req.authUser.email }))
    scope.get('/admin', { preHandler: requireAdmin({ verifyUser: verify, adminIds }) }, async (req) => ({ id: req.authUser.id }))
  })
  await app.ready()
  return app
}

describe('parseAdminIds', () => {
  it('keeps only valid uuids, lowercased and trimmed', () => {
    const ids = parseAdminIds(` ${ADMIN.toUpperCase()} , not-a-uuid,, ${USER},12345 `)
    expect([...ids].sort()).toEqual([ADMIN, USER].sort())
  })

  it('is empty when unset or empty, so nobody is admin', () => {
    expect(parseAdminIds(undefined).size).toBe(0)
    expect(parseAdminIds('').size).toBe(0)
    expect(parseAdminIds(' , ').size).toBe(0)
  })
})

describe('requireUser', () => {
  it('401 with no header, a malformed header and a bad token', async () => {
    const app = await build(new Set())
    const bad = { message: 'Sign in to continue' }
    const none = await app.inject({ method: 'GET', url: '/user' })
    expect(none.statusCode).toBe(401)
    expect(none.json()).toEqual({ error: true, statusCode: 401, ...bad })
    expect((await app.inject({ method: 'GET', url: '/user', headers: { authorization: 'Token user-token' } })).statusCode).toBe(401)
    const invalid = await app.inject({ method: 'GET', url: '/user', headers: { authorization: 'Bearer nope' } })
    expect(invalid.statusCode).toBe(401)
    expect(invalid.json().message).toBe('Your session is not valid. Please sign in again.')
  })

  it('503 when auth is not configured', async () => {
    const app = await build(new Set(), async () => { throw new AuthUnconfiguredError() })
    const res = await app.inject({ method: 'GET', url: '/user', headers: { authorization: 'Bearer user-token' } })
    expect(res.statusCode).toBe(503)
    expect(res.json().message).toBe('Accounts are not available right now')
  })

  it('sets authUser from the verified token', async () => {
    const app = await build(new Set())
    const res = await app.inject({ method: 'GET', url: '/user', headers: { authorization: 'Bearer user-token' } })
    expect(res.json()).toEqual({ id: USER, email: 'user@example.com' })
  })
})

describe('requireAdmin', () => {
  const as = (token: string) => ({ authorization: `Bearer ${token}` })

  it('401 without a header, 401 for a bad token, 503 when unconfigured', async () => {
    const app = await build(new Set([ADMIN]))
    expect((await app.inject({ method: 'GET', url: '/admin' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/admin', headers: as('nope') })).statusCode).toBe(401)
    const off = await build(new Set([ADMIN]), async () => { throw new AuthUnconfiguredError() })
    expect((await off.inject({ method: 'GET', url: '/admin', headers: as('admin-token') })).statusCode).toBe(503)
  })

  it('403 for a valid non-admin, 200 for an admin id', async () => {
    const app = await build(new Set([ADMIN]))
    const denied = await app.inject({ method: 'GET', url: '/admin', headers: as('user-token') })
    expect(denied.statusCode).toBe(403)
    expect(denied.json()).toEqual({ error: true, statusCode: 403, message: 'Not allowed' })
    const ok = await app.inject({ method: 'GET', url: '/admin', headers: as('admin-token') })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ id: ADMIN })
  })

  it('an empty allow-list denies everyone, the former admin included', async () => {
    const app = await build(parseAdminIds(undefined))
    expect((await app.inject({ method: 'GET', url: '/admin', headers: as('admin-token') })).statusCode).toBe(403)
  })

  it('profile claims or a body field never grants access: only the verified id counts', async () => {
    // a verifier that returns extra claims on the user object, as a hostile token might
    const sneaky = async (t: string): Promise<AuthUser | null> => (t === 'user-token' ? { id: USER, email: 'u@example.com', claims: { role: "admin" }, isAdmin: true } as AuthUser : null)
    const app = await build(new Set([ADMIN]), sneaky)
    const res = await app.inject({
      method: 'GET', url: '/admin?isAdmin=true', headers: { ...as('user-token'), 'x-admin': '1' },
    })
    expect(res.statusCode).toBe(403)
  })
})
