import { BlobNotFoundError, del, get, head, list, put } from '@vercel/blob'
import { env, storageReady } from './env.js'

export interface Comment {
  id: string
  slug: string
  name: string
  body: string
  createdAt: string
  /** Set when this comment answers another one. */
  parentId?: string
  /** Short excerpt of the parent shown on the reply card. */
  quote?: string
  // Viewer → reaction list, e.g. { "a1b2": ["like"] }. Keeping reactions inside the
  // comment object makes any visitor's toggle a single-object write, the same reason
  // the thread is one object per comment rather than one JSON array per post.
  reactions?: Record<string, string[]>
}

// Layout: comments/{slug}/{id}.json — one object per comment.
// Deliberately NOT one JSON array per post: create and delete stay single-object
// writes, so two visitors commenting at the same moment can never clobber each
// other.
//
// Reading a thread costs one list + one get per comment, and Blob's Hobby tier
// includes only 2,000 list-class ("advanced") operations a month, after which the
// store is blocked for 30 days. So reads go through a version marker instead:
// comment-versions/{slug}.json is rewritten on every change to the thread, a reader
// checks it with head() (a "simple" operation, 10,000 included), and the full list
// only runs when the version moved. Polls of an unchanged thread cost one head.
const basePrefix = 'comments/'
const slugPrefix = (slug: string) => `${basePrefix}${slug}/`
const commentKey = (slug: string, id: string) => `${slugPrefix(slug)}${id}.json`
const versionKey = (slug: string) => `comment-versions/${slug}.json`

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/
const ID_RE = /^[a-zA-Z0-9-]{1,64}$/

// Slugs arrive from the browser and become object keys, so reject anything that
// could climb out of the prefix or create surprising paths.
export const validSlug = (slug: string): boolean => SLUG_RE.test(slug) && !slug.includes('..')
export const validId = (id: string): boolean => ID_RE.test(id)

// Storage is Vercel Blob, which replaced a self-hosted MinIO: a serverless host has
// no disk to mount a MinIO container on. Objects are written with `access: 'private'`
// because the browser never fetches them directly — every read goes through this
// API — so a leaked pathname is not a leaked comment. Private blobs also keep the
// pathname exactly as given, which is what a key-per-comment layout needs.
function blobOptions(): { access: 'private'; token: string } {
  if (!storageReady()) {
    throw new Error('Vercel Blob is not configured (BLOB_READ_WRITE_TOKEN)')
  }
  return { access: 'private', token: env.blob.token }
}

/** Every pathname under a prefix, following Blob's pagination cursor. */
async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ ...blobOptions(), prefix, cursor, limit: 1000 })
    for (const blob of page.blobs) keys.push(blob.pathname)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return keys
}

async function readText(key: string): Promise<string | null> {
  // useCache: false — a reaction toggle is a read-modify-write, so a cached read
  // would faithfully restore the reaction set we are about to replace.
  const found = await get(key, { ...blobOptions(), useCache: false })
  if (!found) return null
  return Buffer.from(await new Response(found.stream).arrayBuffer()).toString('utf8')
}

function parseComment(raw: string): Comment | null {
  let parsed: Partial<Comment>
  try {
    parsed = JSON.parse(raw) as Partial<Comment>
  } catch {
    // A half-written object (or a file we did not put there) should not take
    // down the whole thread — skip it and keep the rest.
    return null
  }
  if (typeof parsed.id !== 'string' || typeof parsed.body !== 'string') return null
  // Rebuilt field by field: a hand-edited or half-migrated object must not smuggle
  // unexpected shapes into the API responses.
  return {
    id: parsed.id,
    slug: typeof parsed.slug === 'string' ? parsed.slug : '',
    name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Anonymous',
    body: parsed.body,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString(),
    ...(typeof parsed.parentId === 'string' && parsed.parentId ? { parentId: parsed.parentId } : {}),
    ...(typeof parsed.quote === 'string' && parsed.quote ? { quote: parsed.quote } : {}),
    ...(parsed.reactions && typeof parsed.reactions === 'object' ? { reactions: parsed.reactions } : {}),
  }
}

/**
 * The thread's current version: the marker's etag, or 'none' for a thread that has
 * never changed since markers were introduced (its first write creates one).
 */
export async function threadVersion(slug: string): Promise<string> {
  try {
    const meta = await head(versionKey(slug), blobOptions())
    return meta.etag || meta.uploadedAt.toISOString()
  } catch (error) {
    if (error instanceof BlobNotFoundError) return 'none'
    throw error
  }
}

/** Called after every write to a thread, so readers see the version move. */
async function bumpVersion(slug: string): Promise<void> {
  await put(versionKey(slug), JSON.stringify({ at: Date.now() }), {
    ...blobOptions(),
    contentType: 'application/json',
    allowOverwrite: true,
  })
  threads.delete(slug)
}

// Per-instance cache of whole threads, keyed by version. Bounded because slugs come
// from the request (any well-formed slug can be asked for, existing post or not).
const MAX_CACHED_THREADS = 200
const threads = new Map<string, { version: string; comments: Comment[] }>()

/**
 * The whole thread at `version` (looked up when not given). Served from the cache
 * when the version matches; otherwise one list + one get per comment.
 */
export async function readThread(slug: string, version?: string): Promise<{ version: string; comments: Comment[] }> {
  const current = version ?? (await threadVersion(slug))
  const cached = threads.get(slug)
  if (cached && cached.version === current) return cached
  const keys = (await listKeys(slugPrefix(slug))).filter((key) => key.endsWith('.json'))
  const raws = await Promise.all(keys.map((key) => readText(key)))
  const comments = raws
    .filter((raw): raw is string => raw !== null)
    .map(parseComment)
    .filter((comment): comment is Comment => comment !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const thread = { version: current, comments }
  threads.delete(slug) // re-insert so the Map's order is least-recently-read first
  threads.set(slug, thread)
  if (threads.size > MAX_CACHED_THREADS) threads.delete(threads.keys().next().value!)
  return thread
}

export async function listComments(slug: string): Promise<Comment[]> {
  return (await readThread(slug)).comments
}

export async function putComment(comment: Comment): Promise<void> {
  await put(commentKey(comment.slug, comment.id), JSON.stringify(comment), {
    ...blobOptions(),
    contentType: 'application/json',
    // A reaction toggle rewrites this exact pathname, which Blob refuses by default.
    allowOverwrite: true,
  })
  await bumpVersion(comment.slug)
}

export async function removeComment(slug: string, id: string): Promise<void> {
  await del(commentKey(slug, id), blobOptions())
  await bumpVersion(slug)
}

/** Anonymous viewer identity, stored in localStorage and sent with reaction toggles. */
export const validViewer = (viewer: string): boolean => ID_RE.test(viewer)

// Read-modify-write on one object: two concurrent reactors could lose one toggle.
// At blog scale that is invisible; an ETag-guarded write would fix it if it ever
// mattered (`list` returns an etag that `put`'s precondition could check).
/** Null when the comment is gone (e.g. deleted while a reader had it open). */
export async function updateComment(
  slug: string,
  id: string,
  mutate: (comment: Comment) => Comment,
): Promise<Comment | null> {
  // One get of this comment, not the thread: fresher (no cache) and cheaper.
  const raw = await readText(commentKey(slug, id))
  const existing = raw === null ? null : parseComment(raw)
  if (!existing) return null
  const next = mutate(existing)
  await putComment(next)
  return next
}

// ------------------------------------------------------------------- avatar

// The profile avatar lives in Blob rather than being inlined into profile.json as
// a base64 data URL: that would put a ~700 KB blob in git, and every future edit to
// the profile would carry it again in the diff.
//
// Every upload is its own object, assets/avatars/{version}.{ext}, and the profile
// stores /api/avatar?v={version}. An upload therefore changes nothing on the live
// site until a profile save commits the new URL, and one URL always serves the same
// bytes — which is what makes the immutable cache header on /api/avatar honest.
const AVATAR_DIR = 'assets/avatars/'
// Uploads from before versioning: a single object overwritten in place. GET falls
// back to it while the committed profile still points at it, and pruning deletes it
// as soon as the committed profile points anywhere else. The trailing dot keeps the
// prefix from also matching 'assets/avatars/'.
const LEGACY_AVATAR_PREFIX = 'assets/avatar.'

const VERSION_RE = /^[0-9]{1,20}$/
export const validAvatarVersion = (version: string): boolean => VERSION_RE.test(version)

const AVATAR_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const contentTypeFor = (key: string): string =>
  AVATAR_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

export interface StoredAvatar {
  buffer: Buffer
  contentType: string
  /** False for the legacy object, whose bytes change under the same pathname. */
  immutable: boolean
}

const versionOf = (key: string): string => key.slice(AVATAR_DIR.length).split('.')[0]

/** Stores a new avatar version and returns it. Pruning is the caller's call (pruneAvatars). */
export async function putAvatar(buffer: Buffer, extension: string): Promise<string> {
  const version = String(Date.now())
  const key = `${AVATAR_DIR}${version}.${extension}`
  await put(key, buffer, { ...blobOptions(), contentType: contentTypeFor(key) })
  return version
}

/**
 * Deletes every avatar object except the versions in `keep`. The legacy object goes
 * too, unless a kept version has no versioned object — that is a pre-versioning URL
 * the committed profile still serves from the legacy object.
 */
export async function pruneAvatars(keep: string[]): Promise<void> {
  const versioned = await listKeys(AVATAR_DIR)
  const existing = new Set(versioned.map(versionOf))
  const keepLegacy = keep.some((v) => v && !existing.has(v))
  const stale = versioned.filter((k) => !keep.includes(versionOf(k)))
  if (!keepLegacy) stale.push(...(await listKeys(LEGACY_AVATAR_PREFIX)))
  await Promise.all(stale.map((k) => del(k, blobOptions())))
}

export async function getAvatar(version: string): Promise<StoredAvatar | null> {
  const [versioned] = validAvatarVersion(version) ? await listKeys(`${AVATAR_DIR}${version}.`) : []
  // An unknown version is an old URL: the legacy object while it exists, else the
  // newest version. That second case covers the minute between a profile save (which
  // deletes the legacy object) and the redeploy that ships the new URL.
  const key =
    versioned ??
    (await listKeys(LEGACY_AVATAR_PREFIX))[0] ??
    (await listKeys(AVATAR_DIR)).sort((a, b) => Number(versionOf(b)) - Number(versionOf(a)))[0]
  if (!key) return null
  // The legacy object is overwritten in place and the fallback changes with every
  // upload, so neither may come from a cache. An exact version never changes.
  const found = await get(key, { ...blobOptions(), useCache: Boolean(versioned) })
  if (!found) return null
  return {
    buffer: Buffer.from(await new Response(found.stream).arrayBuffer()),
    contentType: contentTypeFor(key),
    immutable: Boolean(versioned),
  }
}
