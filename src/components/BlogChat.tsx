import { useEffect, useRef, useState } from 'react'
import ChatBox from './ChatBox'
import { getPosts } from '../lib/store'
import { useT } from '../lib/i18n'

// Whether the panel is open lives outside React so the home page's "ask" buttons can
// open it before navigating to the blog, where the widget mounts.
let open = false
const listeners = new Set<(open: boolean) => void>()

export function setChatOpen(next: boolean): void {
  open = next
  listeners.forEach((listener) => listener(next))
}

/**
 * The blog's Q&A assistant: a floating button that opens a chat panel answering from
 * the blog posts. App mounts it on every blog page and keeps it mounted while the
 * reader moves between posts, so the conversation survives navigation; closing the
 * panel only hides it.
 */
export default function BlogChat() {
  const t = useT()
  const [isOpen, setIsOpen] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    listeners.add(setIsOpen)
    return () => { listeners.delete(setIsOpen) }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    panelRef.current?.querySelector('input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setChatOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  return (
    <>
      <div
        ref={panelRef}
        className="blog-chat"
        role="dialog"
        aria-label={t('chat.title')}
        hidden={!isOpen}
      >
        <div className="blog-chat-head">
          <div>
            <h2>{t('chat.title')}</h2>
            <p className="muted small">{t('chat.sub', { n: getPosts().filter((post) => !post.error).length })}</p>
          </div>
          <button className="link-btn" onClick={() => setChatOpen(false)} aria-label={t('chat.close')}>✕</button>
        </div>
        <ChatBox />
      </div>
      <button
        ref={buttonRef}
        className={`chat-fab ${isOpen ? 'is-open' : ''}`}
        onClick={() => setChatOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={isOpen ? t('chat.close') : t('chat.open')}
        title={isOpen ? t('chat.close') : t('chat.open')}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          {isOpen ? (
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6A.5.5 0 0 1 5 19.2V16h-.5A.5.5 0 0 1 4 15.5z"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
            />
          )}
        </svg>
      </button>
    </>
  )
}
