import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LineChart, smoothPath } from './LineChart'

it('curves through interior points and ends on the last one', () => {
  expect(smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }])).toBe('M0,10 Q10,0 15,5 L20,10')
})

it('handles two points as a straight line', () => {
  expect(smoothPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M0,0 L5,5')
})

it('labels the range and shows the hovered point', () => {
  const { container } = render(
    <LineChart
      data={[{ x: 1, y: 100 }, { x: 2, y: 250 }]}
      label="Net worth over time"
      formatX={(x) => `day ${x}`}
      formatY={(y) => `₹${y}`}
    />,
  )
  expect(screen.getByText('day 1')).toBeTruthy()
  expect(screen.getByText('day 2')).toBeTruthy()
  expect(screen.queryByText('₹100')).toBeNull()

  const plot = container.querySelector('.ins-line-plot')!
  plot.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect
  fireEvent.pointerMove(plot, { clientX: 90 })
  expect(screen.getByText('₹250')).toBeTruthy()

  fireEvent.pointerLeave(plot)
  expect(screen.queryByText('₹250')).toBeNull()
})
