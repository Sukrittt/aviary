import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flightAt, MoneyLesson } from './MoneyLesson'

afterEach(() => vi.useRealTimers())
describe('budgeting lesson controls', () => {
  it('teaches assignment, spending and moving money through labeled buttons', () => {
    render(<MoneyLesson />)
    for (const [category, amount] of [['Rent',400],['Food',300],['Savings',200],['Fun',100]]) {
      fireEvent.click(screen.getByRole('button', { name: `Assign ₹${amount} to ${category}` }))
    }
    expect(screen.getByRole('status')).toHaveTextContent('₹0 unassigned. ₹1,000 still yours.')
    fireEvent.click(screen.getByRole('button', { name: /Buy lunch/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Move ₹50 to Food' }))
    expect(screen.getByRole('status')).toHaveTextContent('Food: ₹250 available.')
    expect(screen.getByRole('status')).toHaveTextContent('Savings: ₹200 available.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('status')).toHaveTextContent('Food: ₹200 available.')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('status')).toHaveTextContent('₹1,000 unassigned.')
  })
  it('cancels walkthrough timers on pause and reset', () => {
    vi.useFakeTimers()
    render(<MoneyLesson />)
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }))
    act(() => vi.advanceTimersByTime(1800))
    expect(screen.getByRole('status')).toHaveTextContent('₹600 unassigned.')
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByRole('status')).toHaveTextContent('₹600 unassigned.')
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByRole('status')).toHaveTextContent('₹1,000 unassigned.')
  })
  it('bird flight curve starts at the old perch and ends on the new one', () => {
    const s: [number, number] = [300, -120], c: [number, number] = [135, -190]
    expect(flightAt(0, s, c)).toMatchObject({ x: 300, y: -120 })
    const end = flightAt(1, s, c)
    expect(Math.abs(end.x) + Math.abs(end.y)).toBe(0)
    expect(flightAt(0.3, s, c).y).toBeLessThan(-120) // climbs before gliding down
  })
})
