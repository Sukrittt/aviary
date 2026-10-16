import { usePersistentState } from './usePersistentState'

export type ActivityView = 'list' | 'feed'

/**
 * Activity's List / Feed choice, remembered in this browser. Null until one is
 * made, so Activity opens on the feed once it's turned on. The `mc-` prefix
 * clears it on sign-out, like Mobile's useActivityView.
 */
export function useActivityView() {
  return usePersistentState<ActivityView | null>(
    'mc-activity-view',
    null,
    (raw) => (raw === 'feed' || raw === 'list' ? raw : null),
    (value) => value ?? 'list',
  )
}
