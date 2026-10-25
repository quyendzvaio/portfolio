import { useRef, type CSSProperties, type PointerEvent } from 'react'
import { useMotion } from '../lib/motion'

// The hero portrait as a lit object in 3D space: it tilts toward the pointer, a
// glass sheen follows it, neon rim light grades the photo from both sides, and up to
// three skill chips float in front of it at different depths.
export default function Portrait({ src, name, chips }: { src: string; name: string; chips: string[] }) {
  const stage = useRef<HTMLDivElement>(null)
  const motion = useMotion()

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!motion || !stage.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    stage.current.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`)
    stage.current.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`)
    stage.current.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
    stage.current.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`)
  }

  const onLeave = () => {
    for (const prop of ['--rx', '--ry', '--gx', '--gy']) stage.current?.style.removeProperty(prop)
  }

  return (
    <div className="portrait" onPointerMove={onMove} onPointerLeave={onLeave} data-reveal style={{ '--d': '200ms' } as CSSProperties}>
      <div className="portrait-stage" ref={stage}>
        <div className="portrait-glow" />
        <div className="portrait-frame">
          {src ? <img src={src} alt={`Portrait of ${name}`} /> : <div className="portrait-empty">{name.slice(0, 1)}</div>}
          <div className="portrait-grade" />
          <div className="portrait-sheen" />
          <div className="portrait-scan" />
        </div>
        <div className="portrait-ring" />
        {chips.map((chip, i) => (
          <span key={chip} className={`orbit-chip chip-${i}`}>{chip}</span>
        ))}
      </div>
    </div>
  )
}
