// ponytail: hand-rolled frontmatter + small md renderer, no new deps. It covers what the
// posts use: headings, paragraphs, flat lists, fenced code, tables, quotes, images.
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

export function parseMd(input: string): ParsedMd {
  // A file saved with Windows line endings would otherwise fail the frontmatter match.
  const raw = input.replace(/\r\n?/g, '\n')
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
  // Posts open with `# <title>`, which the page already shows as its <h1>.
  const body = m[2].replace(/^\s*#\s+(.+)\n/, (line, heading: string) => (heading.trim() === meta.title ? '' : line))
  return { meta, body }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Only web links, mail links, in-page anchors and same-site relative paths survive,
// so a stray `javascript:` URL in a post can never become a live link.
function safeUrl(url: string, image = false): string | null {
  if (/^https:\/\//i.test(url)) return url
  if (!image && /^(http:\/\/|mailto:|#)/i.test(url)) return url
  if (/^[\w-]+(\/[\w.-]+)*\.[a-z0-9]+$/i.test(url)) return url
  return null
}

const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

const FENCE = /^```\s*([\w+-]*)\s*$/
const startsBlock = (line: string) =>
  FENCE.test(line) || /^#{1,4}\s/.test(line) || /^[-*]\s/.test(line) || /^\d+\.\s/.test(line) ||
  /^>/.test(line) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line) || /^\|/.test(line)

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(FENCE)
    if (fence) {
      const code: string[] = []
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) code.push(lines[i])
      i++
      const lang = fence[1] ? ` data-lang="${esc(fence[1])}"` : ''
      out.push(`<pre class="code"${lang}><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    if (!line.trim()) { i++; continue }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const html = inline(heading[2].trim())
      out.push(`<h${level} id="${slugify(html)}">${html}</h${level}>`)
      i++
      continue
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/)
    if (image) {
      const src = safeUrl(image[2], true)
      if (src) {
        const alt = esc(image[1])
        // Diagrams are drawn 1200px wide; on a phone the link opens them full size.
        out.push(`<figure><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async" /></a>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`)
      }
      i++
      continue
    }

    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const align = cells(lines[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : ''))
      const cell = (tag: string, text: string, k: number) =>
        `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(text)}</${tag}>`
      let html = `<div class="table-wrap"><table><thead><tr>${cells(line).map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>`
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) {
        html += `<tr>${cells(lines[i]).map((c, k) => cell('td', c, k)).join('')}</tr>`
      }
      out.push(`${html}</tbody></table></div>`)
      continue
    }

    if (/^>/.test(line)) {
      const quote: string[] = []
      for (; i < lines.length && /^>/.test(lines[i]); i++) quote.push(lines[i].replace(/^>\s?/, ''))
      const paras = quote.join('\n').split(/\n\s*\n/).map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`)
      out.push(`<blockquote>${paras.join('')}</blockquote>`)
      continue
    }

    const ordered = /^\d+\.\s/.test(line)
    if (ordered || /^[-*]\s/.test(line)) {
      const marker = ordered ? /^\d+\.\s+/ : /^[-*]\s+/
      const start = ordered ? Number(line.match(/^\d+/)![0]) : 1
      const items: string[] = []
      for (; i < lines.length && marker.test(lines[i]); i++) {
        let item = lines[i].replace(marker, '')
        // A wrapped item continues on indented lines.
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) item += ` ${lines[++i].trim()}`
        items.push(`<li>${inline(item)}</li>`)
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`)
      continue
    }

    const para: string[] = [line.trim()]
    for (i++; i < lines.length && lines[i].trim() && !startsBlock(lines[i]); i++) para.push(lines[i].trim())
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}

// Code spans are swapped for placeholders first, so `**` or `*` inside them stays
// literal while bold around them (**`draft` is separate**) still pairs up.
function inline(s: string): string {
  const codes: string[] = []
  const text = s.replace(/`([^`]+)`/g, (whole, code: string) => `\u0000${codes.push(`<code>${esc(code)}</code>`) - 1}\u0000`)
  return emphasis(esc(text)).replace(/\u0000(\d+)\u0000/g, (whole, i: string) => codes[Number(i)])
}

function emphasis(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'))
      if (!href) return text
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${esc(href)}"${external}>${text}</a>`
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\w*])/g, '$1<em>$2</em>')
}
