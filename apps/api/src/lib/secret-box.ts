import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

// Encrypts users' own AI keys before they reach the database (AES-256-GCM). The 32-byte secret
// lives only in the API's environment (USER_KEY_SECRET, base64), so a copy of the database alone
// cannot read a key. Stored form: "v1.<iv>.<tag>.<ciphertext>", each part base64url.

export class SecretUnconfiguredError extends Error {
  constructor() {
    super('USER_KEY_SECRET is not set (32 random bytes, base64)')
  }
}

function secret(raw = process.env.USER_KEY_SECRET): Buffer {
  if (!raw) throw new SecretUnconfiguredError()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('USER_KEY_SECRET must be 32 bytes, base64-encoded')
  return key
}

export function isSecretConfigured(): boolean {
  try {
    secret()
    return true
  } catch {
    return false
  }
}

export function seal(plaintext: string, raw?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(raw), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), body].map(p => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function open(sealed: string, raw?: string): string {
  const [version, iv, tag, body] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || body === undefined) throw new Error('Unrecognized sealed value')
  const decipher = createDecipheriv('aes-256-gcm', secret(raw), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

/**
 * A stable, non-reversible id for a visitor's IP, for counting free chats without storing the
 * address. Keyed by the same secret, so it can't be matched against a list of IPs.
 */
export function visitorId(ip: string, raw?: string): string {
  // Without the secret the id is still not the IP, just easier to reverse; counting keeps working
  const key = raw || process.env.USER_KEY_SECRET ? secret(raw) : Buffer.from('huntstack-visitor')
  return createHmac('sha256', key).update(`visitor:${ip}`).digest('base64url').slice(0, 32)
}
