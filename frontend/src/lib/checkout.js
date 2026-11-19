// Pure helpers for checkout (kept out of component files so fast refresh stays happy).
export const METHOD_LABELS = {
  CARD: 'Card',
  UPI: 'UPI',
  NET_BANKING: 'Net Banking',
  COD: 'Cash on Delivery',
}

export const PIN_PATTERN = /^[1-9][0-9]{5}$/

/** A fresh random id for one payment attempt (the server accepts 16-80 letters, digits, - and _). */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID()
}

/**
 * After a payment error: keep the same key when the outcome is unknown (network, server error, still processing),
 * so a repeat can never charge twice. Use a new key after a definite answer such as a decline.
 */
export function shouldKeepKey(err) {
  return err.status === 0 || err.status >= 500 || err.code === 'PAYMENT_IN_PROGRESS'
}

export function paymentStatusLabel(status) {
  if (status === 'PAY_ON_DELIVERY_PENDING') return 'Pay on Delivery - Pending'
  if (status === 'AUTHORIZED' || status === 'PAID') return 'Payment authorized'
  return status
}
