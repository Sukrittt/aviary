'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { motion } from 'motion/react'
import { STAGGER, popIn, staggerDelay } from '@/src/components/landing/mobile/kit'

import { useState } from 'react'
import { CategoryPicker } from '@/src/components/CategoryPicker'
import { DatePicker } from '@/src/components/DatePicker'
import { categoryEmoji, splitEmoji } from '@/src/lib/emoji'

import { round2 } from '@/src/lib/split'
import { DIVISORS, PEOPLE_COUNTS, splitLabel } from './presentation'
import type { ScanBillState } from './useScanBillController'

function parseAmount(raw: string, allowNegative = false): number {
  const n = Number(raw.replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Twin of Mobile's ScanReview: items on the left, the bill and what gets logged on the right. */
export function ScanReview(s: ScanBillState) {
  const { formatMoney } = useCurrency()

  const [pickingCategory, setPickingCategory] = useState(false)
  const selectedCategory = s.categories.find((c) => c.name === s.category)

  return (
    <div className="scan-review">
      <div className="scan-col">
        <div className="scan-toolbar">
          <input
            type="search"
            className="erd-search-input scan-search"
            placeholder="Search items"
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
          />
          <button type="button" className="account-pill-btn" onClick={s.setAllMine}>
            All mine
          </button>
        </div>

        {s.selected.length > 0 && (
          <div className="scan-bulk-bar">
            <span>{s.selected.length} selected · set split to</span>
            <div className="erd-chip-row">
              {DIVISORS.map((d) => (
                <button key={d} type="button" className="erd-chip" onClick={() => s.applyBulkDivisor(d)}>
                  {splitLabel(d)}
                </button>
              ))}
            </div>
            <button type="button" className="scan-link-btn" onClick={() => s.setSelected([])}>
              Clear
            </button>
          </div>
        )}

        <ul className="scan-items" aria-label="Bill items">
          {s.visibleItems.length === 0 && s.items.length > 0 && (
            <li className="scan-empty">No items match &quot;{s.query}&quot;</li>
          )}
          {s.visibleItems.map((it, i) => (
            <motion.li key={it.key} className="scan-item" {...popIn(staggerDelay(i, STAGGER.mount + 2 * STAGGER.block))}>
              <div className="scan-item-top">
                <input
                  type="checkbox"
                  checked={s.selected.includes(it.key)}
                  onChange={() => s.toggleSelected(it.key)}
                  aria-label={`Select ${it.name || 'item'}`}
                />
                <input
                  className="scan-item-name"
                  value={it.name}
                  placeholder="Item"
                  title={it.name}
                  aria-label="Item name"
                  onChange={(e) => s.updateItem(it.key, { name: e.target.value })}
                />
                <input
                  className="scan-item-share"
                  type="number"
                  step="0.01"
                  min="0"
                  aria-label={`Your share of ${it.name || 'item'}`}
                  value={round2(it.price / (it.divisor || 1))}
                  onChange={(e) =>
                    s.updateItem(it.key, { price: round2(parseAmount(e.target.value) * (it.divisor || 1)) })
                  }
                />
              </div>
              <div className="scan-item-bottom">
                <span className="scan-meta">

                  {formatMoney(it.price)} {it.divisor === 1 ? '· all yours' : `· split ${it.divisor} ways`}
                </span>
                <div className="scan-item-actions">
                  {DIVISORS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`erd-chip ${it.divisor === d ? 'is-selected' : ''}`}
                      aria-pressed={it.divisor === d}
                      onClick={() => s.updateItem(it.key, { divisor: d })}
                    >
                      {splitLabel(d)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="scan-icon-btn"
                    aria-label={`Remove ${it.name || 'item'}`}
                    onClick={() => s.removeItem(it.key)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>

        <button type="button" className="scan-link-btn is-accent" onClick={s.addBlankItem}>
          + Add item
        </button>

        {s.hasFee && (
          <section className="scan-card">
            <div className="scan-spread">
              <div>
                <div className="scan-card-title">Fees &amp; discount</div>
                <div className="scan-meta">Split equally across everyone on the bill</div>
              </div>
              <strong>{formatMoney(s.feeAggregate)}</strong>
            </div>
            {s.feeItems.map((it) => (
              <div key={it.key} className="scan-fee-row">
                <input
                  className="scan-item-name"
                  value={it.name}
                  aria-label="Fee name"
                  onChange={(e) => s.updateItem(it.key, { name: e.target.value })}
                />
                <input
                  className="scan-item-share"
                  type="number"
                  step="0.01"
                  aria-label={`Fee amount for ${it.name || 'fee'}`}
                  value={it.price}
                  onChange={(e) => s.updateItem(it.key, { price: parseAmount(e.target.value, true) })}
                />
                <button
                  type="button"
                  className="scan-icon-btn"
                  aria-label={`Remove ${it.name || 'fee'}`}
                  onClick={() => s.removeItem(it.key)}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="scan-spread">
              <span className="scan-meta is-strong">People on this bill</span>
              <div className="erd-chip-row">
                {PEOPLE_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`erd-chip ${s.peopleCount === n ? 'is-selected' : ''}`}
                    aria-pressed={s.peopleCount === n}
                    onClick={() => s.setPeopleCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="scan-spread">
              <span className="scan-meta is-strong">Your reconciled share</span>
              <strong className="scan-ink">{formatMoney(s.feeShare)}</strong>
            </div>
          </section>
        )}
      </div>

      <aside className="scan-col scan-side">
        {s.imageUrl && (
          <a className="scan-bill-thumb" href={s.imageUrl} target="_blank" rel="noreferrer" title="Open the full photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
            <img src={s.imageUrl} alt="The scanned bill" />
          </a>
        )}

        <section className="scan-card">
          <div className="scan-micro">Your share</div>
          <div className="scan-hero-amount">{formatMoney(s.myShare)}</div>
          <ShareBar pct={s.sharePct} />
          <div className="scan-spread scan-meta">
            <span>of {formatMoney(s.billTotal)} bill</span>
            <span className="is-strong">{s.sharePct}% yours</span>
          </div>
        </section>

        <label className="erd-log-label" htmlFor="scan-merchant">
          Merchant
        </label>
        <input
          id="scan-merchant"
          className="erd-log-input"
          value={s.merchant}
          placeholder="Merchant"
          onChange={(e) => s.setMerchant(e.target.value)}
        />

        <div className="erd-log-label">Category</div>
        <button
          type="button"
          className="scan-category-btn"
          aria-expanded={pickingCategory}
          onClick={() => setPickingCategory((v) => !v)}
        >
          {selectedCategory
            ? `${categoryEmoji(selectedCategory.name, selectedCategory.group)} ${splitEmoji(selectedCategory.name).text}`
            : 'Pick a category'}
        </button>
        {pickingCategory && (
          <CategoryPicker
            value={s.category}
            onChange={(c) => {
              s.setCategory(c)
              setPickingCategory(false)
            }}
          />
        )}

        <div className="erd-log-label">Date</div>
        <DatePicker mode="single" value={s.date} onChange={s.setDate} />

        <button
          type="button"
          className="erd-log-submit scan-submit"
          disabled={!s.canProceed}
          onClick={() => s.canProceed && s.setPhase('confirm')}
        >
          Review {formatMoney(s.myShare)} →
        </button>
      </aside>
    </div>
  )
}

export function ShareBar({ pct, height = 6, muted = false }: { pct: number; height?: number; muted?: boolean }) {
  return (
    <div className="scan-bar" style={{ height }}>
      <div
        className={`scan-bar-fill ${muted ? 'is-muted' : ''}`}
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, pct)) / 100})` }}
      />
    </div>
  )
}
