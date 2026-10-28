import { t } from './i18n'
// ponytail: parent-child chunking + TF-IDF. No vector DB, no embeddings dep.
// Parents = markdown sections (split on headings, capped ~300 words).
// Children = ~60-word windows scored at retrieve time; hits resolve to the
// full parent section so the LLM reads complete context, not fragments.
export interface Chunk {
  id: string
  source: string // post title or 'Profile'
  sourceSlug: string // post slug or 'profile'
  text: string // child text — the retrieval unit
  parentId: string
  parentText: string // full parent section — the context unit
}

export interface ScoredChunk {
  id: string
  source: string
  sourceSlug: string
  text: string // parent text — what the LLM actually reads
  score: number
}

// Diacritics are folded away (nghiệm → nghiem, đ → d) on both sides, so Vietnamese
// letters survive tokenizing and a query typed without accents still matches.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const tok = (s: string) => fold(s).replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 1)

const PARENT_MAX_WORDS = 300
const CHILD_SIZE = 60
const CHILD_OVERLAP = 15

interface Parent { id: string; text: string }

function splitParents(sourceSlug: string, text: string): Parent[] {
  const parents: Parent[] = []
  let heading = ''
  let buf: string[] = []
  const flush = () => {
    const body = buf.join('\n').trim()
    buf = []
    if (!body) return
    const words = body.split(/\s+/)
    const push = (t: string) => parents.push({ id: `${sourceSlug}#p${parents.length}`, text: t })
    if (words.length <= PARENT_MAX_WORDS) {
      push(heading ? `${heading}\n${body}` : body)
    } else {
      // long section → sequential sub-parents, no overlap
      for (let i = 0; i < words.length; i += PARENT_MAX_WORDS) {
        const piece = words.slice(i, i + PARENT_MAX_WORDS).join(' ')
        push(heading ? `${heading}\n${piece}` : piece)
      }
    }
  }
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,3}\s+(.*)/)
    if (h) { flush(); heading = h[1].trim() }
    else buf.push(line)
  }
  flush()
  if (!parents.length) parents.push({ id: `${sourceSlug}#p0`, text })
  return parents
}

export function chunkParentChild(source: string, sourceSlug: string, text: string): Chunk[] {
  const out: Chunk[] = []
  for (const p of splitParents(sourceSlug, text)) {
    const words = p.text.split(/\s+/)
    if (words.length <= CHILD_SIZE) {
      out.push({ id: `${p.id}c0`, source, sourceSlug, text: p.text, parentId: p.id, parentText: p.text })
      continue
    }
    let k = 0
    for (let i = 0; i < words.length; i += CHILD_SIZE - CHILD_OVERLAP) {
      const slice = words.slice(i, i + CHILD_SIZE).join(' ')
      if (slice.trim()) out.push({ id: `${p.id}c${k++}`, source, sourceSlug, text: slice, parentId: p.id, parentText: p.text })
      if (i + CHILD_SIZE >= words.length) break
    }
  }
  return out
}

// Everything about the index that does not depend on the query, computed once per
// index instead of once per question: per-chunk term counts, document frequencies,
// title terms and folded text. Re-tokenizing every chunk on every question made a
// query cost grow with the whole blog (75 ms at 200 posts).
interface Prepared {
  tf: Map<string, number>[]
  len: number[]
  df: Map<string, number>
  titles: Set<string>[]
  folded: string[]
}
const prepared = new WeakMap<Chunk[], Prepared>()

function prepare(chunks: Chunk[]): Prepared {
  const hit = prepared.get(chunks)
  if (hit) return hit
  const df = new Map<string, number>()
  const tf: Map<string, number>[] = []
  const len: number[] = []
  for (const c of chunks) {
    const d = tok(c.source + ' ' + c.text)
    const counts = new Map<string, number>()
    for (const w of d) counts.set(w, (counts.get(w) ?? 0) + 1)
    for (const w of counts.keys()) df.set(w, (df.get(w) ?? 0) + 1)
    tf.push(counts)
    len.push(d.length)
  }
  const result = { tf, len, df, titles: chunks.map((c) => new Set(tok(c.source))), folded: chunks.map((c) => fold(c.text)) }
  prepared.set(chunks, result)
  return result
}

// Retrieve: score children with TF-IDF, keep best child per parent,
// return top-k parents (full-section context).
export function retrieve(query: string, chunks: Chunk[], k = 10): ScoredChunk[] {
  const q = tok(query)
  if (!q.length || !chunks.length) return []
  const { tf: tfs, len, df, titles, folded } = prepare(chunks)
  const N = chunks.length
  const best = new Map<string, { chunk: Chunk; score: number }>()
  chunks.forEach((c, i) => {
    const tf = tfs[i]
    let s = 0
    for (const w of q) {
      const f = tf.get(w) ?? 0
      if (!f) continue
      s += (f / len[i]) * Math.log(1 + N / (df.get(w) ?? 1))
      if (titles[i].has(w)) s += 0.5 // title boost
      if (w.length > 4 && folded[i].includes(w)) s += 0.1 // exact-term boost
    }
    const prev = best.get(c.parentId)
    if (s > 0 && (!prev || s > prev.score)) best.set(c.parentId, { chunk: c, score: s })
  })
  return [...best.values()]
    .map(({ chunk: c, score }) => ({ id: c.parentId, source: c.source, sourceSlug: c.sourceSlug, text: c.parentText, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// Rerank: prefer parents covering more distinct query terms → top 3.
export function rerank(query: string, hits: ScoredChunk[], top = 3): ScoredChunk[] {
  const q = [...new Set(tok(query))]
  const covered = (hit: ScoredChunk) => {
    const text = fold(hit.text)
    return q.filter((w) => text.includes(w)).length
  }
  return hits
    .map((hit) => ({ hit, coverage: covered(hit) }))
    .sort((a, b) => b.coverage - a.coverage || b.hit.score - a.hit.score)
    .map(({ hit }) => hit)
    .slice(0, top)
}

// Retrieval-only answer used when no API key is set.
export function fallbackAnswer(query: string, top: ScoredChunk[]): string {
  if (!top.length) return t('chat.notFound', { q: query })
  const cites = [...new Set(top.map((c) => c.source))].map((s) => `[${s}]`).join(' ')
  return `${t('chat.basedOn')}\n\n${top.map((c) => `• ${c.text.slice(0, 450)}…`).join('\n')}\n\n${t('chat.sources')} ${cites}\n\n${t('chat.raw')}`
}
