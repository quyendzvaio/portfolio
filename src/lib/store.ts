import { parseMd, type Frontmatter } from './markdown'
import { chunkParentChild, type Chunk } from './rag'
import profileJson from '../content/profile.json'
import { getLang, type Lang } from './i18n'

export interface Profile {
  name: string
  role: string
  intro: string
  avatar: string
  linkedin: string
  phone: string
  gmail: string
  links: { label: string; url: string }[]
  // Landing-page extras. Optional so an older profile.json still renders.
  /** Status line in the hero badge; empty hides the badge. */
  available?: string
  /** The Skills section; the first three also label the portrait. */
  skills?: string[]
  /** Up to four headline numbers; a leading number counts up on screen. */
  stats?: { value: string; label: string }[]
  /** Vietnamese text for the fields that are prose; anything missing falls back to English. */
  vi?: Partial<Pick<Profile, 'name' | 'role' | 'intro' | 'available'>>
}

export interface Post {
  slug: string
  /** The language this copy is written in; a post with no `.vi.md` shows its English copy. */
  lang: Lang
  meta: Frontmatter
  body: string
  error?: string
}

// Blog posts are bundled at build time from src/content/*.md and are edited by
// committing to git, then redeployed. That is why there is no localStorage overlay
// for posts any more: an admin edit that only existed in one browser looked like it
// worked while every visitor kept seeing the old post. Comments are the part that
// needs a writable store, and those live in Vercel Blob behind the backend.
const mdFiles = import.meta.glob<string>('../content/*.md', { eager: true, query: '?raw', import: 'default' })

const LS_INDEX = 'portfolio.index.v1'

// Serves the profile bundled at build time. Admin edits go through the backend into
// git instead of here: a localStorage copy was only ever visible in the browser that
// wrote it, so the owner would "save" a change and every visitor kept seeing the old
// one. The deployed bundle is the single source of truth between deploys.
export function getProfile(lang: Lang = getLang()): Profile {
  const profile = profileJson as Profile
  if (lang !== 'vi' || !profile.vi) return profile
  const overrides = Object.fromEntries(Object.entries(profile.vi).filter(([, value]) => value))
  return { ...profile, ...overrides }
}

// `<slug>.md` is the English copy and `<slug>.vi.md` the Vietnamese one; both share the
// slug, so a post keeps one URL and one comment thread in either language.
function postsByLang(): Map<string, Partial<Record<Lang, Post>>> {
  const bySlug = new Map<string, Partial<Record<Lang, Post>>>()
  for (const [path, raw] of Object.entries(mdFiles)) {
    const file = path.split('/').pop()!
    const lang: Lang = file.endsWith('.vi.md') ? 'vi' : 'en'
    const slug = file.replace(/(\.vi)?\.md$/, '')
    const copies = bySlug.get(slug) ?? {}
    copies[lang] = { slug, lang, ...parseMd(raw as string) }
    bySlug.set(slug, copies)
  }
  return bySlug
}
const allPosts = postsByLang()

export function getPosts(lang: Lang = getLang()): Post[] {
  const posts = [...allPosts.values()].map((copies) => (copies[lang] ?? copies.en ?? copies.vi)!)
  return posts.sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''))
}

// Sync: rebuild the chunk index from current posts + profile, persist the timestamp.
// One index per language, so a question is matched against the copy the reader sees.
export interface IndexMeta { syncedAt: string; chunkCount: number; postCount: number }
const cache = new Map<Lang, Chunk[]>()

export function buildIndex(lang: Lang = getLang()): Chunk[] {
  const chunks: Chunk[] = []
  const p = getProfile(lang)
  const extras = [
    p.available ? `Availability: ${p.available}.` : '',
    p.skills?.length ? `Skills: ${p.skills.join(', ')}.` : '',
    p.stats?.length ? `Highlights: ${p.stats.map((s) => `${s.value} ${s.label}`).join('; ')}.` : '',
  ].filter(Boolean).join(' ')
  chunks.push(...chunkParentChild('Profile', 'profile',
    `${p.name} ${p.role} ${p.intro} ${extras} Contact: LinkedIn ${p.linkedin}, phone ${p.phone}, email ${p.gmail}.`))
  const posts = getPosts(lang)
  for (const post of posts) {
    if (post.error) continue
    chunks.push(...chunkParentChild(post.meta.title, post.slug, `${post.meta.title}. ${post.meta.summary}. ${post.body}`))
  }
  cache.set(lang, chunks)
  const meta: IndexMeta = { syncedAt: new Date().toISOString(), chunkCount: chunks.length, postCount: posts.length }
  try { localStorage.setItem(LS_INDEX, JSON.stringify(meta)) } catch { /* ignore */ }
  return chunks
}

export function getIndex(lang: Lang = getLang()): Chunk[] {
  return cache.get(lang) ?? buildIndex(lang)
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
