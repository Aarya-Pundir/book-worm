import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import {
  ApiError,
  createAddress,
  deleteAddress,
  listAddresses,
  payOrder,
  placeOrder,
  reviewCheckout,
  updateAddress,
} from '../services/apiClient.js'
import { METHOD_LABELS, PIN_PATTERN, newIdempotencyKey, paymentStatusLabel, shouldKeepKey } from '../lib/checkout.js'
import { formatDate, formatPrice } from '../lib/format.js'

const inputClass = 'w-full rounded border border-gray-600 bg-[#121212] px-3 py-2 text-gray-100'
const buttonClass = 'rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60'
const primaryClass = 'w-full rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-60'

const EMPTY_FORM = { recipient: '', phone: '', line1: '', line2: '', city: '', state: '', pinCode: '', isDefault: false }

const FIELDS = [
  ['recipient', 'Recipient name', 'name'],
  ['phone', 'Mobile number', 'tel'],
  ['line1', 'Address line 1', 'address-line1'],
  ['line2', 'Address line 2 (optional)', 'address-line2'],
  ['city', 'City', 'address-level2'],
  ['state', 'State', 'address-level1'],
  ['pinCode', 'PIN code', 'postal-code'],
]

function AddressForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial, line2: initial.line2 ?? '' } : EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    for (const [key, label] of FIELDS) {
      if (key !== 'line2' && !String(form[key]).trim()) next[key] = `${label} is required`
    }
    if (!next.pinCode && !PIN_PATTERN.test(form.pinCode.trim())) next.pinCode = 'PIN code must be 6 digits and cannot start with 0'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const payload = { ...form, pinCode: form.pinCode.trim(), line2: form.line2.trim() || undefined }
      const data = initial ? await updateAddress(initial.id, payload) : await createAddress(payload)
      onSaved(data.address)
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 space-y-3 rounded border border-gray-800 p-3" aria-label={initial ? 'Edit address' : 'Add address'}>
      {FIELDS.map(([key, label, autoComplete]) => (
        <div key={key}>
          <label htmlFor={`addr-${key}`} className="mb-1 block text-sm">
            {label}
          </label>
          <input
            id={`addr-${key}`}
            className={inputClass}
            autoComplete={autoComplete}
            inputMode={key === 'pinCode' ? 'numeric' : undefined}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            aria-invalid={Boolean(errors[key])}
          />
          {errors[key] && <p className="mt-1 text-sm text-red-400">{errors[key]}</p>}
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        Make this my default address
      </label>
      {formError && (
        <p role="alert" className="text-sm text-red-400">
          {formError}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Saving...' : 'Save address'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function Confirmation({ result }) {
  const { order, payment } = result
  return (
    <section className="p-4" aria-labelledby="confirm-title">
      <h1 id="confirm-title" className="text-2xl font-semibold">
        Order confirmed
      </h1>
      <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-gray-800 bg-[#1b1b1b] p-4 text-sm">
        <dt className="text-gray-400">Order number</dt>
        <dd className="font-semibold">{order.orderNumber}</dd>
        <dt className="text-gray-400">Payment</dt>
        <dd>
          {METHOD_LABELS[payment.method]} - {paymentStatusLabel(payment.status)}
        </dd>
        <dt className="text-gray-400">Payment reference</dt>
        <dd>{payment.reference}</dd>
        <dt className="text-gray-400">Amount</dt>
        <dd>{formatPrice(payment.amount)}</dd>
        {order.estimatedDelivery && (
          <>
            <dt className="text-gray-400">Estimated delivery</dt>
            <dd>{formatDate(order.estimatedDelivery)} (estimate, not confirmed)</dd>
          </>
        )}
      </dl>
      <Link to="/books" className="mt-4 inline-block underline">
        Continue shopping
      </Link>
    </section>
  )
}

export default function CheckoutPage() {
  const { cart, refresh: refreshCart } = useCart()
  const [addresses, setAddresses] = useState(null) // null while loading
  const [addressError, setAddressError] = useState(false)
  const [addressId, setAddressId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | address
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [points, setPoints] = useState(0)
  const [review, setReview] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [method, setMethod] = useState('CARD')
  const [codTerms, setCodTerms] = useState(false)
  const [simulateDecline, setSimulateDecline] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [result, setResult] = useState(null)
  // One payment attempt: the same key is reused when the outcome is unknown, so a repeat cannot charge twice.
  const attempt = useRef(null)

  const loadAddresses = useCallback(async () => {
    setAddressError(false)
    try {
      const data = await listAddresses()
      setAddresses(data.items)
      setAddressId((current) => (data.items.some((a) => a.id === current) ? current : (data.items.find((a) => a.isDefault) ?? data.items[0])?.id ?? null))
    } catch {
      setAddressError(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAddresses()
  }, [loadAddresses])

  // Re-price whenever the choices or the cart change. The server computes everything.
  const cartKey = `${cart.itemCount}:${cart.subtotal}`
  const [reloadTick, setReloadTick] = useState(0)
  useEffect(() => {
    if (addresses === null || result) return undefined
    let live = true
    reviewCheckout({ addressId: addressId ?? undefined, couponCode: coupon || undefined, redeemPoints: points || undefined })
      .then((data) => {
        if (!live) return
        setReview(data.review)
        setReviewError('')
        setMethod((m) => (data.review.paymentMethods.find((x) => x.method === m)?.available ? m : 'CARD'))
      })
      .catch((err) => live && setReviewError(err.message))
    return () => {
      live = false
    }
  }, [addresses, addressId, coupon, points, cartKey, reloadTick, result])

  async function removeAddress(id) {
    try {
      await deleteAddress(id)
      await loadAddresses()
    } catch (err) {
      setPayError(err.message)
    }
  }

  async function onPay() {
    setPayError('')
    setPaying(true)
    try {
      const sig = `${addressId}|${coupon}|${points}|${cartKey}`
      if (!attempt.current || attempt.current.sig !== sig) {
        const placed = await placeOrder({ addressId: addressId ?? undefined, couponCode: coupon || undefined, redeemPoints: points || undefined })
        attempt.current = { orderNumber: placed.order.orderNumber, key: newIdempotencyKey(), sig }
      }
      const body = { orderNumber: attempt.current.orderNumber, method }
      if (method === 'COD') body.acceptCodTerms = codTerms
      if (simulateDecline && import.meta.env.DEV) body.simulate = 'decline'
      const data = await payOrder(body, attempt.current.key)
      setResult(data)
      refreshCart()
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Something went wrong. Please try again.')
      setPayError(apiErr.fields?.acceptCodTerms ?? apiErr.message)
      // A definite answer (declined, unavailable ...) needs a fresh order refresh and key; an unknown one keeps both.
      if (!shouldKeepKey(apiErr)) attempt.current = null
      if (apiErr.status === 409 || apiErr.status === 402) setReloadTick((t) => t + 1)
    } finally {
      setPaying(false)
    }
  }

  if (result) return <Confirmation result={result} />

  if (cart.items.length === 0 && !review) {
    return (
      <section className="p-4">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="mt-2 text-gray-300">Your cart is empty.</p>
        <Link to="/books" className="mt-4 inline-block underline">
          Browse books
        </Link>
      </section>
    )
  }

  if (addressError) {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          Your addresses could not be loaded. Please try again.
        </p>
        <button type="button" onClick={loadAddresses} className={`mt-3 ${buttonClass}`}>
          Retry
        </button>
      </section>
    )
  }

  if (addresses === null) {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading checkout...
      </p>
    )
  }

  const methodInfo = review?.paymentMethods.find((m) => m.method === method)
  const blocked = !review || review.blockers.length > 0 || !methodInfo?.available || (method === 'COD' && !codTerms)
  const needsAddress = review ? review.hasPhysical : cart.items.some((i) => i.format !== 'eBook')

  return (
    <section className="p-4" aria-labelledby="checkout-title">
      <h1 id="checkout-title" className="text-2xl font-semibold">
        Checkout
      </h1>
      {reviewError && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {reviewError}{' '}
          <button type="button" className="underline" onClick={() => setReloadTick((t) => t + 1)}>
            Retry
          </button>
        </p>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {needsAddress ? (
            <section aria-labelledby="addr-title" className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4">
              <h2 id="addr-title" className="text-lg font-semibold">
                Delivery address
              </h2>
              {addresses.length === 0 && editing !== 'new' && <p className="mt-2 text-sm text-gray-300">You have no saved addresses yet.</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {addresses.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 text-sm">
                    <input
                      type="radio"
                      name="address"
                      id={`addr-choice-${a.id}`}
                      checked={addressId === a.id}
                      onChange={() => setAddressId(a.id)}
                      className="mt-1"
                    />
                    <label htmlFor={`addr-choice-${a.id}`} className="flex-1">
                      <span className="font-medium">{a.recipient}</span>
                      {a.isDefault && <span className="ml-2 text-xs text-gray-400">(default)</span>}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pinCode}
                      <br />
                      {a.phone}
                    </label>
                    <button type="button" className={buttonClass} onClick={() => setEditing(a)} aria-label={`Edit address for ${a.recipient}`}>
                      Edit
                    </button>
                    <button type="button" className={buttonClass} onClick={() => removeAddress(a.id)} aria-label={`Delete address for ${a.recipient}`}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              {editing ? (
                <AddressForm
                  key={editing === 'new' ? 'new' : editing.id}
                  initial={editing === 'new' ? null : editing}
                  onCancel={() => setEditing(null)}
                  onSaved={(saved) => {
                    setEditing(null)
                    setAddressId(saved.id)
                    loadAddresses()
                  }}
                />
              ) : (
                <button type="button" className={`mt-3 ${buttonClass}`} onClick={() => setEditing('new')}>
                  Add a new address
                </button>
              )}
              {review?.blockers.map((b) => (
                <p key={b.code} role="alert" className="mt-2 text-sm text-amber-300">
                  {b.message}
                </p>
              ))}
            </section>
          ) : (
            <p className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4 text-sm text-gray-300">
              Your order has only eBooks, so no delivery address or shipping charge is needed.
            </p>
          )}

          <section aria-labelledby="pay-title" className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4">
            <h2 id="pay-title" className="text-lg font-semibold">
              Payment method
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Temporary test payment. No card or bank details are collected, and no real money is charged.
            </p>
            <div role="radiogroup" aria-labelledby="pay-title" className="mt-2 flex flex-col gap-2">
              {(review?.paymentMethods ?? []).map((m) => (
                <label key={m.method} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="method"
                    value={m.method}
                    checked={method === m.method}
                    disabled={!m.available}
                    onChange={() => setMethod(m.method)}
                  />
                  {METHOD_LABELS[m.method]}
                  {!m.available && <span className="text-xs text-gray-400">({m.reason})</span>}
                </label>
              ))}
            </div>
            {method === 'COD' && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={codTerms} onChange={(e) => setCodTerms(e.target.checked)} className="mt-1" />
                I accept the Cash on Delivery terms and will pay the courier when the books arrive.
              </label>
            )}
            {import.meta.env.DEV && (
              <label className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} />
                Test mode: simulate a declined payment
              </label>
            )}
          </section>
        </div>

        <aside aria-label="Order review" className="h-fit rounded-lg border border-gray-800 bg-[#1b1b1b] p-4">
          <h2 className="text-lg font-semibold">Review your order</h2>
          {!review ? (
            <p role="status" className="mt-2 text-sm text-gray-400">
              Calculating your total...
            </p>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-2 text-sm" aria-label="Items in this order">
                {review.items.map((i) => (
                  <li key={i.bookId}>
                    <div className="flex justify-between gap-2">
                      <span>
                        {i.title} × {i.quantity}
                      </span>
                      <span>{formatPrice(i.lineTotal)}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {i.format === 'eBook' ? 'eBook, no delivery needed' : i.estimatedDelivery ? `Estimated delivery by ${formatDate(i.estimatedDelivery)} (estimate, not confirmed)` : 'Choose an address to see the estimated delivery'}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex gap-2">
                <label htmlFor="coupon" className="sr-only">
                  Coupon code
                </label>
                <input id="coupon" className={inputClass} placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
                <button type="button" className={buttonClass} onClick={() => setCoupon(couponInput.trim())}>
                  Apply
                </button>
              </div>
              {review.coupon && (
                <p role="status" className={`mt-1 text-sm ${review.coupon.applied ? 'text-green-400' : 'text-amber-300'}`}>
                  {review.coupon.message}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <label htmlFor="points" className="sr-only">
                  Gift points to use
                </label>
                <input
                  id="points"
                  className={inputClass}
                  inputMode="numeric"
                  placeholder={`Gift points (balance ${review.points.balance})`}
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                />
                <button type="button" className={buttonClass} onClick={() => setPoints(Math.max(0, Math.floor(Number(pointsInput)) || 0))}>
                  Use
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">You can use up to {review.points.maxRedeemable} points on this order.</p>
              {review.notices.map((n) => (
                <p key={n} role="status" className="mt-1 text-sm text-amber-300">
                  {n}
                </p>
              ))}

              <dl className="mt-3 flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(review.subtotal)}</dd>
                </div>
                {review.coupon?.applied && (
                  <div className="flex justify-between">
                    <dt>Coupon</dt>
                    <dd>-{formatPrice(review.coupon.discount)}</dd>
                  </div>
                )}
                {review.points.redeemed > 0 && (
                  <div className="flex justify-between">
                    <dt>Gift points ({review.points.redeemed})</dt>
                    <dd>-{formatPrice(review.points.discount)}</dd>
                  </div>
                )}
                {review.hasPhysical && (
                  <div className="flex justify-between">
                    <dt>Shipping</dt>
                    <dd>{review.delivery ? (review.shipping === 0 ? 'Free' : formatPrice(review.shipping)) : '-'}</dd>
                  </div>
                )}
                <div className="flex justify-between text-lg font-semibold">
                  <dt>Total</dt>
                  <dd>{formatPrice(review.total)}</dd>
                </div>
              </dl>
            </>
          )}

          {payError && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {payError}
            </p>
          )}
          <button type="button" disabled={blocked || paying} onClick={onPay} className={`mt-4 ${primaryClass}`}>
            {paying ? 'Processing...' : method === 'COD' ? 'Place order' : `Pay ${review ? formatPrice(review.total) : ''}`.trim()}
          </button>
        </aside>
      </div>
    </section>
  )
}
