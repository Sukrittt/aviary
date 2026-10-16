import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ChangelogEntry } from './ChangelogEntry'

const release = { id: 'abc', title: 'Web plans', version: '1.4.0', highlights: ['Subscribe on the web'], body: 'Pay once a year and save.', publishedAt: '2026-10-03T00:00:00Z' }

it('links the title to its own release and labels the full notes', () => {
  render(<ChangelogEntry release={release} />)
  expect(screen.getByRole('link', { name: 'Web plans' })).toHaveAttribute('href', '#release-abc')
  expect(screen.getByText('The details')).toBeInTheDocument()
  expect(screen.queryByText('Latest')).toBeNull()
})

it('marks the latest release and skips the details label without a body', () => {
  render(<ChangelogEntry release={{ ...release, body: '' }} latest />)
  expect(screen.getByText('Latest')).toBeInTheDocument()
  expect(screen.getByRole('article')).toHaveClass('changelog-latest-entry')
  expect(screen.queryByText('The details')).toBeNull()
})
