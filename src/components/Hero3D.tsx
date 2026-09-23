import { useEffect, useRef, useState } from 'react'

// ponytail: dependency-free canvas starfield instead of react-three-fiber.
// Upgrade to r3f only if a real 3D scene is requested.
export default function Hero3D() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [off, setOff] = useState(false)

  useEffect(() => {
    if (off) return
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, r: Math.random() * 1.6 + 0.4,
    }))
    let t = 0
    const draw = () => {
      t += 0.003
      const w = (cv.width = cv.offsetWidth)
      const h = (cv.height = cv.offsetHeight)
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const x = ((s.x + t * s.z) % 1) * w
        const y = s.y * h + Math.sin(t * 10 + s.x * 20) * 6
        ctx.globalAlpha = 0.3 + s.z * 0.7
        ctx.fillStyle = '#9db9ff'
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      // hero orb glow
      const g = ctx.createRadialGradient(w * 0.8, h * 0.4, 0, w * 0.8, h * 0.4, 120)
      g.addColorStop(0, 'rgba(110,168,254,.55)')
      g.addColorStop(1, 'rgba(110,168,254,0)')
      ctx.globalAlpha = 1
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [off])

  if (off) return <div className="hero3d"><p className="muted small" style={{ padding: 12 }}>3D off. <button onClick={() => setOff(false)}>Enable</button></p></div>
  return (
    <div className="hero3d">
      <canvas ref={ref} aria-hidden />
      <button className="small" style={{ position: 'absolute', right: 8, top: 8 }} onClick={() => setOff(true)}>Disable motion</button>
    </div>
  )
}
