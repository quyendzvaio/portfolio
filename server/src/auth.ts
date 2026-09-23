import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { env } from './env.js'

/**
 * Admin identity is a single password (ADMIN_PASSWORD) answered at POST /api/login.
 * The GitHub personal access token that commits profile.json lives in the server env
 * (GITHUB_TOKEN), so the browser only ever holds a session token: the write
 * credential is out of XSS reach.
 *
 * Sessions are signed tokens rather than a Map of live sessions. The backend now
 * runs serverless, where two consecutive requests can land in different instances,
 * so shared memory no longer exists — a Map would log the owner out at random. A
 * signed token carries its own expiry and verifies without any storage, and it also
 * removes the old "restart the server to kill a session" trade-off.
 */
export interface Session {
  login: string
  expiresAt: number
}

/** HMAC key: an explicit SESSION_SECRET, else derived from the admin password. */
const signingKey = (): Buffer =>
  createHash('sha256').update(env.admin.sessionSecret || `admin-password:${env.admin.password}`).digest()

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

const sign = (payload: string): string =>
  createHmac('sha256', signingKey()).update(payload).digest('base64url')

/** Constant-time compare so a mistyped password cannot be probed byte by byte. */
function passwordMatches(candidate: string): boolean {
  const expected = Buffer.from(env.admin.password, 'utf8')
  const given = Buffer.from(candidate, 'utf8')
  return expected.length > 0 && expected.length === given.length && timingSafeEqual(expected, given)
}

/** Issues a signed session token when the password matches; null otherwise. */
export function login(password: string): string | null {
  if (!passwordMatches(password)) return null
  // The nonce keeps two logins in the same millisecond from producing identical
  // tokens, which would otherwise be replayable for each other.
  const payload = encode({
    login: 'admin',
    expiresAt: Date.now() + env.admin.sessionTtlMs,
    nonce: randomBytes(8).toString('base64url'),
  })
  return `${payload}.${sign(payload)}`
}

function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * The session carried by this request, or null when absent, tampered with or
 * expired. Nothing is stored, so this is a pure verification.
 */
export function sessionFor(req: IncomingMessage): Session | null {
  const token = bearerToken(req)
  if (!token) return null

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  // Signature first: the payload is attacker-controlled until this passes, so it
  // must not be parsed (or trusted for an expiry) before the MAC checks out.
  const expected = Buffer.from(sign(payload), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  let parsed: Partial<Session>
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Session>
  } catch {
    return null
  }

  if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null
  return { login: typeof parsed.login === 'string' && parsed.login ? parsed.login : 'admin', expiresAt: parsed.expiresAt }
}

/** The write credential for GitHub commits — server-side only, never sent to any client. */
export const githubToken = (): string => env.github.token
