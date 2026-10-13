import * as React from "react"

// Matches the app's own mobile breakpoint (@media (max-width: 900px) in
// src/expense-redesign.css) and Tailwind's md, moved to 901px in globals.css.
const MOBILE_QUERY = "(max-width: 900px)"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    // jsdom (tests) has no matchMedia.
    const mql = window.matchMedia?.(MOBILE_QUERY)
    if (!mql) return
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
