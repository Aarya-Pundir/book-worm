import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { buyAgain, cancelOrder, getOrder, listOrders, returnOrder } from '../services/apiClient.js'
import { METHOD_LABELS } from '../lib/checkout.js'
import { orderStatusTone, refundLabel } from '../lib/orders.js'
import { formatDate, formatPrice } from '../lib/format.js'

const buttonClass = 'rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60'
const primaryClass = 'rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500 disabled:opacity-60'
const cardClass = 'rounded-lg border border-gray-800 bg-[#1b1b1b] p-4'

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')

function StatusBadge({ status }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${orderStatusTone(status)}`}>{status}</span>
}

export function OrdersPage() {
  const [state, setState] = useState({ status: 'loading', items: [] })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      const data = await listOrders()
      setState({ status: 'ready', items: data.items })
    } catch {
      setState({ status: 'error', items: [] })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading your orders...
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          Your orders could not be loaded. Please try again.
        </p>
        <button type="button" onClick={load} className={`mt-3 ${buttonClass}`}>
          Retry
        </button>
      </section>
    )
  }
  if (state.items.length === 0) {
    return (
      <section className="p-4">
        <h1 className="text-2xl font-semibold">My Orders</h1>
        <p className="mt-2 text-gray-300">You have not placed any orders yet.</p>
        <Link to="/books" className="mt-4 inline-block underline">
          Browse books
        </Link>
      </section>
    )
  }

  return (
    <section className="p-4" aria-labelledby="orders-title">
      <h1 id="orders-title" className="text-2xl font-semibold">
        My Orders
      </h1>
      <ul className="mt-4 flex flex-col gap-3" aria-label="Your orders">
        {state.items.map((o) => (
          <li key={o.orderNumber} className={cardClass}>
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/orders/${o.orderNumber}`} className="font-semibold underline">
                {o.orderNumber}
              </Link>
              <StatusBadge status={o.status} />
              <span className="text-sm text-gray-400">{formatDate(o.placedAt.slice(0, 10))}</span>
              <span className="ml-auto font-semibold">{formatPrice(o.total)}</span>
            </div>
            <p className="mt-2 text-sm text-gray-300">
              {o.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ShipmentPanel({ order }) {
  const { shipment, returnShipment, estimatedDelivery, confirmedDelivery } = order
  const isDigital = !shipment && order.items.every((i) => i.format === 'eBook')
  return (
    <section aria-labelledby="ship-title" className={cardClass}>
      <h2 id="ship-title" className="text-lg font-semibold">
        Delivery
      </h2>
      {isDigital ? (
        <p className="mt-2 text-sm text-gray-300">eBooks are delivered digitally once payment is confirmed. There is no shipment.</p>
      ) : shipment ? (
        <>
          <p className="mt-2 text-sm">
            Shipment status: <strong>{shipment.status}</strong>
          </p>
          {shipment.trackingRef && <p className="text-sm">Tracking reference: {shipment.trackingRef}</p>}
          {confirmedDelivery ? (
            <p className="text-sm">Delivery date: {formatDate(confirmedDelivery)}</p>
          ) : (
            estimatedDelivery && <p className="text-sm text-gray-300">Estimated delivery by {formatDate(estimatedDelivery)} (estimate, not confirmed)</p>
          )}
          <ol className="mt-3 flex flex-col gap-1 text-sm" aria-label="Shipment history">
            {shipment.events.map((e, i) => (
              <li key={`${e.status}-${i}`} className="flex flex-wrap gap-2 text-gray-300">
                <span className="font-medium text-gray-100">{e.status}</span>
                <span>{when(e.at)}</span>
                {e.by === 'Admin' && <span className="text-xs text-amber-300">(set by an admin)</span>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-300">No shipment details yet.</p>
      )}
      {returnShipment && (
        <div className="mt-3 border-t border-gray-800 pt-3 text-sm">
          <p>
            Return status: <strong>{returnShipment.status}</strong>
          </p>
          <p>Return tracking reference: {returnShipment.trackingRef}</p>
        </div>
      )}
    </section>
  )
}

export function OrderDetailPage() {
  const { orderNumber } = useParams()
  const navigate = useNavigate()
  const { refresh: refreshCart } = useCart()
  const [state, setState] = useState({ status: 'loading', order: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(null) // 'cancel' | 'return'
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      const data = await getOrder(orderNumber)
      setState({ status: 'ready', order: data.order })
    } catch (err) {
      setState({ status: err.status === 404 ? 'missing' : 'error', order: null })
    }
  }, [orderNumber])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function act(call, done) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await call()
      done(result)
      setConfirming(null)
      setReason('')
    } catch (err) {
      // A refused action (outside the window, already dispatched ...) shows its reason and refreshes the page.
      setError(err.message)
      setConfirming(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading' && !state.order) {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading your order...
      </p>
    )
  }
  if (state.status === 'missing') {
    return (
      <section className="p-4">
        <p role="alert">This order could not be found.</p>
        <Link to="/orders" className="mt-3 inline-block underline">
          Back to My Orders
        </Link>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          This order could not be loaded. Please try again.
        </p>
        <button type="button" onClick={load} className={`mt-3 ${buttonClass}`}>
          Retry
        </button>
      </section>
    )
  }

  const order = state.order
  const { actions } = order

  return (
    <section className="p-4" aria-labelledby="order-title">
      <Link to="/orders" className="text-sm underline">
        Back to My Orders
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 id="order-title" className="text-2xl font-semibold">
          Order {order.orderNumber}
        </h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-sm text-gray-400">Placed {when(order.placedAt)}</p>
      {message && (
        <p role="status" className="mt-3 text-sm text-green-400">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="items-title" className={cardClass}>
            <h2 id="items-title" className="text-lg font-semibold">
              Items
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Items in this order">
              {order.items.map((i) => (
                <li key={i.bookId} className="flex justify-between gap-2">
                  <span>
                    {i.title} × {i.quantity} <span className="text-gray-400">({i.format})</span>
                  </span>
                  <span>{formatPrice(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </section>

          <ShipmentPanel order={order} />

          {order.address && (
            <section aria-labelledby="addr-title" className={cardClass}>
              <h2 id="addr-title" className="text-lg font-semibold">
                Delivery address
              </h2>
              <p className="mt-2 text-sm text-gray-300">
                {order.address.recipient}, {order.address.line1}
                {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city}, {order.address.state} {order.address.pinCode}
              </p>
            </section>
          )}
        </div>

        <aside className="flex h-fit flex-col gap-4">
          <section aria-labelledby="pay-title" className={cardClass}>
            <h2 id="pay-title" className="text-lg font-semibold">
              Payment
            </h2>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal)}</dd>
              </div>
              {order.couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt>Coupon {order.couponCode}</dt>
                  <dd>-{formatPrice(order.couponDiscount)}</dd>
                </div>
              )}
              {order.pointsRedeemed > 0 && (
                <div className="flex justify-between">
                  <dt>Gift points ({order.pointsRedeemed})</dt>
                  <dd>-{formatPrice(order.pointsDiscount)}</dd>
                </div>
              )}
              {order.shippingCharge > 0 && (
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd>{formatPrice(order.shippingCharge)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
            {order.payment && (
              <p className="mt-2 text-sm text-gray-300">
                {METHOD_LABELS[order.payment.method]}: {order.payment.statusLabel}
                {order.payment.reference && <span className="block text-xs text-gray-400">Reference {order.payment.reference}</span>}
              </p>
            )}
            {order.refunds.map((r) => (
              <p key={r.reason} className="mt-1 text-sm text-gray-300">
                {refundLabel(r)}
              </p>
            ))}
            {order.status === 'Cancelled' && order.cancelReason && <p className="mt-2 text-sm text-gray-400">Reason: {order.cancelReason}</p>}
          </section>

          <section aria-labelledby="act-title" className={cardClass}>
            <h2 id="act-title" className="text-lg font-semibold">
              Actions
            </h2>
            <div className="mt-2 flex flex-col gap-3">
              {actions.cancel.allowed ? (
                confirming === 'cancel' ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <label htmlFor="cancel-reason">Reason (optional)</label>
                    <input
                      id="cancel-reason"
                      value={reason}
                      maxLength={200}
                      onChange={(e) => setReason(e.target.value)}
                      className="rounded border border-gray-600 bg-[#121212] px-3 py-2"
                    />
                    <p className="text-gray-300">Cancelling gives your stock, coupon and gift points back and starts a refund.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={primaryClass}
                        onClick={() =>
                          act(() => cancelOrder(order.orderNumber, reason), (r) => {
                            setState({ status: 'ready', order: r.order })
                            setMessage('Your order was cancelled.')
                          })
                        }
                      >
                        {busy ? 'Cancelling...' : 'Yes, cancel this order'}
                      </button>
                      <button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirming(null)}>
                        Keep order
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={buttonClass} onClick={() => setConfirming('cancel')}>
                    Cancel order
                  </button>
                )
              ) : (
                <p className="text-sm text-gray-400">Cancel: {actions.cancel.reason}</p>
              )}

              {actions.return.allowed ? (
                confirming === 'return' ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="text-gray-300">A return pickup will be arranged. Your refund is made after the books are received.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={primaryClass}
                        onClick={() =>
                          act(() => returnOrder(order.orderNumber), (r) => {
                            setState({ status: 'ready', order: r.order })
                            setMessage('Your return was requested.')
                          })
                        }
                      >
                        {busy ? 'Requesting...' : 'Yes, return these books'}
                      </button>
                      <button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirming(null)}>
                        Keep order
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={buttonClass} onClick={() => setConfirming('return')}>
                    Return books
                  </button>
                )
              ) : (
                order.status !== 'Cancelled' && <p className="text-sm text-gray-400">Return: {actions.return.reason}</p>
              )}

              <button
                type="button"
                disabled={busy}
                className={buttonClass}
                onClick={() =>
                  act(() => buyAgain(order.orderNumber), async (r) => {
                    await refreshCart()
                    if (r.added.length === 0) {
                      setError(r.message ?? 'None of these books can be added right now.')
                      return
                    }
                    setMessage(r.message ? `${r.message}` : 'Added to your cart.')
                    navigate('/cart')
                  })
                }
              >
                Buy again
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}
