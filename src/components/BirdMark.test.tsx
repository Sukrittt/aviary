import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BirdMark } from './BirdMark'

describe('BirdMark', () => {
  it('renders the idle nod and blink artwork by default', () => {
    const { container } = render(<BirdMark size={34} />)

    expect(container.querySelector('.bird-idle-head')).toBeTruthy()
    expect(container.querySelector('.bird-idle-eyelid')).toBeTruthy()
  })

  it('can still render a motionless mark when a host explicitly needs one', () => {
    const { container } = render(<BirdMark size={34} perched={false} />)

    expect(container.querySelector('.bird-idle-head')).toBeNull()
    expect(container.querySelector('.bird-idle-eyelid')).toBeNull()
  })
})
