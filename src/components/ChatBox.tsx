import { useEffect, useState } from 'react'
import { getIndex, syncIndex } from '../lib/store'
import { retrieve, rerank, fallbackAnswer } from '../lib/rag'
import { apiConfigured, askChat, getChatStatus } from '../lib/api'

interface Msg { role: 'user' | 'ai'; text: string }

export default function ChatBox() {
  const [log, setLog] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  // null while we are still asking the server whether a key is configured.
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (!apiConfigured()) {
      setLlmEnabled(false)
      return
    }
    getChatStatus()
      .then((status) => setLlmEnabled(status.llmEnabled))
      .catch(() => setLlmEnabled(false))
  }, [])

  const send = async () => {
    const query = q.trim()
    if (!query || busy) return
    setQ('')
    setLog((l) => [...l, { role: 'user', text: query }])
    setBusy(true)
    // Retrieval stays in the browser; only the model call goes to the backend, which
    // is what keeps the OpenRouter key out of the shipped JavaScript.
    const hits = rerank(query, retrieve(query, getIndex()))
    try {
      const answer = llmEnabled ? (await askChat(query, hits)).answer : fallbackAnswer(query, hits)
      setLog((l) => [...l, { role: 'ai', text: answer }])
    } catch (e) {
      setLog((l) => [...l, {
        role: 'ai',
        text: `Chat error: ${(e as Error).message}. Showing retrieval instead.\n\n${fallbackAnswer(query, hits)}`,
      }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      {llmEnabled === false && (
        <p className="muted small">
          The backend has no OpenRouter key set — running in retrieval-only mode.{' '}
          <button onClick={() => { syncIndex(); setLog((l) => [...l, { role: 'ai', text: 'Index synced. Ask again.' }]) }}>
            Sync index
          </button>
        </p>
      )}
      <div className="chat-log" role="log" aria-live="polite">
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about the owner, skills, or blog posts…"
          aria-label="Ask about this portfolio"
        />
        <button onClick={send} disabled={busy}>{busy ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}
