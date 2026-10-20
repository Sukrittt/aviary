import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const spaces = vi.hoisted(() => ({ readOnly: false }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: spaces.readOnly, active: undefined }) }))
vi.mock('../hooks/useCategories', () => ({ useAddCategory: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: ['Needs'] }), useGroupIcons: () => new Map() }))

const { AddCategoryModal } = await import('./AddCategoryModal')

describe('AddCategoryModal', () => {
  it('shows the form in a writable budget', () => {
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the read-only notice instead of the form in a read-only budget', () => {
    spaces.readOnly = true
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('This budget is read-only')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})
