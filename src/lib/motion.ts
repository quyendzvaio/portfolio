import { useEffect, useState, type PointerEvent } from 'react'

// One switch for every animation on the site. It defaults to the OS "reduce motion"
// setting, the footer toggle overrides it per browser, and CSS reads it from
// <html data-motion="on|off"> so stylesheet animations and JS loops agree.
const KEY = 'portfolio.motion'

function initial(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'on' || saved === 'off') return saved === 'on'
  } catch { /* storage blocked: fall back to the OS setting */ }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let current = initial()
const listeners = new Set<(on: boolean) => void>()
document.documentElement.dataset.motion = current ? 'on' : 'off'

export function setMotion(on: boolean): void {
  current = on
  document.documentElement.dataset.motion = on ? 'on' : 'off'
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* per-visit only */ }
  listeners.forEach((listener) => listener(on))
}

export function useMotion(): boolean {
  const [on, setOn] = useState(current)
  useEffect(() => {
    listeners.add(setOn)
    return () => { listeners.delete(setOn) }
  }, [])
  return on
}

/**
 * Adds `.in` to every `[data-reveal]` element as it scrolls into view; CSS does the
 * rest. Runs once per mount, so call it from the page component.
 */
export function useReveal(): void {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)')
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/** Writes the pointer position inside `el` as --px/--py (0–1) for CSS spotlights. */
export function trackPointer(event: PointerEvent<HTMLElement>): void {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--px', ((event.clientX - rect.left) / rect.width).toFixed(3))
  el.style.setProperty('--py', ((event.clientY - rect.top) / rect.height).toFixed(3))
}
