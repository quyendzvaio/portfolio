import { del, get, list, put } from '@vercel/blob'
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
// other. The cost is one list + N gets per read, which is nothing at blog scale.
// Add a per-post summary object here if a post ever has thousands of comments.
const basePrefix = 'comments/'
const slugPrefix = (slug: string) => `${basePrefix}${slug}/`
const commentKey = (slug: string, id: string) => `${slugPrefix(slug)}${id}.json`

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

export async function listComments(slug: string): Promise<Comment[]> {
  const keys = (await listKeys(slugPrefix(slug))).filter((key) => key.endsWith('.json'))
  const raws = await Promise.all(keys.map((key) => readText(key)))
  return raws
    .filter((raw): raw is string => raw !== null)
    .map(parseComment)
    .filter((comment): comment is Comment => comment !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putComment(comment: Comment): Promise<void> {
  await put(commentKey(comment.slug, comment.id), JSON.stringify(comment), {
    ...blobOptions(),
    contentType: 'application/json',
    // A reaction toggle rewrites this exact pathname, which Blob refuses by default.
    allowOverwrite: true,
  })
}

export async function removeComment(slug: string, id: string): Promise<void> {
  await del(commentKey(slug, id), blobOptions())
}

/** Anonymous viewer identity, stored in localStorage and sent with reaction toggles. */
export const validViewer = (viewer: string): boolean => ID_RE.test(viewer)

// Read-modify-write on one object: two concurrent reactors could lose one toggle.
// At blog scale that is invisible; an ETag-guarded write would fix it if it ever
// mattered (`list` returns an etag that `put`'s precondition could check).
export async function updateComment(
  slug: string,
  id: string,
  mutate: (comment: Comment) => Comment,
): Promise<Comment> {
  const existing = (await listComments(slug)).find((comment) => comment.id === id)
  if (!existing) throw new Error(`comment ${id} not found`)
  const next = mutate(existing)
  await putComment(next)
  return next
}

// ------------------------------------------------------------------- avatar

// The profile avatar lives in Blob rather than being inlined into profile.json as
// a base64 data URL: that would put a ~700 KB blob in git, and every future edit to
// the profile would carry it again in the diff.
// The trailing dot matters: the prefix 'assets/avatar' alone would also match an
// unrelated 'assets/avatar-copy.png' and delete it as stale.
const AVATAR_PREFIX = 'assets/avatar.'

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
}

/** Replaces the avatar, dropping any previous one so exactly one object ever exists. */
export async function putAvatar(buffer: Buffer, extension: string): Promise<void> {
  const keep = `${AVATAR_PREFIX}${extension}`
  const stale = (await listKeys(AVATAR_PREFIX)).filter((key) => key !== keep)
  await Promise.all(stale.map((key) => del(key, blobOptions())))
  await put(keep, buffer, {
    ...blobOptions(),
    contentType: contentTypeFor(keep),
    // Uploading the same format twice targets the same pathname.
    allowOverwrite: true,
  })
}

export async function getAvatar(): Promise<StoredAvatar | null> {
  const keys = await listKeys(AVATAR_PREFIX)
  if (!keys.length) return null
  const found = await get(keys[0], blobOptions())
  if (!found) return null
  return {
    buffer: Buffer.from(await new Response(found.stream).arrayBuffer()),
    contentType: contentTypeFor(keys[0]),
  }
}
