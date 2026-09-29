import { describe, it, expect } from 'vitest'
import { FLIGHT_TIMELINE as T, POPPED_SIZE, flightFrame } from './flight'

const geom = { origin: { x: 700, y: 400 }, target: { x: 60, y: 40 }, targetSize: 34 }
const at = (t: number) => flightFrame(t, geom)

describe('flightFrame', () => {
  it('starts invisible, pops to full size at the origin, facing right', () => {
    expect(at(0).flyer.visible).toBe(false)
    const popped = at(T.popEnd + 20).flyer
    expect(popped.visible).toBe(true)
    expect(popped.x).toBe(700)
    expect(popped.scaleX * 34).toBeCloseTo(POPPED_SIZE, 0)
  })

  it('overshoots during the pop', () => {
    const peak = Math.max(...Array.from({ length: 48 }, (_, i) => at(i * 10).flyer.scaleX))
    expect(peak * 34).toBeGreaterThan(POPPED_SIZE)
  })

  it('shuts its eye mid-blink, twice', () => {
    expect(at(T.blink1 + 70).flyer.eyeOpen).toBeLessThan(0.1)
    expect(at(T.blink1 + 200).flyer.eyeOpen).toBe(1)
    expect(at(T.blink2 + 70).flyer.eyeOpen).toBeLessThan(0.1)
  })

  it('turns to face left before taking off toward the sidebar', () => {
    expect(at(T.takeoff - 1).flyer.scaleX).toBeLessThan(0)
  })

  it('comes in above the logo and drops onto it', () => {
    const ys = Array.from({ length: T.land - T.takeoff }, (_, i) => at(T.takeoff + i).flyer.y)
    expect(Math.min(...ys)).toBeLessThan(geom.target.y)
  })

  it('arrives on the logo at its size, then hands off to the perched bird', () => {
    const arriving = at(T.land - 1).flyer
    expect(arriving.x).toBeCloseTo(60, 0)
    expect(arriving.y).toBeCloseTo(40, 0)
    expect(Math.abs(arriving.scaleX)).toBeCloseTo(1, 1)
    expect(at(T.land - 1).perched.visible).toBe(false)

    const landed = at(T.land + 50)
    expect(landed.flyer.visible).toBe(false)
    expect(landed.perched.visible).toBe(true)
    expect(landed.perched.scaleY).toBeLessThan(1) // squashes on touchdown
  })

  it('ends at rest, facing right, with the scrim gone', () => {
    const end = at(T.end)
    expect(end.perched).toEqual({ visible: true, scaleX: 1, scaleY: 1, perchDrop: 0 })
    expect(end.scrim).toBe(0)
    expect(at(T.land + 400).perched.scaleX).toBeGreaterThan(0)
  })
})
