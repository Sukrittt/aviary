'use client'

import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Scrim, Sheet } from './MotionSheet'
import { ALERT_PRESET_PCTS, MAX_ALERT_PCTS } from '../lib/alerts'

interface Props {
  categoryName: string
  value: number[]
  onChange: (next: number[]) => void
  onClose: () => void
  onSave: () => void
}

/**
 * Which percentages of an envelope trigger a notification. Web counterpart of
 * the thresholds section in Mobile's envelopes edit sheet.
 *
 * Alerts are sent only on the mobile app — as a push notification — but the
 * choice is account data, not a device setting, so it is editable here and
 * applies wherever the push fires.
 */
export function AlertThresholdPicker({ categoryName, value, onChange, onClose, onSave }: Props) {
  const atLimit = value.length >= MAX_ALERT_PCTS

  const [custom, setCustom] = useState('')
  const customPcts = value.filter((p) => !ALERT_PRESET_PCTS.includes(p))

  // Same parsing as Mobile's addCustomAlertPct; the API enforces 0–100 integers too.
  function addCustom() {
    const n = Math.round(Number(custom))
    if (!custom.trim() || Number.isNaN(n) || n < 0 || n > 100) return
    setCustom('')
    if (!value.includes(n) && !atLimit) onChange([...value, n].sort((a, b) => a - b))
  }

  function toggle(pct: number) {
    if (value.includes(pct)) onChange(value.filter((p) => p !== pct))
    else if (!atLimit) onChange([...value, pct].sort((a, b) => a - b))
  }

  return (
    <Scrim key="scrim" className="erd-modal-overlay" onClick={onClose}>
      <Sheet
        className="erd-modal-card env-sheet env-sheet--rename env-sheet--alerts"
        role="dialog"
        aria-modal="true"
        aria-label={`Alerts for ${categoryName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="env-sheet-rename-head">
          <div className="env-sheet-rename-icon" aria-hidden="true">
            <Bell size={24} />
          </div>
          <div className="env-sheet-rename-heading">
            <span className="env-sheet-eyebrow">ALERTS</span>
            <h2 className="env-sheet-title">{categoryName}</h2>
          </div>
          <button type="button" className="env-sheet-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="env-sheet-copy">
          When spending crosses one of these, the mobile app sends you a push notification.
        </p>

        <p className="env-sheet-section-label">Alert at</p>
        <div className="env-pct-row">
          {ALERT_PRESET_PCTS.map((pct) => {
            const on = value.includes(pct)
            return (
              <button
                key={pct}
                type="button"
                className={`env-pct${on ? ' is-on' : ''}`}
                onClick={() => toggle(pct)}
                disabled={!on && atLimit}
                aria-pressed={on}
              >
                {pct}%
              </button>
            )
          })}
          {customPcts.map((pct) => (
            <button
              key={pct}
              type="button"
              className="env-pct is-on"
              onClick={() => toggle(pct)}
              aria-pressed="true"
              aria-label={`Remove ${pct}% alert`}
            >
              {pct}% ×
            </button>
          ))}
        </div>

        <form
          className="env-pct-custom"
          onSubmit={(e) => {
            e.preventDefault()
            addCustom()
          }}
        >
          <input
            className="env-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            placeholder="Custom"
            aria-label="Custom alert percentage"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={atLimit}
          />
          <button type="submit" className="env-pct-add" disabled={atLimit || !custom.trim()}>
            Add
          </button>
        </form>

        {atLimit && <p className="env-sheet-hint">That&apos;s the most you can pick. Turn one off to add another.</p>}
        {value.length === 0 && !atLimit && <p className="env-sheet-hint">No alerts. This envelope stays quiet.</p>}

        <p className="env-sheet-note">
          <Bell size={12} aria-hidden="true" /> Notifications are sent as push alerts on the Aviary mobile app only.
        </p>

        <div className="env-sheet-actions">
          <button type="button" className="env-sheet-action env-sheet-action--cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="env-sheet-action env-sheet-action--save" onClick={onSave}>
            Save
          </button>
        </div>
      </Sheet>
    </Scrim>
  )
}
