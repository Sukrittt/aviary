import type { TextareaHTMLAttributes } from 'react'

/**
 * A fixed-size textarea with a character count in its bottom-right corner,
 * shown once the text reaches 90% of `maxLength`.
 */
export function CountedTextarea({ maxLength, value, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number; value: string }) {
  return (
    <div className="counted-textarea">
      <textarea className={className} maxLength={maxLength} value={value} {...rest} />
      {value.length >= maxLength * 0.9 && (
        <span className="counted-textarea-count" aria-live="polite">{value.length}/{maxLength}</span>
      )}
    </div>
  )
}
