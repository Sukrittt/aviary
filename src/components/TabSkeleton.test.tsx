import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ActivitySkeleton, EnvelopesSkeleton, HomeSkeleton, InsightsSkeleton } from './TabSkeleton'

it.each([
  ['Home', HomeSkeleton],
  ['Activity', ActivitySkeleton],
  ['Categories', EnvelopesSkeleton],
  ['Insights', InsightsSkeleton],
])('draws %s as a skeleton without any loading phrase', (_, Skeleton) => {
  render(<Skeleton />)
  expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
  expect(screen.queryByText(/…/)).toBeNull()
})
