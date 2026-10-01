import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryBreakdown } from './CategoryBreakdown'
import type { BreakdownRow } from '@/src/lib/monthly'

vi.mock('./DonutChart', () => ({ DonutChart: ({ segments }: { segments: { key: string; color: string }[] }) => <output data-testid="donut-colors">{JSON.stringify(segments)}</output> }))
const props = {
  rows: [], categoryRows: [], groupRows: [], categoryGroupMap: new Map<string, string>(),
  mode: 'category' as const, onModeChange: vi.fn(), selectedKey: null, onSelectKey: vi.fn(),
  comparison: null, leftover: 0, monthLabel: 'October 2026',
}

it('shows the snoozing empty state only after queries finish', () => {
  const { rerender } = render(<CategoryBreakdown {...props} loading />)
  expect(screen.queryByText('Nothing spent yet')).not.toBeInTheDocument()
  rerender(<CategoryBreakdown {...props} loading={false} />)
  expect(screen.getByText('Nothing spent yet')).toBeInTheDocument()
  expect(screen.getByText("Log an expense and it'll land here.")).toBeInTheDocument()
})

it('uses the mobile chart cycle for slices and removes the mascot when spending arrives', () => {
  const { rerender } = render(<CategoryBreakdown {...props} />)
  const rows: BreakdownRow[] = ['Food', 'Rent', 'Bills'].map((key, i) => ({ key, label: key, emoji: '', spent: 30 - i, assigned: 100, assignedIsCarried: false, pct: 33 }))
  rerender(<CategoryBreakdown {...props} rows={rows} categoryRows={rows} />)
  expect(screen.queryByText('Nothing spent yet')).not.toBeInTheDocument()
  const slices = JSON.parse(screen.getByTestId('donut-colors').textContent!)
  expect(slices.map((s: { color: string }) => s.color)).toEqual(['var(--blue)', 'var(--mint)', 'var(--violet)'])
})
