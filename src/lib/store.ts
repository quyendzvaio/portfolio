import { parseMd, type Frontmatter } from './markdown'
import { chunkParentChild, type Chunk } from './rag'
import profileJson from '../content/profile.json'

export interface Profile {
  name: string
  role: string
  intro: string
  avatar: string
  linkedin: string
  phone: string
  gmail: string
  links: { label: string; url: string }[]
}

export interface Post {
  slug: string
  meta: Frontmatter
  body: string
  error?: string
}

// Blog posts are bundled at build time from src/content/*.md and are edited by
// committing to git, then redeployed. That is why there is no localStorage overlay
// for posts any more: an admin edit that only existed in one browser looked like it
// worked while every visitor kept seeing the old post. Comments are the part that
// needs a writable store, and those live in MinIO behind the backend.
const mdFiles = import.meta.glob<string>('../content/*.md', { eager: true, query: '?raw', import: 'default' })

const LS_INDEX = 'portfolio.index.v1'

// Serves the profile bundled at build time. Admin edits go through the backend into
// git instead of here: a localStorage copy was only ever visible in the browser that
// wrote it, so the owner would "save" a change and every visitor kept seeing the old
// one. The deployed bundle is the single source of truth between deploys.
export function getProfile(): Profile {
  return profileJson as Profile
}

export function getPosts(): Post[] {
  const posts: Post[] = []
  for (const [path, raw] of Object.entries(mdFiles)) {
    const slug = path.split('/').pop()!.replace(/\.md$/, '')
    posts.push({ slug, ...parseMd(raw as string) })
  }
  return posts.sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''))
}

// Sync: rebuild the chunk index from current posts + profile, persist the timestamp.
export interface IndexMeta { syncedAt: string; chunkCount: number; postCount: number }
let cache: Chunk[] | null = null

export function buildIndex(): Chunk[] {
  const chunks: Chunk[] = []
  const p = getProfile()
  chunks.push(...chunkParentChild('Profile', 'profile',
    `${p.name} ${p.role} ${p.intro} Contact: LinkedIn ${p.linkedin}, phone ${p.phone}, email ${p.gmail}.`))
  for (const post of getPosts()) {
    if (post.error) continue
    chunks.push(...chunkParentChild(post.meta.title, post.slug, `${post.meta.title}. ${post.meta.summary}. ${post.body}`))
  }
  cache = chunks
  const meta: IndexMeta = { syncedAt: new Date().toISOString(), chunkCount: chunks.length, postCount: getPosts().length }
  try { localStorage.setItem(LS_INDEX, JSON.stringify(meta)) } catch { /* ignore */ }
  return chunks
}

export function getIndex(): Chunk[] {
  return cache ?? buildIndex()
}

export function syncIndex(): IndexMeta {
  buildIndex()
  return getIndexMeta()
}

export function getIndexMeta(): IndexMeta {
  try {
    const raw = localStorage.getItem(LS_INDEX)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { syncedAt: '', chunkCount: 0, postCount: 0 }
}
