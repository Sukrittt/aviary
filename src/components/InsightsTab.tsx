'use client'

import Link from 'next/link'
import { useHiddenFeatures } from '@/src/hooks/useUser'

/** The tab bar's Insights tab, gone while Insights is hidden in Features. */
export function InsightsTab({ active = false }: { active?: boolean }) {
  if (useHiddenFeatures().includes('insights')) return null
  return (
    <Link href="/insights" className={`erd-tab${active ? ' is-active' : ''}`}>
      <span aria-hidden="true">📊</span>
      <span>Insights</span>
    </Link>
  )
}
