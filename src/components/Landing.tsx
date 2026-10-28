import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Post } from '../lib/store'
import { trackPointer, useMotion } from '../lib/motion'
import { t } from '../lib/i18n'

/** Staggers a `[data-reveal]` element: CSS reads --d as its transition delay. */
export const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/**
 * A headline number. A leading numeric part ("40" in "40%") counts up from zero the
 * first time the card scrolls into view; the rest of the value is kept as typed.
 */
export function Stat({ value, label, wait }: { value: string; label: string; wait: number }) {
  const motion = useMotion()
  const ref = useRef<HTMLDivElement>(null)
  const match = value.match(/^(\d+(?:\.\d+)?)(.*)$/)
  const [shown, setShown] = useState(match && motion ? `0${match[2]}` : value)

  useEffect(() => {
    if (!match || !motion || !ref.current) { setShown(value); return }
    const target = Number(match[1])
    const decimals = match[1].split('.')[1]?.length ?? 0
    let raf = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now() + wait
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / 1400))
        const eased = 1 - Math.pow(1 - t, 3)
        setShown(`${(target * eased).toFixed(decimals)}${match[2]}`)
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    observer.observe(ref.current)
    return () => { observer.disconnect(); cancelAnimationFrame(raf) }
  }, [value, motion]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stat" ref={ref} data-reveal style={delay(wait)} onPointerMove={trackPointer}>
      <span className="stat-value" aria-label={value}>{shown}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

/** Endless strip of skills. The list is rendered twice so the loop has no seam. */
/** Every skill at once, as a wrapped row of pills: readable at a glance, nothing moves. */
export function SkillList({ items }: { items: string[] }) {
  return (
    <section className="skills" aria-labelledby="skills-title">
      <div className="section-head" data-reveal>
        <div>
          <p className="kicker">{t('skills.kicker')}</p>
          <h2 id="skills-title">{t('skills.title')}</h2>
        </div>
      </div>
      <ul className="skill-list" data-reveal style={delay(80)}>
        {items.map((item) => <li key={item}><span className="skill-dot" aria-hidden="true" />{item}</li>)}
      </ul>
    </section>
  )
}

/** Glass post card with a pointer-following neon spotlight. */
export function PostCard({ post, wait = 0 }: { post: Post; wait?: number }) {
  return (
    <a className="card post-card" href={`#/blog/${post.slug}`} data-reveal style={delay(wait)} onPointerMove={trackPointer}>
      <p className="post-meta">{post.meta.date}{post.meta.tags.length > 0 && <> · {post.meta.tags.join(' · ')}</>}</p>
      <h3>{post.meta.title}</h3>
      <p className="muted">{post.meta.summary}</p>
      {post.error && <p className="warn">⚠ {post.error}</p>}
      <span className="post-more">{t('posts.read')} <span aria-hidden="true">→</span></span>
    </a>
  )
}
