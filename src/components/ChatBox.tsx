import { useEffect, useState } from 'react'
import { getIndex, syncIndex } from '../lib/store'
import { retrieve, rerank, fallbackAnswer } from '../lib/rag'
import { apiConfigured, askChat, getChatStatus } from '../lib/api'
import { useLang, useT } from '../lib/i18n'
import { mdToHtml } from '../lib/markdown'

interface Msg { role: 'user' | 'ai'; text: string }

/** Answers already paid for in this visit, keyed by question + retrieved sections. */
const answers = new Map<string, string>()

// Asked once per visit and shared: a question sent before the reply arrives waits for
// it instead of falling back to raw retrieval.
let status: Promise<boolean> | null = null
const llmStatus = () =>
  (status ??= apiConfigured()
    ? getChatStatus().then((s) => s.llmEnabled, () => { status = null; return false })
    : Promise.resolve(false))

export default function ChatBox() {
  const lang = useLang()
  const t = useT()
  const [log, setLog] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  // null while we are still asking the server whether a key is configured.
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void llmStatus().then((enabled) => { if (alive) setLlmEnabled(enabled) })
    return () => { alive = false }
  }, [])

  const send = async () => {
    const query = q.trim()
    if (!query || busy) return
    setQ('')
    setLog((l) => [...l, { role: 'user', text: query }])
    setBusy(true)
    // Retrieval stays in the browser; only the model call goes to the backend, which
    // is what keeps the OpenRouter key out of the shipped JavaScript.
    const index = getIndex()
    const hits = rerank(query, retrieve(query, index), 3, index)
    // The model is only called when it has something to ground on: with no hits the
    // local "not found" answer is the right one and costs nothing. Repeated questions
    // in this visit reuse their answer.
    const key = `${lang}\u0000${query.toLowerCase()}\u0000${hits.map((h) => h.id).join(',')}`
    const llm = llmEnabled ?? (await llmStatus())
    try {
      const answer = !llm || !hits.length
        ? fallbackAnswer(query, hits)
        : answers.get(key) ?? (await askChat(query, hits, lang)).answer
      if (llm && hits.length) answers.set(key, answer)
      setLog((l) => [...l, { role: 'ai', text: answer }])
    } catch (e) {
      setLog((l) => [...l, {
        role: 'ai',
        text: `${t('chat.error', { msg: (e as Error).message })}\n\n${fallbackAnswer(query, hits)}`,
      }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      {llmEnabled === false && (
        <p className="muted small">
          {t('chat.noKey')}{' '}
          <button onClick={() => { syncIndex(); setLog((l) => [...l, { role: 'ai', text: t('chat.synced') }]) }}>
            {t('chat.sync')}
          </button>
        </p>
      )}
      <div className="chat-log" role="log" aria-live="polite">
        {log.map((m, i) => (
          m.role === 'ai'
            // Model answers come back as Markdown (lists, *emphasis*); the post renderer
            // escapes HTML and drops unsafe links, so it is safe to reuse here.
            ? <div key={i} className="msg ai md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }} />
            : <div key={i} className="msg user">{m.text}</div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.label')}
        />
        <button onClick={send} disabled={busy}>{busy ? '…' : t('chat.send')}</button>
      </div>
    </div>
  )
}
