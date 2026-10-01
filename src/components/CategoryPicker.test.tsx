import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CategoryPicker } from './CategoryPicker'
import { useCategories as useCategoriesMock } from '../hooks/useCategories'

const state = vi.hoisted(() => ({ recents: [] as string[] }))

vi.mock('../hooks/useCategories', () => ({
  useCategories: vi.fn(),
}))
vi.mock('../hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: [] }),
}))
vi.mock('../hooks/useRecentCategories', () => ({
  useRecentCategories: (): { recents: string[]; record: (n: string) => void } => ({
    recents: state.recents,
    record: vi.fn(),
  }),
}))

function setCategories(rows: { name: string; group: string }[]) {
  vi.mocked(useCategoriesMock).mockReturnValue({ data: rows } as ReturnType<typeof useCategoriesMock>)
}

beforeEach(() => {
  state.recents = []
  setCategories([])
})

function pick() {
  return render(<CategoryPicker value="" onChange={vi.fn()} />)
}

it('merges duplicate categories into a single chip', () => {
  setCategories([
    { name: '🍎 Groceries', group: '🥫 Food' },
    { name: '🛒 Groceries', group: '🧺 Essentials' },
    { name: '🏠 Rent', group: '🏠 Home' },
  ])
  pick()
  expect(screen.getByRole('button', { name: /Rent/ })).toBeInTheDocument()
  const groceries = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Groceries'))
  expect(groceries).toHaveLength(1)
  expect(groceries[0].textContent).toBe('🍎Groceries')
})

it('shows a clear emoji for legacy plain-named categories', () => {
  setCategories([
    { name: 'Groceries', group: '' },
    { name: 'Eating out', group: '' },
    { name: 'Travel', group: '' },
  ])
  pick()
  expect(screen.getByRole('button', { name: /Groceries/ }).textContent).toBe('🍅Groceries')
  expect(screen.getByRole('button', { name: /Eating out/ }).textContent).toBe('🍽️Eating out')
  expect(screen.getByRole('button', { name: /Travel/ }).textContent).toBe('🛵Travel')
})

it('puts the MRU list at the front of the wrap', () => {
  state.recents = ['Food Order', 'Travel']
  setCategories([
    { name: 'Rent', group: '' },
    { name: 'Travel', group: '' },
    { name: 'Food Order', group: '' },
  ])
  pick()
  const buttons = screen.getAllByRole('button')
  expect(buttons[0].textContent).toContain('Food Order')
  expect(buttons[1].textContent).toContain('Travel')
  expect(buttons[2].textContent).toContain('Rent')
})

it('marks a chip selected when the value matches its plain name', () => {
  setCategories([{ name: '🍎 Groceries', group: '' }])
  render(<CategoryPicker value="Groceries" onChange={vi.fn()} />)
  const chip = screen.getByRole('button', { name: /Groceries/ })
  expect(chip.className).toContain('is-selected')
})

it('hides the search box under 12 categories', () => {
  setCategories([1, 2, 3, 4, 5].map((n) => ({ name: `Category ${n}`, group: '' })))
  pick()
  expect(screen.queryByLabelText('Search categories')).not.toBeInTheDocument()
})

it('shows the search box at 12+ categories and keeps all chips', () => {
  setCategories(Array.from({ length: 14 }, (_, i) => ({ name: `Category ${i + 1}`, group: '' })))
  const { container } = pick()
  expect(screen.getByLabelText('Search categories')).toBeInTheDocument()
  const row = container.querySelector('.erd-chip-row')!
  expect(within(row as HTMLElement).getAllByRole('button')).toHaveLength(14)
})