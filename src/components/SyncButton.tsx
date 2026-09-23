import { useState } from 'react'
import { syncIndex, type IndexMeta } from '../lib/store'

export default function SyncButton({ onSync }: { onSync?: (m: IndexMeta) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="row">
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setTimeout(() => {
            const m = syncIndex()
            setMsg(`Synced ${m.chunkCount} chunks from ${m.postCount} posts at ${new Date(m.syncedAt).toLocaleString()}`)
            onSync?.(m)
            setBusy(false)
          }, 50)
        }}
      >
        {busy ? 'Syncing…' : 'Sync RAG index'}
      </button>
      <span className="muted small">{msg}</span>
    </div>
  )
}
