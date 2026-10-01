import { useEffect, useRef, useState } from 'react'

export type ButtonPhase = 'idle' | 'saving' | 'success'

export function useButtonPhase(duration = 1100) {
  const [phase, setPhase] = useState<ButtonPhase>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  return {
    phase,
    saving: phase === 'saving',
    success: phase === 'success',
    start: () => setPhase('saving'),
    succeed: (then?: () => void) => {
      setPhase('success')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setPhase('idle')
        then?.()
      }, duration)
    },
    fail: () => {
      clearTimeout(timer.current)
      setPhase('idle')
    },
    /** Back to idle without the success beat, for a caller that shows its own. */
    reset: () => {
      clearTimeout(timer.current)
      setPhase('idle')
    },
  }
}

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  baseClass?: string
  saving?: boolean
  success?: boolean
  savingLabel?: string
  successLabel?: string
  ref?: React.Ref<HTMLButtonElement>
  children: React.ReactNode
}

export function SuccessButton({
  baseClass = 'action-button',
  saving,
  success,
  savingLabel = 'Saving…',
  successLabel = 'Done',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`${baseClass} ${className ?? ''} ${success ? 'is-success' : ''}`.trim()}
      {...rest}
    >
      <span className="sb-label">{saving ? savingLabel : children}</span>
      {success && (
        <span className="sb-tick" role="img" aria-label={successLabel}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
            />
          </svg>
        </span>
      )}
    </button>
  )
}
