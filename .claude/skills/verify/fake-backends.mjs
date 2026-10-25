// Preload for .claude/skills/verify only: replaces Vercel Blob and the GitHub Contents API with
// in-memory fakes via undici's MockAgent, so the real server code runs unmodified and
// nothing leaves the machine. Every fake call is logged to stderr as "[fake] ...".
import { createRequire } from 'node:module'
const require = createRequire(process.cwd() + '/package.json')
const { MockAgent, setGlobalDispatcher } = require('undici')

const agent = new MockAgent()
agent.disableNetConnect()
agent.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/)
setGlobalDispatcher(agent)

const log = (...a) => console.error('[fake]', ...a)
const blobs = new Map() // pathname -> { body: Buffer, contentType, uploadedAt }
const STORE = 'https://dummyx.private.blob.vercel-storage.com'
const meta = (p) => ({ url: `${STORE}/${p}`, downloadUrl: `${STORE}/${p}?download=1`, pathname: p, size: blobs.get(p).body.length, uploadedAt: blobs.get(p).uploadedAt, etag: '"e"' })
const toBuf = (body) => (body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : typeof body === 'string' ? Buffer.from(body) : Buffer.from(body))
const header = (opts, name) => {
  const h = opts.headers ?? {}
  if (Array.isArray(h)) { for (let i = 0; i < h.length; i += 2) if (String(h[i]).toLowerCase() === name) return String(h[i + 1]); return undefined }
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name) return String(v)
  return undefined
}

// --- Blob API: list / put / delete
const api = agent.get('https://vercel.com')
api.intercept({ path: (p) => p.startsWith('/api/blob'), method: () => true }).reply((opts) => {
  const url = new URL(opts.path, 'https://vercel.com')
  if (opts.method === 'GET' && url.searchParams.has('url')) {
    // head(): metadata for one pathname, or not_found
    const p = url.searchParams.get('url')
    const b = blobs.get(p)
    log('head', p, b ? 'hit' : 'miss')
    if (!b) return { statusCode: 404, data: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), responseOptions: { headers: { 'content-type': 'application/json' } } }
    return { statusCode: 200, data: JSON.stringify({ ...meta(p), etag: `"${b.uploadedAt}"`, contentType: b.contentType, contentDisposition: 'inline', cacheControl: 'no-store' }), responseOptions: { headers: { 'content-type': 'application/json' } } }
  }
  if (opts.method === 'GET') {
    const prefix = url.searchParams.get('prefix') ?? ''
    const list = [...blobs.keys()].filter((k) => k.startsWith(prefix)).sort().map(meta)
    log('list', prefix, '->', list.length)
    return { statusCode: 200, data: JSON.stringify({ blobs: list, hasMore: false }), responseOptions: { headers: { 'content-type': 'application/json' } } }
  }
  if (opts.method === 'PUT') {
    const p = url.searchParams.get('pathname')
    if (blobs.has(p) && header(opts, 'x-allow-overwrite') !== '1') {
      log('put REFUSED (exists)', p)
      return { statusCode: 400, data: JSON.stringify({ error: { code: 'bad_request', message: 'This blob already exists' } }), responseOptions: { headers: { 'content-type': 'application/json' } } }
    }
    blobs.set(p, { body: toBuf(opts.body), contentType: header(opts, 'x-content-type') ?? 'application/octet-stream', uploadedAt: new Date().toISOString() })
    log('put', p, blobs.get(p).body.length + 'B')
    return { statusCode: 200, data: JSON.stringify({ url: `${STORE}/${p}`, downloadUrl: `${STORE}/${p}?download=1`, pathname: p, contentType: 'x', contentDisposition: 'inline' }), responseOptions: { headers: { 'content-type': 'application/json' } } }
  }
  if (opts.method === 'POST' && url.pathname.endsWith('/delete')) {
    const { urls } = JSON.parse(toBuf(opts.body).toString())
    for (const u of urls) { const p = u.startsWith('http') ? new URL(u).pathname.slice(1) : u; blobs.delete(p); log('del', p) }
    return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } }
  }
  return { statusCode: 404, data: '{}' }
}).persist()

// --- Blob store reads
agent.get(STORE).intercept({ path: () => true, method: 'GET' }).reply((opts) => {
  const url = new URL(opts.path, STORE)
  const p = decodeURIComponent(url.pathname.slice(1))
  log('get', p, url.searchParams.get('cache') === '0' ? '(cache=0)' : '(cached)')
  const b = blobs.get(p)
  if (!b) return { statusCode: 404, data: 'not found' }
  return { statusCode: 200, data: b.body, responseOptions: { headers: { 'content-type': b.contentType, 'content-length': String(b.body.length) } } }
}).persist()

// --- GitHub Contents API (profile.json)
let profile = JSON.parse(process.env.FAKE_PROFILE ?? '{"name":"Test","avatar":"","links":[]}')
let sha = 'sha0'
const gh = agent.get('https://api.github.com')
gh.intercept({ path: (p) => p.includes('/contents/'), method: 'GET' }).reply(() => {
  if (process.env.FAKE_GH_FAIL && globalThis.__ghFail) return { statusCode: 502, data: 'bad gateway' }
  log('github read', 'avatar=' + profile.avatar)
  return { statusCode: 200, data: JSON.stringify({ sha, content: Buffer.from(JSON.stringify(profile)).toString('base64') }), responseOptions: { headers: { 'content-type': 'application/json' } } }
}).persist()
gh.intercept({ path: (p) => p.includes('/contents/'), method: 'PUT' }).reply((opts) => {
  const body = JSON.parse(toBuf(opts.body).toString())
  profile = JSON.parse(Buffer.from(body.content, 'base64').toString())
  sha = 'sha' + Date.now()
  log('github commit', 'avatar=' + profile.avatar)
  return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } }
}).persist()

// --- OpenRouter: FAKE_LLM_DELAY_MS delays the answer (to exercise OPENROUTER_TIMEOUT_MS)
agent.get('https://openrouter.ai').intercept({ path: (p) => p.endsWith('/chat/completions'), method: 'POST' })
  .reply(200, (opts) => { const b = JSON.parse(toBuf(opts.body).toString()); log('llm answered', `max_tokens=${b.max_tokens}`, `temperature=${b.temperature}`); return JSON.stringify({ choices: [{ message: { content: 'fake answer' } }] }) }, { headers: { 'content-type': 'application/json' } })
  .delay(Math.max(1, Number(process.env.FAKE_LLM_DELAY_MS ?? 1))).persist()

// Seed: one legacy avatar (pre-versioning layout), to check old URLs keep working.
if (process.env.FAKE_LEGACY_AVATAR) {
  blobs.set('assets/avatar.png', { body: Buffer.from(process.env.FAKE_LEGACY_AVATAR), contentType: 'image/png', uploadedAt: new Date().toISOString() })
}
globalThis.__ghFail = false; process.on('SIGUSR2', () => { globalThis.__ghFail = true; log('github now failing') })
log('fake Blob + GitHub ready')
