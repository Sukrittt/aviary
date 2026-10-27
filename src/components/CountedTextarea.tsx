import type { ComponentProps } from 'react'

/**
 * A fixed-size textarea with a character count in its bottom-right corner,
 * shown once the text reaches 90% of `maxLength`. `className` styles the box,
 * which reserves a strip under the text for the count, so scrolled text never
 * runs under it.
 */
export function CountedTextarea({ maxLength, value, className, ...rest }: ComponentProps<'textarea'> & { maxLength: number; value: string }) {
  return (
    <div className={`counted-textarea ${className ?? ''}`}>
      <textarea className="counted-textarea-input" maxLength={maxLength} value={value} {...rest} />
      {value.length >= maxLength * 0.9 && (
        <span className="counted-textarea-count" aria-live="polite">{value.length}/{maxLength}</span>
      )}
    </div>
  )
}
