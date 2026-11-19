import { formatPrice } from './format.js'

const TONES = {
  'Pending Payment': 'bg-amber-900/50 text-amber-200',
  Confirmed: 'bg-blue-900/50 text-blue-200',
  Dispatched: 'bg-indigo-900/50 text-indigo-200',
  Delivered: 'bg-green-900/50 text-green-200',
  Cancelled: 'bg-red-900/50 text-red-200',
  'Return Requested': 'bg-amber-900/50 text-amber-200',
  Returned: 'bg-gray-700 text-gray-200',
}

export const orderStatusTone = (status) => TONES[status] ?? 'bg-gray-700 text-gray-200'

/** Plain-language refund line for the order details page (FR-077). */
export function refundLabel(refund) {
  const what = refund.reason === 'RETURN' ? 'Return refund' : 'Cancellation refund'
  if (refund.status === 'NOT_REQUIRED') return `${what}: no money refund needed.`
  if (refund.status === 'COMPLETED') return `${what} of ${formatPrice(refund.amount)} completed.`
  return `${what} of ${formatPrice(refund.amount)} pending.`
}
