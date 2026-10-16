import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AllocationBar } from './AllocationBar'
import { heatmapLevels } from './Heatmap'
import { layoutDonutSegments } from './DonutChart'
import { TrendChart } from './TrendChart'

describe('insights chart primitives', () => {
  it('lays donut slices around one complete circle and ignores empty values', () => {
    const layout = layoutDonutSegments([
      { key: 'food', label: 'Food', emoji: '🍲', value: 60, color: 'red' },
      { key: 'rent', label: 'Rent', emoji: '🏠', value: 40, color: 'blue' },
      { key: 'empty', label: 'Empty', emoji: '', value: 0, color: 'gray' },
    ])

    expect(layout).toHaveLength(2)
    expect(layout[0]).toMatchObject({ key: 'food', startDeg: 0, endDeg: 216 })
    expect(layout[1].startDeg).toBe(216)
    expect(layout[1].endDeg).toBe(360)
  })

  it('uses percentile ranks so one large spending day does not flatten the rest', () => {
    const levels = heatmapLevels([
      { date: '2026-09-01', day: 1, value: 10 },
      { date: '2026-09-02', day: 2, value: 20 },
      { date: '2026-09-03', day: 3, value: 30 },
      { date: '2026-09-04', day: 4, value: 1000 },
      { date: 'pad-1', day: 0, value: 0 },
    ])

    expect([...levels.values()]).toEqual([1, 2, 3, 4])
    expect(levels.has('pad-1')).toBe(false)
  })

  it('renders allocation percentages that sum to the complete bar', () => {
    render(<AllocationBar segments={[
      { label: 'Needs', value: 3, color: 'red' },
      { label: 'Wants', value: 1, color: 'blue' },
    ]} />)

    expect(screen.getByText('75.0%')).toBeInTheDocument()
    expect(screen.getByText('25.0%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Allocation by category' })).toBeInTheDocument()
  })

  // jsdom has no ResizeObserver; the chart only uses it to track card width.
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver

  it('hangs a negative month below a zero line instead of drawing it from the floor', () => {
    const { container } = render(
      <TrendChart data={[{ date: '2026-07', value: 40000 }, { date: '2026-08', value: -10000 }]} />,
    )
    const [positive, negative] = [...container.querySelectorAll('rect.ins-trend-bar')]
    const zero = container.querySelector('line.ins-trend-zero')!
    expect(negative).toHaveClass('is-negative')
    expect(positive).not.toHaveClass('is-negative')
    // Positive bar ends at the zero line; negative bar starts there.
    const zeroY = Number(zero.getAttribute('y1'))
    expect(Number(positive.getAttribute('y')) + Number(positive.getAttribute('height'))).toBeCloseTo(zeroY)
    expect(Number(negative.getAttribute('y'))).toBeCloseTo(zeroY)
  })

  it('draws no zero line when every month is positive', () => {
    const { container } = render(<TrendChart data={[{ date: '2026-07', value: 40000 }]} />)
    expect(container.querySelector('line.ins-trend-zero')).toBeNull()
  })

  it('draws a month with no income as an outlined placeholder that still answers taps', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <TrendChart
        data={[{ date: '2026-08', value: 0, missing: true }, { date: '2026-09', value: 40000 }]}
        onSelect={onSelect}
      />,
    )
    expect(container.querySelector('rect.ins-trend-bar.is-missing')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aug, No income set' }))
    expect(onSelect).toHaveBeenCalledWith('2026-08')
  })
})
