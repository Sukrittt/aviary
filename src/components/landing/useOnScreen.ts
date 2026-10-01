'use client'

import { useEffect, useRef, useState } from 'react'

/** True while at least `ratio` of the element is in view, so off-screen demos stop ticking. */
export function useOnScreen<E extends HTMLElement>(ratio: number) {
  const ref = useRef<E>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= ratio), { threshold: [0, ratio] })
    io.observe(el)
    return () => io.disconnect()
  }, [ratio])
  return { ref, visible }
}
