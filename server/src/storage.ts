import { Client } from 'minio'
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

let client: Client | null = null

function getClient(): Client {
  if (!storageReady()) {
    throw new Error('MinIO is not configured (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY)')
  }
  if (!client) {
    client = new Client({
      endPoint: env.minio.endPoint,
      port: env.minio.port,
      useSSL: env.minio.useSSL,
      accessKey: env.minio.accessKey,
      secretKey: env.minio.secretKey,
    })
  }
  return client
}

export async function ensureBucket(): Promise<void> {
  const minio = getClient()
  if (!(await minio.bucketExists(env.minio.bucket))) {
    await minio.makeBucket(env.minio.bucket)
  }
}

async function readObject(key: string): Promise<string> {
  const stream = await getClient().getObject(env.minio.bucket, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
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
  const minio = getClient()
  const keys: string[] = []
  const listed = minio.listObjectsV2(env.minio.bucket, slugPrefix(slug), true)
  for await (const object of listed) {
    if (object.name?.endsWith('.json')) keys.push(object.name)
  }
  const raws = await Promise.all(keys.map((key) => readObject(key)))
  return raws
    .map(parseComment)
    .filter((comment): comment is Comment => comment !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putComment(comment: Comment): Promise<void> {
  const payload = Buffer.from(JSON.stringify(comment), 'utf8')
  await getClient().putObject(env.minio.bucket, commentKey(comment.slug, comment.id), payload, payload.length, {
    'Content-Type': 'application/json',
  })
}

export async function removeComment(slug: string, id: string): Promise<void> {
  await getClient().removeObject(env.minio.bucket, commentKey(slug, id))
}

/** Anonymous viewer identity, stored in localStorage and sent with reaction toggles. */
export const validViewer = (viewer: string): boolean => ID_RE.test(viewer)

// Read-modify-write on one object: two concurrent reactors could lose one toggle.
// At blog scale that is invisible; a MinIO-side conditional put would fix it if it
// ever mattered.
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

// The profile avatar lives in MinIO rather than being inlined into profile.json as
// a base64 data URL: that would put a ~700 KB blob in git, and every future edit to
// the profile would carry it again in the diff.
const AVATAR_STEM = 'assets/avatar'

const AVATAR_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const contentTypeFor = (key: string): string =>
  AVATAR_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

async function listAvatarKeys(): Promise<string[]> {
  const keys: string[] = []
  const listed = getClient().listObjectsV2(env.minio.bucket, AVATAR_STEM, false)
  for await (const object of listed) {
    if (object.name) keys.push(object.name)
  }
  return keys
}

export interface StoredAvatar {
  buffer: Buffer
  contentType: string
}

/** Replaces the avatar, dropping any previous one so exactly one object ever exists. */
export async function putAvatar(buffer: Buffer, extension: string): Promise<void> {
  const keep = `${AVATAR_STEM}.${extension}`
  const stale = (await listAvatarKeys()).filter((key) => key !== keep)
  await Promise.all(stale.map((key) => getClient().removeObject(env.minio.bucket, key)))
  await getClient().putObject(env.minio.bucket, keep, buffer, buffer.length, {
    'Content-Type': contentTypeFor(keep),
  })
}

export async function getAvatar(): Promise<StoredAvatar | null> {
  const keys = await listAvatarKeys()
  if (!keys.length) return null
  const stream = await getClient().getObject(env.minio.bucket, keys[0])
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return { buffer: Buffer.concat(chunks), contentType: contentTypeFor(keys[0]) }
}
