// ponytail: hand-rolled frontmatter + minimal md renderer, no new deps.
export interface Frontmatter {
  title: string
  date: string
  tags: string[]
  summary: string
}

export interface ParsedMd {
  meta: Frontmatter
  body: string
  error?: string
}

export function parseMd(raw: string): ParsedMd {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) {
    return {
      meta: { title: 'Untitled', date: '', tags: [], summary: '' },
      body: raw,
      error: 'Missing frontmatter block',
    }
  }
  const meta: Frontmatter = { title: 'Untitled', date: '', tags: [], summary: '' }
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'title') meta.title = v
    else if (k === 'date') meta.date = v
    else if (k === 'summary') meta.summary = v
    else if (k === 'tags') meta.tags = v.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  if (!meta.title || meta.title === 'Untitled') {
    return { meta, body: m[2], error: 'Missing title in frontmatter' }
  }
  return { meta, body: m[2] }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function mdToHtml(md: string): string {
  const lines = md.split('\n')
  let html = ''
  let listTag = ''
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (listTag) { html += `</${listTag}>`; listTag = '' }
      const lvl = line.match(/^#+/)![0].length
      html += `<h${lvl}>${inline(line.replace(/^#+\s/, ''))}</h${lvl}>`
    } else if (/^[-*]\s/.test(line)) {
      if (!listTag) { html += '<ul>'; listTag = 'ul' }
      html += `<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`
    } else if (/^\d+\.\s/.test(line)) {
      if (!listTag) { html += '<ol>'; listTag = 'ol' }
      html += `<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`
    } else if (line.trim() === '') {
      continue
    } else {
      html += `<p>${inline(line)}</p>`
    }
  }
  if (listTag) html += `</${listTag}>`
  return html
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}
