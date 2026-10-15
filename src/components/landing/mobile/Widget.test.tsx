import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EnvelopeWidget } from './Widget'

describe('EnvelopeWidget', () => {
  it('keeps the subtitle to days left, since per day has its own pill', () => {
    const { container } = render(<EnvelopeWidget />)
    const subtitle = container.querySelector('.m-widget-hero span')!
    expect(subtitle.textContent).toMatch(/^\d+ days left$/)
    expect(container.querySelector('.m-widget-pills')!.textContent).toContain('per day')
  })
})
