import { useMutation } from '@tanstack/react-query'
import { scanBill } from '@/src/api/scan'
import { track } from '@/src/lib/analytics'

/** No cache invalidation — a scan reads nothing and writes nothing. */
export function useScanBill() {
  return useMutation({
    mutationFn: scanBill,
    onMutate: () => track('bill_scan_started'),
    // Fires when the OCR came back, not when the expense was saved. Pairing
    // this against expense_logged on the scan page is what shows how many
    // scans get abandoned at the review step.
    onSuccess: () => track('bill_scanned'),
    onError: () => track('bill_scan_failed', { reason: 'error' }),
  })
}
