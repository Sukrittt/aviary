'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { BIRD_BODY_PATH } from '../../components/BirdMark'
import { FLIGHT_TIMELINE, flightFrame, type FlightGeometry } from './flight'
import { takeSignInFlight } from './pending'

/** The visible logo marked `flightTarget`: the sidebar on desktop, the header under 900px. */
function findTarget(): SVGSVGElement | null {
  const marks = document.querySelectorAll<SVGSVGElement>('svg[data-flight-target]')
  for (const mark of marks) if (mark.getBoundingClientRect().width > 0) return mark
  return null
}

function measure(target: SVGSVGElement): FlightGeometry {
  const t = target.getBoundingClientRect()
  const content = document.querySelector('.erd-content')?.getBoundingClientRect()
  const area = content && content.width > 0 ? content : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  return {
    origin: { x: area.left + area.width / 2, y: area.top + Math.min(area.height * 0.42, 360) },
    target: { x: t.left + t.width / 2, y: t.top + t.height / 2 },
    targetSize: t.width,
  }
}

function resetPerched(target: SVGSVGElement) {
  const bird = target.querySelector<SVGGElement>('[data-bird]')
  const perch = target.querySelector<SVGGElement>('[data-perch]')
  bird?.removeAttribute('style')
  perch?.removeAttribute('style')
}

/**
 * Plays once after sign-in (flagged by the code page): the bird pops up over
 * the dashboard, blinks, and flies to its perch on the logo. Purely
 * decorative, never takes pointer events, and skipped under reduced motion.
 */
export function SignInFlight() {
  const [active, setActive] = useState(false)
  const flyerRef = useRef<SVGSVGElement>(null)
  const eyeRef = useRef<SVGEllipseElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const maskId = `flight-eye-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (!takeSignInFlight()) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (!findTarget()) return
    // One-shot read of an external store (sessionStorage) that only exists on
    // the client; state rather than a ref so StrictMode's remount keeps it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(true)
  }, [])

  useEffect(() => {
    if (!active) return
    const target = findTarget()
    if (!target) return
    const bird = target.querySelector<SVGGElement>('[data-bird]')
    const perch = target.querySelector<SVGGElement>('[data-perch]')
    let raf = 0
    let start = 0

    const paint = (t: number) => {
      const geom = measure(target) // re-measured each frame, so a sidebar toggle mid-flight still lands
      const f = flightFrame(t, geom)
      const flyer = flyerRef.current
      if (flyer) {
        const half = geom.targetSize / 2
        flyer.style.width = flyer.style.height = `${geom.targetSize}px`
        flyer.style.opacity = String(f.flyer.opacity)
        flyer.style.transform = `translate(${f.flyer.x - half}px, ${f.flyer.y - half}px) rotate(${f.flyer.rotate}deg) scale(${f.flyer.scaleX}, ${f.flyer.scaleY})`
      }
      eyeRef.current?.setAttribute('ry', (19 * f.flyer.eyeOpen).toFixed(2))
      if (scrimRef.current) scrimRef.current.style.opacity = String(f.scrim)
      if (bird) {
        bird.style.opacity = f.perched.visible ? '1' : '0'
        bird.style.transformBox = 'view-box'
        bird.style.transformOrigin = '250px 386px' // between the feet, so it squashes onto the perch
        bird.style.transform = `scale(${f.perched.scaleX}, ${f.perched.scaleY})`
      }
      if (perch) perch.style.transform = `translateY(${f.perched.perchDrop}px)`
    }

    const tick = (now: number) => {
      if (!start) start = now
      const t = now - start
      if (t >= FLIGHT_TIMELINE.end) {
        setActive(false)
        return
      }
      paint(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      resetPerched(target)
    }
  }, [active])

  if (!active) return null

  return (
    <>
      <div ref={scrimRef} className="erd-flight-scrim" aria-hidden="true" />
      <svg ref={flyerRef} className="erd-flight-bird" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" data-testid="sign-in-flight">
        <defs>
          {/* The eye is a mask hole so it stays see-through on either theme; blinking squashes it shut. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
            <rect width="512" height="512" fill="#fff" />
            <ellipse ref={eyeRef} cx="306" cy="216" rx="19" ry="19" fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <rect x="224" y="340" width="17" height="46" rx="8.5" />
          <rect x="259" y="340" width="17" height="46" rx="8.5" />
          <path d={BIRD_BODY_PATH} />
        </g>
      </svg>
    </>
  )
}
