import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BirdEmptyState, sceneFor, type EmptyScene } from './BirdEmptyState'

it('renders accessible copy and its next action', () => {
  const onClick = vi.fn()
  render(
    <BirdEmptyState
      title="Your story starts here"
      description="Log your first expense and it will show up here."
      action={{ label: 'Log an expense', onClick }}
    />,
  )

  expect(screen.getByRole('heading', { name: 'Your story starts here' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log an expense' }))
  expect(onClick).toHaveBeenCalledOnce()
})

describe('sceneFor', () => {
  it('searches for any subject when searching', () => {
    expect(sceneFor('expenses', 'searching')).toBe('searching')
    expect(sceneFor('chat', 'searching')).toBe('searching')
  })

  it('dozes for snoozing moods and recurring, but subscriptions keep their repeat arrow', () => {
    expect(sceneFor('expenses', 'snoozing')).toBe('snoozing')
    expect(sceneFor('recurring')).toBe('snoozing')
    expect(sceneFor('subscriptions', 'snoozing')).toBe('subscriptions')
  })

  it('falls back to the subject scene', () => {
    expect(sceneFor('expenses')).toBe('expenses')
    expect(sceneFor('archive', 'clear')).toBe('archive')
    expect(sceneFor('scans')).toBe('scans')
    expect(sceneFor('insights')).toBe('insights')
  })
})

const SCENES: [EmptyScene, Parameters<typeof BirdEmptyState>[0]['subject'], string][] = [
  ['expenses', 'expenses', '--gold'],
  ['subscriptions', 'subscriptions', '--gold'],
  ['holdings', 'holdings', '--mint'],
  ['scans', 'scans', '--gold'],
  ['chat', 'chat', '--violet'],
  ['archive', 'archive', '--blue'],
  ['envelopes', 'envelopes', '--gold'],
  ['insights', 'insights', '--gold'],
]

it.each(SCENES)('draws the %s scene as one bird svg with its accent prop', (scene, subject, accent) => {
  const { container } = render(<BirdEmptyState title="t" description="d" subject={subject} />)
  const svgs = container.querySelectorAll('svg')
  expect(svgs).toHaveLength(1)
  expect(svgs[0]).toHaveAttribute('data-scene', scene)
  expect(svgs[0].innerHTML).toContain(`var(${accent})`)
})

it('masks the shut eye with a unique id per instance', () => {
  const { container } = render(<>
    <BirdEmptyState title="a" description="d" mood="snoozing" />
    <BirdEmptyState title="b" description="d" mood="snoozing" />
  </>)
  const ids = [...container.querySelectorAll('mask')].map((m) => m.id)
  expect(new Set(ids).size).toBe(2)
  for (const id of ids) expect(container.querySelector(`[mask="url(#${id})"]`)).not.toBeNull()
})
