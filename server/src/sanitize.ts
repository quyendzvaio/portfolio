// Everything that turns untrusted input into safe values lives here: no imports, no
// side effects, so it can be exercised directly without starting the HTTP server.
//
// The profile is the reason this module exists. It is written straight into the repo
// and then rendered into href/src attributes on the live site, so a `javascript:`
// URL that survived would be stored XSS on every page.

export const MAX_LINKS = 12
export const MAX_SKILLS = 16
const MAX_SKILL_CHARS = 32
export const MAX_STATS = 4

/** Reaction picker vocabulary — also the allow-list for stored reaction maps. */
export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad'] as const

/** Deduplicated, key-validated reaction list for one viewer on one comment. */
export function sanitizeReactions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const picked = new Set<string>()
  for (const entry of value) {
    if (typeof entry === 'string' && (REACTIONS as readonly string[]).includes(entry)) picked.add(entry)
  }
  return [...picked]
}

/** Strip control characters, tame runaway newlines, trim to a hard cap. */
export function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max)
}

/** http(s) only — used for image sources and the LinkedIn field. */
function httpUrl(value: unknown, max: number): string {
  const raw = clean(value, max)
  return /^https?:\/\//i.test(raw) ? raw : ''
}

/**
 * http(s), or an image file bundled with the site (`avatar.webp` in public/). The
 * relative form has no scheme, no `..` and no leading `//`, so it can only name a
 * file next to the page.
 */
function imageSrc(value: unknown, max: number): string {
  const raw = clean(value, max)
  if (/^https?:\/\//i.test(raw)) return raw
  return /^(\.\/)?[\w-]+(\/[\w-]+)*\.(png|jpe?g|webp|gif|avif|svg)$/i.test(raw) ? raw : ''
}

/** Link targets may also be mailto:/tel:. Everything else is dropped. */
function linkUrl(value: unknown, max: number): string {
  const raw = clean(value, max)
  return /^(https?:\/\/|mailto:|tel:)/i.test(raw) ? raw : ''
}

/**
 * Rebuilds the profile from scratch rather than trusting the payload: every field is
 * re-derived from an allow-list, and unknown fields are simply not read.
 */
export function sanitizeProfile(input: unknown): Record<string, unknown> {
  const source = (input ?? {}) as Record<string, unknown>

  // Filter first, cap second: capping the input would let a couple of rejected
  // entries eat slots that valid links should have filled. The 16 KB request-body
  // limit is what keeps the flatMap below from being a CPU problem.
  const links = (Array.isArray(source.links) ? source.links : [])
    .flatMap((entry) => {
      const link = (entry ?? {}) as Record<string, unknown>
      const url = linkUrl(link.url, 300)
      if (!url) return []
      return [{ label: clean(link.label, 40) || url, url }]
    })
    .slice(0, MAX_LINKS)

  const gmail = clean(source.gmail, 200).replace(/\s/g, '')

  const skills = (Array.isArray(source.skills) ? source.skills : [])
    .map((skill) => clean(skill, MAX_SKILL_CHARS))
    .filter(Boolean)
    .slice(0, MAX_SKILLS)

  const stats = (Array.isArray(source.stats) ? source.stats : [])
    .flatMap((entry) => {
      const stat = (entry ?? {}) as Record<string, unknown>
      const value = clean(stat.value, 12)
      const label = clean(stat.label, 40)
      return value && label ? [{ value, label }] : []
    })
    .slice(0, MAX_STATS)

  return {
    name: clean(source.name, 80) || 'Your name',
    role: clean(source.role, 120),
    intro: clean(source.intro, 1000),
    avatar: imageSrc(source.avatar, 500),
    available: clean(source.available, 80),
    skills,
    stats,
    linkedin: httpUrl(source.linkedin, 300),
    // Kept as a bare value — the frontend builds the tel: link itself. Stripping the
    // letters can expose trailing space, so this trims again after the replace.
    phone: clean(source.phone, 40).replace(/[^\d+\s()-]/g, '').trim(),
    gmail: gmail.includes('@') ? gmail : '',
    links,
  }
}

/** Detected from the bytes, never from the client's Content-Type header. */
export function sniffImage(buffer: Buffer): { extension: string } | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { extension: 'png' }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: 'jpg' }
  const six = buffer.subarray(0, 6).toString('ascii')
  if (six === 'GIF89a' || six === 'GIF87a') return { extension: 'gif' }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp' }
  }
  return null
}
