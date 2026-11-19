import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'
import { FALLBACK_COVER, formatDate, formatPrice } from '../lib/format.js'

function CartLine({ item, onChange, onRemove, busy }) {
  const [broken, setBroken] = useState(false)
  const qtyId = `qty-${item.bookId}`

  // Saved on blur or Enter so the field can be edited freely while typing.
  const commit = (input) => {
    const n = Math.floor(Number(input.value))
    if (n >= 1 && n !== item.quantity) onChange(item.bookId, n)
    else input.value = item.quantity
  }

  return (
    <li className="flex gap-3 rounded-lg border border-gray-800 bg-[#1b1b1b] p-3">
      <img
        src={broken || !item.coverUrl ? FALLBACK_COVER : item.coverUrl}
        alt=""
        width="60"
        height="90"
        className="h-24 w-16 shrink-0 rounded object-cover"
        onError={() => setBroken(true)}
      />
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-base font-semibold">
          <Link to={`/books/${item.bookId}`} className="hover:underline">
            {item.title}
          </Link>
        </h2>
        <p className="text-sm text-gray-400">
          {item.authors.length > 0 && `by ${item.authors.join(', ')} · `}
          {item.format}
        </p>
        <p className="text-sm">
          {formatPrice(item.unitPrice)} each
          {item.priceChanged && (
            <span className="ml-2 text-gray-400 line-through">{formatPrice(item.previousPrice)}</span>
          )}
        </p>
        {item.warnings.map((w) => (
          <p key={w} role="alert" className="text-sm text-amber-300">
            {w}
          </p>
        ))}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
          {item.available && (
            <>
              <label htmlFor={qtyId} className="text-sm text-gray-300">
                Quantity
              </label>
              <input
                // Remounts when the server changes the quantity, so the field shows the real value.
                key={item.quantity}
                id={qtyId}
                type="number"
                inputMode="numeric"
                min="1"
                max={item.maxQuantity}
                defaultValue={item.quantity}
                disabled={busy}
                onBlur={(e) => commit(e.target)}
                onKeyDown={(e) => e.key === 'Enter' && commit(e.target)}
                className="w-16 rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
              />
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(item.bookId)}
            aria-label={`Remove ${item.title} from cart`}
            className="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60"
          >
            Remove
          </button>
          <span className="ml-auto text-base font-semibold">{formatPrice(item.lineTotal)}</span>
        </div>
      </div>
    </li>
  )
}

export default function CartPage() {
  const { member } = useAuth()
  const { cart, status, refresh, setQuantity, remove } = useCart()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const run = async (call) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(await call())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading' && cart.items.length === 0) {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading your cart...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          Your cart could not be loaded. Please try again.
        </p>
        <button type="button" onClick={refresh} className="mt-3 rounded border border-gray-600 px-3 py-1 text-sm">
          Retry
        </button>
      </section>
    )
  }

  if (cart.items.length === 0) {
    return (
      <section className="p-4">
        <h1 className="text-2xl font-semibold">Your cart</h1>
        <p className="mt-2 text-gray-300">Your cart is empty.</p>
        <Link to="/books" className="mt-4 inline-block underline">
          Browse books
        </Link>
      </section>
    )
  }

  const blocked = cart.items.some((i) => !i.available)

  return (
    <section className="p-4" aria-labelledby="cart-title">
      <h1 id="cart-title" className="text-2xl font-semibold">
        Your cart
      </h1>
      {message && (
        <p role="status" className="mt-2 text-sm text-amber-300">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_20rem]">
        <ul className="flex flex-col gap-3" aria-label="Items in your cart">
          {cart.items.map((item) => (
            <CartLine
              key={item.bookId}
              item={item}
              busy={busy}
              onChange={(id, q) => run(() => setQuantity(id, q))}
              onRemove={(id) => run(() => remove(id))}
            />
          ))}
        </ul>
        <aside aria-label="Order summary" className="h-fit rounded-lg border border-gray-800 bg-[#1b1b1b] p-4">
          <h2 className="text-lg font-semibold">Summary</h2>
          <p className="mt-2 flex justify-between text-sm">
            <span>Items</span>
            <span>{cart.itemCount}</span>
          </p>
          <p className="mt-1 flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatPrice(cart.subtotal)}</span>
          </p>
          {cart.estimatedDelivery && (
            <p className="mt-2 text-sm text-gray-400">
              Estimated delivery by {formatDate(cart.estimatedDelivery)} (estimate, not confirmed)
            </p>
          )}
          {blocked && (
            <p className="mt-2 text-sm text-amber-300">Remove unavailable items to continue.</p>
          )}
          {blocked ? (
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded bg-indigo-600 px-3 py-2 text-sm text-white opacity-60"
            >
              Checkout
            </button>
          ) : (
            <>
              {!member && <p className="mt-4 text-sm text-gray-300">You will be asked to sign in. Your cart will be kept.</p>}
              <Link to="/checkout" className="mt-2 block w-full rounded bg-indigo-600 px-3 py-2 text-center text-sm text-white hover:bg-indigo-500">
                {member ? 'Checkout' : 'Sign in to check out'}
              </Link>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
