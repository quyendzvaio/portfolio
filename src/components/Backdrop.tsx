import { useEffect, useRef } from 'react'
import { useMotion } from '../lib/motion'

// The cinematic scene behind every page, fixed to the viewport. Depth comes from
// layering: drifting neon light (CSS), a perspective grid floor (CSS), dust motes
// that parallax with the pointer at three depths (canvas), then film grain and a
// vignette on top. Dependency-free: no three.js for what is mostly light and blur.
const COLORS = ['34, 211, 238', '255, 61, 220', '167, 139, 250']

interface Mote { x: number; y: number; z: number; r: number; c: string; phase: number }

export default function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const motion = useMotion()

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let motes: Mote[] = []
    // Pointer offset from the centre, -1..1, eased toward its target every frame.
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(140, (w * h) / 14000))
      motes = Array.from({ length: count }, () => {
        const z = Math.random()
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.4 + z * 1.8,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          phase: Math.random() * Math.PI * 2,
        }
      })
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
      for (const m of motes) {
        // Near motes (high z) move further with the pointer: that is the parallax.
        const x = m.x - pointer.x * 30 * m.z
        const y = m.y - pointer.y * 20 * m.z
        const twinkle = 0.55 + 0.45 * Math.sin(t / 900 + m.phase)
        ctx.beginPath()
        ctx.fillStyle = `rgba(${m.c}, ${(0.15 + m.z * 0.55) * twinkle})`
        ctx.shadowColor = `rgba(${m.c}, 0.9)`
        ctx.shadowBlur = 6 * m.z
        ctx.arc(x, y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    let raf = 0
    const tick = (t: number) => {
      for (const m of motes) {
        m.y -= 0.08 + m.z * 0.25 // dust rising through the light
        if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w }
      }
      draw(t)
      raf = requestAnimationFrame(tick)
    }

    const onPointer = (event: PointerEvent) => {
      pointer.tx = (event.clientX / w) * 2 - 1
      pointer.ty = (event.clientY / h) * 2 - 1
      document.documentElement.style.setProperty('--mx', `${event.clientX}px`)
      document.documentElement.style.setProperty('--my', `${event.clientY}px`)
    }

    resize()
    window.addEventListener('resize', resize)
    if (motion) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      raf = requestAnimationFrame(tick)
    } else {
      draw(0) // one still frame keeps the depth without the movement
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [motion])

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-light a" />
      <div className="bd-light b" />
      <div className="bd-light c" />
      <div className="bd-floor"><div className="bd-grid" /></div>
      <canvas ref={canvasRef} />
      <div className="bd-spot" />
      <div className="bd-grain" />
      <div className="bd-vignette" />
    </div>
  )
}
