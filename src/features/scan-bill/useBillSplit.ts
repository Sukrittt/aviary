import type { ScanResult } from '@/src/api/scan';
import { computeShare, feeDiff, groupByDivisor, isFeeLine, round2, type ScanItem } from '@/src/lib/split';
import { useMemo, useState } from 'react';

// Twin of Mobile/src/features/scan-bill/useBillSplit.ts, unchanged.
// `qty` isn't part of ScanItem (the split math never needs it) but every item
// carries it from the scan result — kept on the type so callers persisting
// the full item (see ScanBillModal's saveBillScan call) don't need
// an unsafe cast.
export type ReviewItem = ScanItem & { key: string; name: string; qty?: number }
let nextKey = 0
const makeKey = () => String(++nextKey)

export function useBillSplit() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [feeResidual, setFeeResidual] = useState(0)
  const [peopleCount, setPeopleCount] = useState(2)
  const totals = useMemo(() => {
    const productItems = items.filter(it => !isFeeLine(it.name))
    const feeItems = items.filter(it => isFeeLine(it.name))
    const feeAggregate = round2(feeItems.reduce((s, it) => s + it.price, 0) + feeResidual)
    const hasFee = Math.abs(feeAggregate) >= 0.01
    const feeShare = hasFee ? round2(feeAggregate / peopleCount) : 0
    const billTotal = round2(items.reduce((s, it) => s + it.price, 0) + feeResidual)
    const myShare = round2(computeShare(productItems) + feeShare)
    return {
      productItems, feeItems, feeAggregate, hasFee, feeShare, billTotal, myShare,
      sharePct: billTotal > 0 ? Math.round(myShare / billTotal * 100) : 0,
      buckets: groupByDivisor(productItems)
    }
  }, [items, feeResidual, peopleCount])
  return {
    items, peopleCount, totals, actions: {
      reset() {
        setItems([])
        setFeeResidual(0)
        setPeopleCount(2)
      },
      load(result: ScanResult) {
        setItems(result.items.map(it => ({ ...it, key: makeKey(), divisor: 1 })))
        setFeeResidual(feeDiff(result.total, result.items))
        setPeopleCount(2)
      },
      setPeopleCount,
      updateItem(key: string, patch: Partial<ReviewItem>) { setItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it)) },
      removeItem(key: string) { setItems(prev => prev.filter(it => it.key !== key)) },
      addBlankItem() { setItems(prev => [...prev, { key: makeKey(), name: '', price: 0, divisor: 1 }]) },
      applyDivisor(keys: string[], divisor: number) { setItems(prev => prev.map(it => keys.includes(it.key) ? { ...it, divisor } : it)) },
      setAllMine() { setItems(prev => prev.map(it => ({ ...it, divisor: 1 }))) },
    }
  }
}
