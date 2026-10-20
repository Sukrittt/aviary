'use client'
import { useState } from 'react'
import { CaretRightIcon } from '@/src/components/icons'
import { AnimatePresence } from 'motion/react'
import { currencyInfo, searchCurrencies } from '@/src/lib/currencies'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useUpdateUser } from '@/src/hooks/useUser'
import { Scrim, Sheet } from './MotionSheet'

export function CurrencyPicker({ value, onChange, disabled = false, autoFocus = false }: { value: string; onChange: (code: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const [search, setSearch] = useState('')
  const selected = currencyInfo(value)
  const matches = searchCurrencies(search)
  return <div style={{ width: '100%', minWidth: 0 }}>
    <div className="currency-selected-card">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="currency-selected-eyebrow">Selected currency</div>
        <div className="currency-selected-name">{selected.name}</div>
      </div>
      <span className="currency-selected-code">{selected.code}{selected.symbol !== selected.code ? ` · ${selected.symbol}` : ''}</span>
    </div>
    <input type="search" autoFocus={autoFocus} aria-label="Search currencies" placeholder="Search currency, country or code" value={search} onChange={e => setSearch(e.target.value)} className="txn-entry-input" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
    <div role="group" aria-label="Currency" style={{ maxHeight: 440, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
      {matches.map(c => <button key={c.code} type="button" disabled={disabled} aria-pressed={value === c.code} onClick={() => onChange(c.code)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', minHeight: 48, color: 'var(--text)', background: value === c.code ? 'var(--mint-soft)' : 'transparent', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit' }}>
        <span style={{ flex: 1 }}>{c.name}<small style={{ display: 'block', color: 'var(--text-2)' }}>{c.code}{c.symbol !== c.code ? ` · ${c.symbol}` : ''}</small></span>
        {value === c.code && <span aria-hidden="true">✓</span>}
      </button>)}
      {!matches.length && <p style={{ padding: 12 }}>No currencies found.</p>}
    </div>
  </div>
}

export function CurrencySetting() {
  const { currencyCode } = useCurrency()
  const update = useUpdateUser()
  const [open, setOpen] = useState(false)
  const current = currencyInfo(currencyCode)
  return <>
    <button type="button" className="account-row" onClick={() => setOpen(true)} style={{ width: '100%', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}>
      <span className="account-row-label">Currency</span>
      <span className="account-chip">
        {current.code}{current.symbol !== current.code ? ` · ${current.symbol}` : ''}
        <CaretRightIcon size={14} aria-hidden="true" />
      </span>
    </button>
    <AnimatePresence>
      {open && (
        <Scrim className="erd-modal-overlay" onClick={() => setOpen(false)}>
          <Sheet className="erd-modal-card currency-modal" role="dialog" aria-modal="true" aria-label="Currency" onClick={(e) => e.stopPropagation()}>
            <div className="erd-modal-head">
              <h3>Currency</h3>
              <button type="button" className="erd-modal-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <p className="account-row-meta" style={{ margin: '12px 0 16px' }}>Changing currency updates how amounts are displayed. Amounts aren’t converted.</p>
            <CurrencyPicker
              value={currencyCode}
              autoFocus
              disabled={update.isPending}
              onChange={code => { setOpen(false); update.mutate({ currencyCode: code }) }}
            />
            {update.isPending && <p role="status">Saving…</p>}
            {update.isError && <p role="alert">Couldn’t save currency. Please try again.</p>}
          </Sheet>
        </Scrim>
      )}
    </AnimatePresence>
  </>
}
