import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import {
  apiConfigured,
  createComment,
  deleteComment,
  getMe,
  listComments,
  toggleReaction,
  type ApiComment,
} from '../lib/api'

const NAME_KEY = 'portfolio.commenter.name'
const VIEWER_KEY = 'portfolio.viewer.id'

const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad'] as const
type ReactionKind = (typeof REACTIONS)[number]
const EMOJI: Record<ReactionKind, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
}

const byNewest = (a: ApiComment, b: ApiComment) => a.createdAt.localeCompare(b.createdAt)

// Polling, not a stream: the backend is serverless, so an in-process fan-out cannot
// reach a comment written in another instance. A poll runs only while the thread is
// on screen in a visible tab, starts every POLL_MIN_MS and backs off toward
// POLL_MAX_MS while nothing changes; any change or own action resets it. Each poll
// sends the last version, so a quiet thread costs one cheap check on the backend.
const POLL_MIN_MS = 5000
const POLL_MAX_MS = 30000
const POLL_BACKOFF = 1.6

const when = (iso: string) => {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString()
}

/** Stable per-browser identity for reaction toggles — no account, no PII. */
const viewerId = (): string => {
  let id = localStorage.getItem(VIEWER_KEY)
  if (!id || !/^[a-f0-9-]{1,64}$/.test(id)) {
    id = crypto.randomUUID()
    localStorage.setItem(VIEWER_KEY, id)
  }
  return id
}

/** True when the selection starts and ends inside the same block element. */
const withinBlock = (range: Range, block: Element): boolean =>
  block.contains(range.startContainer) && block.contains(range.endContainer)

interface QuotedSelection {
  block: Element
  text: string
}

// Everyone may comment, so the thread is public and the name is unverified — the
// backend rate-limits by IP and the owner can delete from here. bodyRef points at
// the rendered markdown so selections inside it can be quoted.
export default function Comments({
  slug,
  bodyRef,
}: {
  slug: string
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const [comments, setComments] = useState<ApiComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [quoted, setQuoted] = useState<QuotedSelection | null>(null)
  const [quotePos, setQuotePos] = useState<{ top: number; left: number } | null>(null)
  // The popup is portaled into the <article>: the comment card animates with a
  // transform, and a transformed ancestor becomes the positioning containing block
  // for absolutely-positioned children — which pinned the popup to the bottom of
  // the page. Inside the article (plain position: relative) top/left are honored.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null)
  const [replyTo, setReplyTo] = useState<ApiComment | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [hoverReactions, setHoverReactions] = useState<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const versionRef = useRef('')
  const pollDelay = useRef(POLL_MIN_MS)

  /** Fetches the thread unless it is unchanged; true when something new arrived. */
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const result = await listComments(slug, versionRef.current || undefined)
      setError('')
      if (result.unchanged || !result.comments) return false
      versionRef.current = result.version
      setComments(result.comments)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (!apiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setComments([])
    versionRef.current = ''
    pollDelay.current = POLL_MIN_MS
    setQuoted(null)
    setQuotePos(null)
    setReplyTo(null)
    setPortalEl(bodyRef.current?.closest('article') ?? null)
    void load()
    getMe()
      .then((me) => setAdmin(me.admin))
      .catch(() => setAdmin(false))
  }, [slug, load])

  // `load` swaps in the whole thread, so a comment created in another tab, edited by
  // a reaction, or deleted by the owner all land through the same path. Readers who
  // never scroll to the thread cost only the first load.
  useEffect(() => {
    if (!apiConfigured() || !sectionRef.current) return
    let onScreen = false
    let timer = 0
    let stopped = false
    const active = () => onScreen && !document.hidden
    const schedule = () => {
      window.clearTimeout(timer)
      if (!stopped && active()) timer = window.setTimeout(tick, pollDelay.current)
    }
    const tick = async () => {
      const changed = await load()
      pollDelay.current = changed ? POLL_MIN_MS : Math.min(POLL_MAX_MS, pollDelay.current * POLL_BACKOFF)
      schedule()
    }
    // Coming back on screen catches up at once, then polls from the fast end again.
    const resume = () => {
      setLive(active())
      window.clearTimeout(timer)
      if (!active()) return
      pollDelay.current = POLL_MIN_MS
      void tick()
    }
    const observer = new IntersectionObserver(([entry]) => {
      const was = onScreen
      onScreen = entry.isIntersecting
      if (onScreen !== was) resume()
    })
    observer.observe(sectionRef.current)
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', resume)
      setLive(false)
    }
  }, [slug, load])

  // Click-away and Escape close the kebab menu and the reaction bar. The quote
  // popup is deliberately NOT closed here: the mouseup that finishes a selection
  // still fires a click, which would kill the popup the moment it appeared. The
  // selectionchange handler below closes it when the selection actually collapses.
  useEffect(() => {
    const close = () => {
      setOpenMenu(null)
      setHoverReactions(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        setQuoted(null)
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!apiConfigured()) {
    return (
      <section className="card">
        <h3>Discuss this post</h3>
        <p className="muted small">
          Comments are off in this build. Owner: set <code>VITE_API_BASE_URL</code> to the backend URL and rebuild.
        </p>
      </section>
    )
  }

  const viewer = viewerId()

  const submit = async () => {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    try {
      // parentId is the comment actually being answered: the server quotes it and
      // re-points a reply-to-a-reply at the top-level comment so threads stay one
      // level deep. The quote carries the highlighted passage, if any.
      const result = await createComment(slug, name.trim(), text, {
        parentId: replyTo?.id,
        quote: quoted?.text || undefined,
      })
      localStorage.setItem(NAME_KEY, name.trim())
      setBody('')
      setError('')
      setReplyTo(null)
      setQuoted(null)
      setQuotePos(null)
      // Insert now rather than waiting for the next poll, so this comment appears
      // the instant it is accepted.
      pollDelay.current = POLL_MIN_MS
      setComments((current) =>
        current.some((c) => c.id === result.comment.id)
          ? current
          : [...current, result.comment].sort(byNewest),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const remove = async (comment: ApiComment) => {
    if (!confirm(`Delete the comment from ${comment.name}?`)) return
    try {
      await deleteComment(slug, comment.id)
      pollDelay.current = POLL_MIN_MS
      setComments((current) => current.filter((c) => c.id !== comment.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const react = async (comment: ApiComment, kind: ReactionKind) => {
    const current = comment.reactions?.[viewer] ?? []
    // An empty list is sent too: it removes this viewer's entry on the server, so the
    // next poll does not bring a just-removed reaction back.
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
    try {
      const result = await toggleReaction(slug, comment.id, viewer, next)
      pollDelay.current = POLL_MIN_MS
      setError('')
      setComments((all) => all.map((c) => (c.id === comment.id ? result.comment : c)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // selectionchange fires many times per drag; the length check inside is what stops
  // the quote popup from flickering while the user sweeps the mouse. Clicking into
  // the popup collapses the document selection, so mousedown on the popup raises a
  // one-shot guard and a focused popup input short-circuits the handler — either
  // way typing never tears down the box the user is typing in.
  const popupGuard = useRef(false)
  const handleSelection = () => {
    if (popupGuard.current) {
      popupGuard.current = false
      return
    }
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.quote-pop')) return
    const root = bodyRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.isCollapsed) {
      setQuoted(null)
      return
    }
    const range = selection.getRangeAt(0)
    // Walk up from the range start, not from the common ancestor: a selection that
    // crosses inline nodes (bold, code) has the block element itself as the common
    // ancestor, whose parent is the list/section — closest() would find nothing.
    const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const block = startEl?.closest('p, li, h1, h2, h3, blockquote') ?? null
    if (!block || !root.contains(block) || !withinBlock(range, block)) {
      setQuoted(null)
      return
    }
    const text = range.toString().replace(/\s+/g, ' ').trim()
    if (text.length < 2) {
      setQuoted(null)
      return
    }
    // The popup is positioned against the article container, not the page, so
    // scrolling the page does not detach it from the highlighted paragraph.
    const article = root.closest('article')
    if (!article) {
      setQuoted(null)
      return
    }
    const articleRect = article.getBoundingClientRect()
    const rect = block.getBoundingClientRect()
    const popupWidth = Math.min(360, articleRect.width - 24)
    setPortalEl(article)
    setQuotePos({
      top: rect.bottom - articleRect.top + 8,
      left: Math.max(12, Math.min(rect.left - articleRect.left, articleRect.width - popupWidth - 12)),
    })
    setQuoted({ block, text })
  }

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [])

  // Dashed outline on the paragraph being quoted; cleared when the popup goes away.
  useEffect(() => {
    document.querySelectorAll('.sel-target').forEach((el) => el.classList.remove('sel-target'))
    quoted?.block.classList.add('sel-target')
    return () => quoted?.block.classList.remove('sel-target')
  }, [quoted])

  // Replies indent under their parent; every card carries the same hover bar.
  // A comment whose parent was deleted falls back to top level instead of vanishing.
  const ids = new Set(comments.map((c) => c.id))
  const roots = comments.filter((c) => !c.parentId || !ids.has(c.parentId))

  return (
    <section className="card" ref={sectionRef}>
      {/* The instant popup is portaled into the <article> so its absolute top/left
          are measured from the article itself — see portalEl above for why. */}
      {quoted && quotePos && portalEl && createPortal(
        <div className="quote-pop" style={{ top: quotePos.top, left: quotePos.left }} onMouseDown={() => { popupGuard.current = true }} onClick={(e) => e.stopPropagation()}>
          <p className="quote-text">“{quoted.text}”</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={40}
            aria-label="Your name"
          />
          <div className="row">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit()
              }}
              rows={2}
              maxLength={2000}
              placeholder="Comment on this selection…"
              aria-label="Comment on selection"
            />
          </div>
          <div className="comment-actions">
            <button onClick={() => void submit()} disabled={sending || !body.trim()}>
              {sending ? 'Posting…' : 'Comment'}
            </button>
            <button className="link-btn" onClick={() => { setQuoted(null); setBody('') }}>
              cancel
            </button>
          </div>
        </div>,
        portalEl,
      )}
      <div className="comment-head">
        <h3>Discuss this post</h3>
        <span className={`live ${live ? 'on' : ''}`} title={live ? 'Auto-refreshing while this thread is on screen' : 'Auto-refresh paused'}>
          <span className="live-dot" />
          {live ? 'live' : 'offline'}
        </span>
      </div>

      <p className="muted small hint-select">
        Tip: select any paragraph in the post to comment on exactly that passage.
      </p>

      {error && <p className="warn small">⚠ {error}</p>}
      {loading && <p className="muted small">Loading comments…</p>}
      {!loading && !comments.length && <p className="muted small">No comments yet — be the first.</p>}

      <div className="comment-list">
        {roots.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            depth={0}
            viewer={viewer}
            admin={admin}
            hoverReactions={hoverReactions}
            openMenu={openMenu}
            onHover={setHoverReactions}
            onMenu={setOpenMenu}
            onReact={react}
            onReply={setReplyTo}
            onDelete={remove}
            replies={comments.filter((c) => c.parentId === comment.id).sort(byNewest)}
          />
        ))}
      </div>

      <div className="comment-form">
        {replyTo && (
          <div className="quote-box">
            <p className="quote-text">↩ Replying to <strong>{replyTo.name}</strong></p>
            <button className="link-btn" onClick={() => setReplyTo(null)}>cancel reply</button>
          </div>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={40}
          aria-label="Your name"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit()
          }}
          rows={3}
          maxLength={2000}
          placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment… no account needed'}
          aria-label="Comment body"
        />
        <div className="comment-actions">
          <button onClick={submit} disabled={sending || !body.trim()}>
            {sending ? 'Posting…' : replyTo ? 'Post reply' : 'Post comment'}
          </button>
          <span className="muted small">Ctrl/⌘ + Enter to post · stored in Blob storage</span>
        </div>
      </div>
    </section>
  )
}

interface CardProps {
  comment: ApiComment
  replies: ApiComment[]
  depth: number
  viewer: string
  admin: boolean
  hoverReactions: string | null
  openMenu: string | null
  onHover: (id: string | null) => void
  onMenu: (id: string | null) => void
  onReact: (comment: ApiComment, kind: ReactionKind) => void
  onReply: (comment: ApiComment) => void
  onDelete: (comment: ApiComment) => void
}

// One card, reused for top-level comments and replies. The reaction bar floats
// above the card on hover; the kebab menu opens reply/delete actions.
function CommentCard({
  comment,
  replies,
  depth,
  viewer,
  admin,
  hoverReactions,
  openMenu,
  onHover,
  onMenu,
  onReact,
  onReply,
  onDelete,
}: CardProps) {
  const menuOpen = openMenu === comment.id
  const hovered = hoverReactions === comment.id

  const counts = new Map<ReactionKind, number>()
  let mine: ReactionKind | undefined
  for (const [vid, list] of Object.entries(comment.reactions ?? {})) {
    for (const kind of list) {
      if (!(kind in EMOJI)) continue
      const typed = kind as ReactionKind
      counts.set(typed, (counts.get(typed) ?? 0) + 1)
      if (vid === viewer) mine = typed
    }
  }

  return (
    <>
      <article
        className={`comment ${depth > 0 ? 'is-reply' : ''}`}
        onMouseEnter={() => onHover(comment.id)}
        onMouseLeave={() => onHover(null)}
      >
        <div className="comment-meta">
          <span className="comment-name">{comment.name}</span>
          <span className="muted small">{when(comment.createdAt)}</span>
          {admin && (
            <button className="link-btn" onClick={() => onDelete(comment)} title="Delete this comment">
              delete
            </button>
          )}
          <button
            className="kebab"
            aria-label="Comment actions"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation()
              onMenu(menuOpen ? null : comment.id)
            }}
          >
            <svg viewBox="0 0 4 16" width="4" height="16" aria-hidden="true">
              <circle cx="2" cy="2" r="1.6" fill="currentColor" />
              <circle cx="2" cy="8" r="1.6" fill="currentColor" />
              <circle cx="2" cy="14" r="1.6" fill="currentColor" />
            </svg>
          </button>
        </div>

        {comment.quote && <blockquote className="reply-quote">↩ {comment.quote}</blockquote>}
        <p className="comment-body">{comment.body}</p>

        {counts.size > 0 && (
          <div className="reaction-chips">
            {[...counts].map(([kind, count]) => (
              <button
                key={kind}
                className={`chip ${mine === kind ? 'mine' : ''}`}
                onClick={() => onReact(comment, kind)}
                title={mine === kind ? `Remove your ${kind}` : `React ${kind}`}
              >
                {EMOJI[kind]} {count}
              </button>
            ))}
          </div>
        )}

        {hovered && (
          <div className="reaction-bar" onClick={(e) => e.stopPropagation()}>
            {REACTIONS.map((kind) => (
              <button
                key={kind}
                className={`reaction-btn ${mine === kind ? 'mine' : ''}`}
                onClick={() => onReact(comment, kind)}
                title={`React ${kind}`}
              >
                {EMOJI[kind]}
              </button>
            ))}
          </div>
        )}

        {menuOpen && (
          <div className="kebab-menu" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                onReply(comment)
                onMenu(null)
              }}
            >
              ↩ Reply
            </button>
          </div>
        )}
      </article>

      {replies.length > 0 && (
        <div className="reply-thread">
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              replies={[]}
              depth={depth + 1}
              viewer={viewer}
              admin={admin}
              hoverReactions={hoverReactions}
              openMenu={openMenu}
              onHover={onHover}
              onMenu={onMenu}
              onReact={onReact}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  )
}
