import { useMemo, useState } from 'react'
import { useBillSplit } from '@/src/features/scan-bill/useBillSplit'
import { base64Of, dataUrlFromFile, dataUrlFromVideo } from '@/src/features/scan-bill/image'
import { useCategories } from '@/src/hooks/useCategories'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { useSaveBillScan } from '@/src/hooks/useBillScans'
import { useScanBill } from '@/src/hooks/useScanBill'
import { useButtonPhase } from '@/src/components/SuccessButton'
import { EMPTY } from '@/src/lib/constants'
import { todayIST } from '@/src/lib/date'
import { splitEmoji } from '@/src/lib/emoji'

// Twin of Mobile/src/features/scan-bill/useScanBillController.ts. Where they
// differ: the photo is picked inside this flow (Mobile picks it on the More
// screen and hands it over), and success plays the inline tick and closes the dialog
// instead of routing to expense-added.
type Phase = 'pick' | 'scanning' | 'review' | 'confirm' | 'error'

const READ_FAILED = "Couldn't read that image. Try another one, or enter this expense manually."

export function useScanBillController({ onDone }: { onDone: () => void }) {
  const categoriesQ = useCategories()
  const categories = useMemo(() => categoriesQ.data ?? EMPTY, [categoriesQ.data])
  const scanBill = useScanBill()
  const addExpense = useAddExpense()
  const saveBillScan = useSaveBillScan()
  const confirmButton = useButtonPhase()

  const [phase, setPhase] = useState<Phase>('pick')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(todayIST())
  const { items, peopleCount, totals, actions } = useBillSplit()
  const { productItems, myShare, billTotal } = totals
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [selecting, setSelecting] = useState(false)
  const [pickingCategory, setPickingCategory] = useState(false)

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? productItems.filter((it) => it.name.toLowerCase().includes(q)) : productItems
  }, [productItems, query])
  const canProceed = merchant.trim() !== '' && category !== '' && myShare > 0

  function fail(message: string) {
    setErrorMsg(message)
    setPhase('error')
  }

  async function scan(dataUrl: string) {
    setImageUrl(dataUrl)
    setPhase('scanning')
    // The scan route always requires a non-empty category list, same guard as
    // Mobile's more.tsx. Wait out an in-flight fetch rather than trusting a
    // still-undefined `.data`: refetch() joins the request already underway.
    const list = categoriesQ.data ?? (await categoriesQ.refetch()).data ?? []
    if (list.length === 0) {
      fail('No categories yet. Add one first, or enter this expense manually.')
      return
    }
    scanBill.mutate(
      { image: base64Of(dataUrl), mimeType: 'image/jpeg', categories: list.map((c) => c.name) },
      {
        onSuccess: (res) => {
          setMerchant(res.merchant)
          setCategory(res.category ?? '')
          setDate(res.date ?? todayIST())
          actions.load(res)
          setQuery('')
          setSelected([])
          setPhase('review')
        },
        onError: () => fail("Couldn't read that bill. Try a clearer photo, or enter this expense manually."),
      },
    )
  }

  async function pickFile(file: File) {
    if (!file.type.startsWith('image/')) {
      fail(READ_FAILED)
      return
    }
    try {
      await scan(await dataUrlFromFile(file))
    } catch {
      // createImageBitmap rejects what the browser can't decode (HEIC outside Safari, a corrupt file).
      fail(READ_FAILED)
    }
  }

  function pickFrame(video: HTMLVideoElement) {
    try {
      void scan(dataUrlFromVideo(video))
    } catch {
      fail(READ_FAILED)
    }
  }

  function toggleSelected(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function toggleSelecting() {
    setSelecting((prev) => !prev)
    setSelected([])
  }

  function applyBulkDivisor(divisor: number) {
    if (selected.length === 0) return
    actions.applyDivisor(selected, divisor)
    setSelected([])
    setSelecting(false)
  }

  function handleConfirm() {
    if (addExpense.isPending || confirmButton.success) return
    setConfirmError('')
    confirmButton.start()
    addExpense.mutate(
      { item: merchant.trim(), amount_inr: String(myShare), category, date, payment_method: 'bank' },
      {
        onSuccess: (res) => {
          // Best-effort: the image/items/category behind this confirm, for a
          // future "past scans" screen. Never blocks or fails the confirm —
          // the expense itself already landed.
          if (res.id) {
            saveBillScan.mutate({
              image: base64Of(imageUrl),
              mimeType: 'image/jpeg',
              merchant: merchant.trim(),
              category,
              date,
              total: billTotal,
              my_share: myShare,
              people_count: peopleCount,
              expense_id: res.id,
              // The route rejects the whole scan over one nameless row, and
              // "Add item" makes those. Mobile sends them anyway and loses the record.
              items: items
                .filter((it) => it.name.trim() !== '')
                .map(({ name, price, qty, divisor }) => ({ name, price, qty: qty ?? 1, divisor })),
            })
          }
          confirmButton.succeed(() => {
            startOver()
            onDone()
          })
        },
        onError: () => {
          confirmButton.fail()
          setConfirmError("Couldn't log this. Check your connection and try again.")
        },
      },
    )
  }

  function startOver() {
    actions.reset()
    confirmButton.reset()
    setImageUrl('')
    setErrorMsg('')
    setConfirmError('')
    setMerchant('')
    setCategory('')
    setDate(todayIST())
    setQuery('')
    setSelected([])
    setSelecting(false)
    setPickingCategory(false)
    setPhase('pick')
  }

  return {
    categories, phase, setPhase, errorMsg, confirmError, imageUrl,
    merchant, setMerchant, category, setCategory, date, setDate,
    items, peopleCount, ...totals, ...actions,
    query, setQuery, selected, setSelected, selecting, toggleSelecting, visibleItems, canProceed,
    pickingCategory, setPickingCategory,
    toggleSelected, applyBulkDivisor, pickFile, pickFrame, handleConfirm, startOver,
    confirmButton, categoryLabel: category ? splitEmoji(category).text : '',
  }
}

export type ScanBillState = ReturnType<typeof useScanBillController>
