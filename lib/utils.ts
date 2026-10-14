import { useSyncExternalStore } from "react"

export { cn } from "cn"

const noSubscribe = () => () => {}

/**
 * Portal target for shadcn overlays (menus, selects). Inside .mc-page they keep
 * the theme tokens that document.body doesn't have. Undefined (document.body)
 * on the server and outside the app shell; a plain querySelector during render
 * would hand Base UI the server's undefined, and it keeps its first container.
 */
export function useThemedPortal() {
  return useSyncExternalStore(
    noSubscribe,
    () => document.querySelector<HTMLElement>(".mc-page") ?? undefined,
    () => undefined,
  )
}
