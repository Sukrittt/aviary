'use client'

import Link from 'next/link'
import { useHiddenFeatures } from '@/src/hooks/useUser'
import { ChartLineIcon } from '@/src/components/icons'

/** The tab bar's Insights tab, gone while Insights is hidden in Features. */
export function InsightsTab({ active = false }: { active?: boolean }) {
  if (useHiddenFeatures().includes('insights')) return null
  return (
    <Link href="/insights" className={`erd-tab${active ? ' is-active' : ''}`}>
      <ChartLineIcon size={22} weight={active ? 'fill' : 'regular'} aria-hidden />
      <span>Insights</span>
    </Link>
  )
}
