'use client'

import { useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'

import { Clip } from './Nudges'
import { useOnScreen } from './useOnScreen'

/** A real log, start to finish: a screen recording of the app on a demo account (public/landing/clip-log.mp4). */
export function Playground() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const { ref: sectionRef, visible } = useOnScreen<HTMLElement>(0.35)
  const playing = visible && !paused && !reduced

  return (
    <section id="play" className="lp-section lp-center" aria-labelledby="play-title" ref={sectionRef}>
      <h2 id="play-title" className="lp-h2">Tap, type, logged.</h2>
      <p className="lp-lede">A real log in the app, start to finish. Say what it was, the category picks itself, tap the amount, done.</p>
      <div className="lp-play-panel">
        <div className="lp-play-grid">
          <div className="lp-phone-wrap">
            <div className="lp-phone" aria-hidden="true">
              <div className="lp-phone-screen lp-play-screen">
                <div className="lp-island" />
                <Clip name="log" playing={playing} loop />
              </div>
            </div>
            {!reduced && <button type="button" className="lp-stage-pause lp-play-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>}
          </div>

          <div className="lp-play-copy">
            <h3 className="lp-h3">Tap a number. That’s the whole feature.</h3>
            <p className="lp-body">The keypad is the first thing your thumb finds. Say what it was and the category picks itself. Logged before the payment screen has closed.</p>
            <ul className="lp-points">
              <Point title="Logged in seconds" body="Amount, a word or two, done. No forms to fill." />
              <Point title="It picks the envelope" body="Type “bike to office” and watch Metro land." />
              <Point title="Works with no signal" body="Logs wait on your phone and sync when you’re back." />
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Point({ title, body }: { title: string; body: string }): ReactNode {
  return <li className="lp-point"><span className="lp-point-title">{title}</span><span className="lp-point-body">{body}</span></li>
}
