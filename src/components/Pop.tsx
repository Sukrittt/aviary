'use client'

import { useEffect, useRef, type HTMLAttributes, type RefObject } from 'react'

/**
 * Squash-and-spring the element, with one ring in its ink spreading out,
 * whenever `value` changes after mount: a picked colour landing on its tile,
 * or a saved one landing back on the list.
 */
export function usePopOnChange(ref: RefObject<HTMLElement | null>, value: unknown) {
  const prev = useRef(value)
  useEffect(() => {
    if (Object.is(prev.current, value)) return
    prev.current = value
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate?.(
      [
        { scale: '1', boxShadow: '0 0 0 0 color-mix(in srgb, currentColor 45%, transparent)' },
        { scale: '0.86', offset: 0.25 },
        { scale: '1.06', offset: 0.6 },
        { scale: '1', boxShadow: '0 0 0 10px transparent' },
      ],
      { duration: 480, easing: 'ease-out' },
    )
  }, [ref, value])
}

/** A span that pops (see usePopOnChange) when `value` changes. */
export function Pop({ value, ...props }: { value: unknown } & HTMLAttributes<HTMLSpanElement>) {
  const ref = useRef<HTMLSpanElement>(null)
  usePopOnChange(ref, value)
  return <span ref={ref} {...props} />
}
