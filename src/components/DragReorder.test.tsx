import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDragOrder } from './DragReorder'

describe('useDragOrder', () => {
  it('follows the live order during a drag and commits only the final index on drop', () => {
    const onMove = vi.fn()
    const { result } = renderHook(() => useDragOrder(['a', 'b', 'c'], onMove))
    act(() => result.current.setOrder(['b', 'a', 'c']))
    act(() => result.current.setOrder(['b', 'c', 'a']))
    expect(result.current.order).toEqual(['b', 'c', 'a'])
    expect(onMove).not.toHaveBeenCalled()
    act(() => result.current.drop('a'))
    expect(onMove).toHaveBeenCalledWith('a', 2)
    expect(result.current.order).toEqual(['a', 'b', 'c'])
  })

  it('skips the write when a drag lands where it started', () => {
    const onMove = vi.fn()
    const { result } = renderHook(() => useDragOrder(['a', 'b'], onMove))
    act(() => result.current.drop('a'))
    expect(onMove).not.toHaveBeenCalled()
  })

  it('nudges one slot and stops at the ends', () => {
    const onMove = vi.fn()
    const { result } = renderHook(() => useDragOrder(['a', 'b'], onMove))
    act(() => result.current.nudge('a', -1))
    expect(onMove).not.toHaveBeenCalled()
    act(() => result.current.nudge('a', 1))
    expect(onMove).toHaveBeenCalledWith('a', 1)
  })
})
