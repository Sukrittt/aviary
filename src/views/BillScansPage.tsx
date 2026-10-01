'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AmountText, STAGGER, popIn, staggerDelay } from '../components/landing/mobile/kit'
import { ChevronRight, Eye, EyeOff, X } from 'lucide-react'
import { LoadingCaption } from '../components/LoadingCaption'
import { Scrim, Sheet } from '../components/MotionSheet'
import { useBillScan, useBillScans } from '../hooks/useBillScans'
import { useHideAmounts } from '../hooks/useHideAmounts'
import { splitEmoji } from '../lib/emoji'
import { formatDate, formatDateShort } from '../lib/format'
import { feeDiff, groupByDivisor, isFeeLine, round2 } from '../lib/split'
import { CHART_COLORS } from '../theme/chartColors'
import type { BillScanItem } from '../api/bills'
import { BirdEmptyState } from '../components/BirdEmptyState'

/** `/account/bill-scans`. Twin of Mobile's account/bill-scans.tsx + modals/bill-scan.tsx. */
export function BillScansPage() {
  const { formatCurrency } = useCurrency()
  const [hideAmounts] = useHideAmounts()
  const scansQ = useBillScans()
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = scansQ.data ?? []
  const loading = scansQ.isLoading
  const loadError = scansQ.isError
  const shareTotal = rows.reduce((sum, row) => sum + row.my_share, 0)
  const itemCount = rows.reduce((sum, row) => sum + row.item_count, 0)
  const labelOf = (category: string) => splitEmoji(category).text || category
  const categoryColor = new Map(
    [...new Set(rows.map((row) => labelOf(row.category)))]
      .sort()
      .map((label, index) => [label, CHART_COLORS[index % CHART_COLORS.length]]),
  )

  return (
    <>
      <div className="account-page-heading">
        <div>
          <div className="account-section-label">Bills Scanned</div>
          <div className="account-row-meta" style={{ padding: '2px 4px 0' }}>
            {loading ? 'Fetching your bills' : rows.length === 0 ? 'Nothing scanned yet' : `${rows.length} scanned`}
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingCaption feature="billScans" placement="page" />
      ) : loadError ? (
        <div className="account-empty">
          <p className="account-row-meta">Couldn&apos;t load your scans. Check your connection and try again.</p>
        </div>
      ) : rows.length === 0 ? (
        <BirdEmptyState
          subject="scans"
          title="No scans yet"
          description="Scan a bill from the sidebar and it’ll show up here, photo and all."
        />
      ) : (
        <>
          <div className="account-card recurring-hero">
            <div className="account-section-label">Your share logged</div>
            <div className="recurring-hero-amount">
              {hideAmounts ? formatCurrency(shareTotal, true) : <AmountText value={shareTotal} animate />}
            </div>
            <div className="account-row-meta">
              {rows.length === 50 ? 'Latest 50 bills' : `${rows.length} ${rows.length === 1 ? 'bill' : 'bills'}`} · {itemCount}{' '}
              {itemCount === 1 ? 'item' : 'items'}
            </div>
          </div>

          <ul className="account-card recurring-list" aria-label="Scanned bills">
            {rows.map((row, i) => (
              <motion.li key={row.id} {...popIn(staggerDelay(i))}>
                <button type="button" className="account-row" onClick={() => setOpenId(row.id)}>
                  <span
                    className="recurring-dot"
                    style={{ background: categoryColor.get(labelOf(row.category)) ?? 'var(--erd-text3)' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="account-row-label recurring-title">{row.merchant}</span>
                    <span className="account-row-meta recurring-meta">
                      {labelOf(row.category)} · {formatDateShort(row.date)} · {row.item_count}{' '}
                      {row.item_count === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <strong>{formatCurrency(row.my_share, hideAmounts)}</strong>
                  <ChevronRight size={16} className="account-row-arrow" aria-hidden="true" />
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      <AnimatePresence>{openId && <BillScanDetail id={openId} onClose={() => setOpenId(null)} />}</AnimatePresence>
    </>
  )
}

function BillScanDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { formatCurrency } = useCurrency()
  const [hideAmounts] = useHideAmounts()
  const scanQ = useBillScan(id)
  const scan = scanQ.data
  const [showPhoto, setShowPhoto] = useState(false)

  const category = splitEmoji(scan?.category ?? '')
  const shareGroups = groupByDivisor((scan?.items ?? []).filter((item) => !isFeeLine(item.name)))
  const fees = scan
    ? round2(
        scan.items.filter((item) => isFeeLine(item.name)).reduce((sum, item) => sum + item.price, 0) +
          feeDiff(scan.total, scan.items),
      )
    : 0
  const feesShare = scan ? round2(fees / scan.people_count) : 0
  const photoReady = scan?.image_status === 'ready' && !!scan.image_url

  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet
        className="erd-modal-card bill-scan-detail"
        role="dialog"
        aria-modal="true"
        aria-label={scan?.merchant || 'Scan detail'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bill-scan-head">
          <h3>{scan?.merchant || 'Scan detail'}</h3>
          <button type="button" className="scan-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {scanQ.isLoading ? (
          <LoadingCaption feature="billScanDetail" />
        ) : !scan ? (
          <p className="account-row-meta">Couldn&apos;t find that scan.</p>
        ) : (
          <>
            <motion.button
              {...popIn(STAGGER.mount)}
              type="button"
              className="bill-scan-preview-chip"
              disabled={!photoReady}
              aria-expanded={showPhoto}
              onClick={() => setShowPhoto(!showPhoto)}
            >
              {showPhoto ? <EyeOff size={16} /> : <Eye size={16} />}
              {scan.image_status === 'failed'
                ? "Photo couldn't be saved"
                : !photoReady
                  ? 'Photo still uploading…'
                  : showPhoto
                    ? 'Hide bill'
                    : 'Preview bill'}
            </motion.button>
            {showPhoto && scan.image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, nothing for next/image to optimize
              <img className="bill-scan-photo" src={scan.image_url} alt="Scanned bill" />
            )}

            <motion.div className="account-card bill-scan-hero" {...popIn(STAGGER.mount + STAGGER.item)}>
              <div className="bill-scan-heading">
                <span className="bill-scan-icon" aria-hidden="true">
                  {category.icon || '🧾'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="account-row-label">{scan.merchant}</div>
                  <div className="account-row-meta">
                    {category.text || scan.category} · {formatDate(scan.date)}
                  </div>
                </div>
              </div>
              <div className="account-section-label" style={{ padding: 0, marginTop: 18 }}>
                Your share
              </div>
              <div className="bill-scan-share">{formatCurrency(scan.my_share, hideAmounts)}</div>
              <dl className="bill-scan-breakdown">
                <div>
                  <dt>Bill total</dt>
                  <dd>{formatCurrency(scan.total, hideAmounts)}</dd>
                </div>
                {shareGroups.map((group) => (
                  <div key={group.divisor}>
                    <dt style={{ color: group.divisor === 1 ? 'var(--mint)' : 'var(--violet)' }}>By {group.divisor} share</dt>
                    <dd>{formatCurrency(group.share, hideAmounts)}</dd>
                  </div>
                ))}
                {Math.abs(fees) >= 0.01 && (
                  <div>
                    <dt>Fees &amp; discounts share</dt>
                    <dd>{formatCurrency(feesShare, hideAmounts)}</dd>
                  </div>
                )}
                <div>
                  <dt>Split between</dt>
                  <dd>
                    {scan.people_count} {scan.people_count === 1 ? 'person' : 'people'}
                  </dd>
                </div>
              </dl>
            </motion.div>

            <motion.div
              className="account-section-label"
              style={{ margin: '18px 0 10px' }}
              {...popIn(STAGGER.mount + 2 * STAGGER.item)}
            >
              Inside the bill · {scan.items.length}
            </motion.div>
            <ul className="account-card recurring-list">
              {scan.items.map((item, i) => (
                <ItemRow
                  key={`${item.name}-${i}`}
                  item={item}
                  hideAmounts={hideAmounts}
                  delay={staggerDelay(i, STAGGER.mount + 2 * STAGGER.item)}
                />
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </Scrim>
  )
}

function ItemRow({ item, hideAmounts, delay }: { item: BillScanItem; hideAmounts: boolean; delay: number }) {
  const { formatCurrency } = useCurrency()
  const tone = item.divisor === null ? 'none' : item.divisor > 1 ? 'split' : 'mine'
  const label = item.divisor === null ? 'Not yours' : item.divisor > 1 ? `Split ÷${item.divisor}` : 'Yours'

  return (
    <motion.li className="account-row" style={{ cursor: 'default' }} {...popIn(delay)}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="account-row-label" style={{ display: 'block' }}>
          {item.name}
        </span>
        <span className={`bill-scan-tag is-${tone}`}>
          {item.qty > 1 ? `× ${item.qty} · ` : ''}
          {label}
        </span>
      </span>
      <strong>{formatCurrency(item.price, hideAmounts)}</strong>
    </motion.li>
  )
}
