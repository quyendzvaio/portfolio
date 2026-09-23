import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { adminReady, configReport, env, llmReady, storageReady } from './env.js'
import * as storage from './storage.js'
import { githubToken, login, sessionFor } from './auth.js'
import { readJsonFile, writeJsonFile } from './github.js'
import { clean, sanitizeProfile, sanitizeReactions, sniffImage } from './sanitize.js'
import { ask } from './llm.js'

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const MAX_JSON_BYTES = 16 * 1024
const MAX_CONTEXT_CHUNKS = 5
const MAX_CONTEXT_CHARS = 4000

// ------------------------------------------------------------------ responses

function applyCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', env.frontendOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
  })
  res.end(payload)
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) throw new HttpError(413, `Request body larger than ${Math.round(maxBytes / 1024)} KB`)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req, MAX_JSON_BYTES)
  if (!raw.length) return {} as T
  try {
    return JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

// ---------------------------------------------------------------- rate limiting

const requestLog = new Map<string, number[]>()

function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (requestLog.get(key) ?? []).filter((at) => now - at < windowMs)
  if (recent.length >= limit) {
    requestLog.set(key, recent)
    return true
  }
  recent.push(now)
  requestLog.set(key, recent)
  return false
}

// Both public endpoints are open, so without this sweep the map grows forever.
setInterval(() => {
  const now = Date.now()
  for (const [key, stamps] of requestLog) {
    const recent = stamps.filter((at) => now - at < env.limits.windowMs)
    if (recent.length) requestLog.set(key, recent)
    else requestLog.delete(key)
  }
}, 60_000).unref()

// X-Forwarded-* is attacker-controlled unless a proxy you run rewrites it, so it is
// only consulted when TRUST_PROXY is on (see docker-compose).
function clientIp(req: IncomingMessage): string {
  if (env.trustProxy) {
    const header = req.headers['x-forwarded-for']
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function publicOrigin(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-proto']
  const proto = env.trustProxy
    ? ((Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'https')
    : 'http'
  return `${proto}://${req.headers.host ?? `localhost:${env.port}`}`
}

// No SSE endpoint any more. The backend runs serverless, where an in-process
// subscriber set only ever sees the requests that landed in the same instance, so a
// stream could not be told about a comment written elsewhere. Readers poll instead
// (see the interval in src/components/Comments.tsx), which costs nothing at blog
// scale and keeps working through a dropped connection for free.

function requireStorage(): void {
  if (!storageReady()) {
    throw new HttpError(503, 'Vercel Blob is not configured on the server. Set BLOB_READ_WRITE_TOKEN.')
  }
}

// Identity is a server-side session; the GitHub write credential never leaves the
// process, so this is a plain boolean check.
async function requireAdmin(req: IncomingMessage): Promise<void> {
  if (!adminReady()) {
    throw new HttpError(503, 'Admin login is not configured (ADMIN_PASSWORD / GITHUB_REPO / GITHUB_TOKEN).')
  }
  if (!sessionFor(req)) throw new HttpError(403, 'Sign in at POST /api/login first.')
}

// --------------------------------------------------------------------- routing

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyCors(res)
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'GET' && path === '/api/health') {
    json(res, 200, { ok: true, ...configReport() })
    return
  }

  // Session check for the admin UI. A missing server config is reported as a
  // reason instead of leaving the page guessing.
  if (method === 'GET' && path === '/api/me') {
    if (!adminReady()) {
      json(res, 200, { admin: false, login: null, reason: 'Admin login is not configured (ADMIN_PASSWORD / GITHUB_TOKEN).' })
      return
    }
    const session = sessionFor(req)
    json(res, 200, { admin: Boolean(session), login: session?.login ?? null })
    return
  }

  // One password in, one random session token out. Rate-limited because it is the
  // only public endpoint that guards a secret.
  if (method === 'POST' && path === '/api/login') {
    if (!adminReady()) {
      throw new HttpError(503, 'Admin login is not configured on the server (ADMIN_PASSWORD / GITHUB_TOKEN).')
    }
    if (rateLimited(`auth:${clientIp(req)}`, env.limits.authPerWindow, env.limits.windowMs)) {
      throw new HttpError(429, 'Too many sign-in attempts from this address. Wait a few minutes.')
    }
    const input = await readJson<{ password?: string }>(req)
    const token = login(clean(input.password, 200))
    if (!token) throw new HttpError(403, 'Wrong password.')
    json(res, 200, { token, login: 'admin' })
    return
  }

  // --------------------------------------------------------------- comments
  if (path === '/api/comments' && method === 'GET') {
    const slug = url.searchParams.get('slug') ?? ''
    if (!storage.validSlug(slug)) throw new HttpError(400, 'Missing or invalid slug')
    requireStorage()
    json(res, 200, { comments: await storage.listComments(slug) })
    return
  }

  if (path === '/api/comments' && method === 'POST') {
    requireStorage()
    if (rateLimited(`comment:${clientIp(req)}`, env.limits.commentsPerWindow, env.limits.windowMs)) {
      throw new HttpError(429, 'Too many comments from this address. Try again in a few minutes.')
    }
    const input = await readJson<{ slug?: string; name?: string; body?: string; parentId?: string; quote?: string }>(req)
    const slug = clean(input.slug, 80)
    if (!storage.validSlug(slug)) throw new HttpError(400, 'Missing or invalid slug')
    const body = clean(input.body, env.limits.commentMaxLength)
    if (!body) throw new HttpError(400, 'Comment cannot be empty')
    // Replies are first-class comments; only the parent linkage plus a short excerpt
    // of the parent are stored so the reply card can show what is being answered.
    const parentId = clean(input.parentId, 64)
    let quote = ''
    if (parentId) {
      if (!storage.validId(parentId)) throw new HttpError(400, 'Invalid parent comment id')
      const parent = (await storage.listComments(slug)).find((c) => c.id === parentId)
      if (!parent) throw new HttpError(404, 'The comment being replied to no longer exists')
      // For replies the excerpt is derived server-side from the parent, so the
      // reply card always quotes what is really being answered.
      quote = parent.body.slice(0, 120)
    } else {
      // Selection quotes come from the client (the highlighted passage is browser
      // state the server never sees). Same trust level as the body itself.
      quote = clean(input.quote, 200)
    }

    const comment: storage.Comment = {
      id: randomUUID(),
      slug,
      // Anyone may comment, so a name is optional and never authenticated.
      name: clean(input.name, env.limits.nameMaxLength) || 'Anonymous',
      body,
      createdAt: new Date().toISOString(),
      // Quote and parent are independent: a selection comment has a quote but no
      // parent, a plain reply has a parent-derived quote and no selection.
      ...(quote ? { quote } : {}),
      ...(parentId ? { parentId } : {}),
    }
    await storage.putComment(comment)
    json(res, 201, { comment })
    return
  }

  // POST { viewer, reactions } — one anonymous viewer toggles their pick on one
  // comment. The result re-broadcasts as 'updated' so every open tab repaints.
  const reactionMatch = path.match(/^\/api\/comments\/([^/]+)\/([^/]+)\/reactions$/)
  if (reactionMatch && method === 'POST') {
    requireStorage()
    if (rateLimited(`reaction:${clientIp(req)}`, env.limits.reactionsPerWindow, env.limits.windowMs)) {
      throw new HttpError(429, 'Too many reactions from this address. Try again in a few minutes.')
    }
    const slug = decodeURIComponent(reactionMatch[1])
    const id = decodeURIComponent(reactionMatch[2])
    if (!storage.validSlug(slug) || !storage.validId(id)) {
      throw new HttpError(400, 'Invalid comment id')
    }
    const input = await readJson<{ viewer?: string; reactions?: unknown }>(req)
    const viewer = clean(input.viewer, 64)
    if (!storage.validViewer(viewer)) throw new HttpError(400, 'Invalid viewer id')
    const reactions = sanitizeReactions(input.reactions)
    if (!reactions.length) throw new HttpError(400, 'No valid reaction supplied')
    const updated = await storage.updateComment(slug, id, (comment) => ({
      ...comment,
      reactions: { ...comment.reactions, [viewer]: reactions },
    }))
    json(res, 200, { comment: updated })
    return
  }

  const deleteMatch = path.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/)
  if (deleteMatch && method === 'DELETE') {
    await requireAdmin(req)
    requireStorage()
    const slug = decodeURIComponent(deleteMatch[1])
    const id = decodeURIComponent(deleteMatch[2])
    if (!storage.validSlug(slug) || !storage.validId(id)) throw new HttpError(400, 'Invalid comment id')
    await storage.removeComment(slug, id)
    json(res, 200, { ok: true })
    return
  }

  // ---------------------------------------------------------------- profile
  if (path === '/api/profile' && method === 'GET') {
    await requireAdmin(req)
    const file = await readJsonFile(githubToken(), env.github.profilePath)
    json(res, 200, { profile: file.content, path: env.github.profilePath })
    return
  }

  if (path === '/api/profile' && method === 'PUT') {
    await requireAdmin(req)
    const input = await readJson<Record<string, unknown>>(req)
    const current = await readJsonFile(githubToken(), env.github.profilePath)
    // Merged, not replaced: a hand-added key in profile.json survives a save from
    // the admin form instead of being silently deleted.
    const next = { ...current.content, ...sanitizeProfile(input) }
    await writeJsonFile(
      githubToken(),
      env.github.profilePath,
      next,
      'Update profile via admin',
      current.sha,
    )
    json(res, 200, { ok: true, path: env.github.profilePath, profile: next })
    return
  }

  if (path === '/api/profile/avatar' && method === 'PUT') {
    await requireAdmin(req)
    requireStorage()
    const buffer = await readBody(req, env.limits.avatarMaxBytes)
    const image = sniffImage(buffer)
    if (!image) throw new HttpError(415, 'Avatar must be a PNG, JPEG, WebP or GIF image.')
    await storage.putAvatar(buffer, image.extension)
    // Date stamp so the browser refetches when the picture actually changes.
    json(res, 200, { url: `${publicOrigin(req)}/api/avatar?v=${Date.now()}` })
    return
  }

  if (path === '/api/avatar' && method === 'GET') {
    requireStorage()
    const avatar = await storage.getAvatar()
    if (!avatar) throw new HttpError(404, 'No avatar uploaded yet')
    res.writeHead(200, {
      'Content-Type': avatar.contentType,
      'Content-Length': String(avatar.buffer.length),
      // Safe to cache hard: the profile stores a ?v= stamped URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    res.end(avatar.buffer)
    return
  }

  // ------------------------------------------------------------------- chat
  if (method === 'GET' && path === '/api/chat/status') {
    json(res, 200, { llmEnabled: llmReady() })
    return
  }

  if (method === 'POST' && path === '/api/chat') {
    if (!llmReady()) {
      throw new HttpError(503, 'The server has no OpenRouter key configured (OPENROUTER_API_KEY / OPENROUTER_MODEL).')
    }
    if (rateLimited(`chat:${clientIp(req)}`, env.limits.chatPerWindow, env.limits.windowMs)) {
      throw new HttpError(429, 'Too many questions from this address. Try again in a few minutes.')
    }
    const input = await readJson<{ query?: string; context?: { source?: string; text?: string }[] }>(req)
    const query = clean(input.query, 1000)
    if (!query) throw new HttpError(400, 'Question cannot be empty')
    // This endpoint is public and bills the owner's OpenRouter account, so the
    // context the client sends is clamped rather than trusted.
    const context = (Array.isArray(input.context) ? input.context : [])
      .slice(0, MAX_CONTEXT_CHUNKS)
      .map((chunk) => ({
        source: clean(chunk?.source, 200),
        text: clean(chunk?.text, MAX_CONTEXT_CHARS),
      }))
    json(res, 200, { answer: await ask(query, context) })
    return
  }

  throw new HttpError(404, 'Not found')
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (res.headersSent) {
      res.end()
      return
    }
    if (error instanceof HttpError) {
      // Expected, actionable outcomes (503 not configured, 429 rate limited…): one
      // line, no stack. A stack here would train the owner to ignore the log.
      if (error.status >= 500) console.warn(`[server] ${req.method} ${req.url} → ${error.status} ${error.message}`)
      json(res, error.status, { error: error.message })
      return
    }
    // Anything else is a genuine bug and deserves the stack.
    console.error(`[server] ${req.method} ${req.url} →`, error)
    json(res, 500, { error: error instanceof Error ? error.message : 'Unexpected error' })
  })
})

async function main(): Promise<void> {
  const report = configReport()
  console.log(`[server] frontend origin: ${env.frontendOrigin}`)
  console.log(`[server] Blob:       ${report.storage ? 'configured' : 'MISSING → comments and avatar upload disabled'}`)
  console.log(`[server] GitHub repo:${report.admin ? ` ${env.github.repo} (branch ${env.github.branch})` : ' MISSING → admin login disabled'}`)
  console.log(`[server] OpenRouter: ${report.llm ? 'configured' : 'MISSING → chat runs retrieval-only'}`)

  // No bucket to prepare any more: Blob needs a token, not a container, and a
  // missing token is already reported by the line above.

  server.listen(env.port, () => console.log(`[server] listening on port ${env.port}`))
}

void main()
