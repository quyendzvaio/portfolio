import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { env } from './env.js'

/**
 * Admin identity is now a single password (ADMIN_PASSWORD) answered at
 * POST /api/login. The GitHub personal access token that commits profile.json
 * moved to the server env (GITHUB_TOKEN), so the browser only ever holds a random
 * session token: the write credential is out of XSS reach, and killing a stolen
 * session is a server restart. Sessions are in-memory — one backend container is
 * the whole deployment, so there is nothing to share across replicas yet.
 */
export interface Session {
  login: string
  expiresAt: number
}

// Keyed by SHA-256 of the session token so a heap dump never shows a live value.
const sessions = new Map<string, Session>()

const fingerprint = (token: string): string => createHash('sha256').update(token).digest('hex')

const sweep = (): void => {
  const now = Date.now()
  for (const [key, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(key)
  }
}
setInterval(sweep, 60_000).unref()

/** Constant-time compare so a mistyped password cannot be probed byte by byte. */
function passwordMatches(candidate: string): boolean {
  const expected = Buffer.from(env.admin.password, 'utf8')
  const given = Buffer.from(candidate, 'utf8')
  return expected.length > 0 && expected.length === given.length && timingSafeEqual(expected, given)
}

/** Issues a session token when the password matches; null otherwise. */
export function login(password: string): string | null {
  if (!passwordMatches(password)) return null
  sweep()
  const token = randomBytes(32).toString('hex')
  sessions.set(fingerprint(token), {
    login: 'admin',
    expiresAt: Date.now() + env.admin.sessionTtlMs,
  })
  return token
}

function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/** The active session for this request, or null when absent or expired. */
export function sessionFor(req: IncomingMessage): Session | null {
  const token = bearerToken(req)
  if (!token) return null
  const key = fingerprint(token)
  const session = sessions.get(key)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(key)
    return null
  }
  return session
}

/** The write credential for GitHub commits — server-side only, never sent to any client. */
export const githubToken = (): string => env.github.token
