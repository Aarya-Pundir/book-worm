import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWishlist } from '../context/WishlistContext.jsx'
import { FALLBACK_COVER, formatPrice } from '../lib/format.js'
import { wishlistCartSummary } from '../lib/wishlist.js'

const buttonClass = 'rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60'
const primaryClass = 'rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500 disabled:opacity-60'

function Row({ item, busy, onRemove, onAdd }) {
  const [broken, setBroken] = useState(false)
  return (
    <li className="flex gap-4 rounded-lg border border-gray-800 bg-[#1b1b1b] p-3">
      <img
        src={broken || !item.coverUrl ? FALLBACK_COVER : item.coverUrl}
        alt=""
        width="60"
        height="90"
        className="h-24 w-16 rounded object-cover"
        onError={() => setBroken(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-base font-semibold leading-snug">
          {item.available || item.unavailableReason === 'Out of stock' ? (
            <Link to={`/books/${item.bookId}`} className="hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h2>
        {item.authors && item.authors.length > 0 && (
          <p className="text-sm text-gray-300">
            by{' '}
            {item.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/writers/${a.id}`} className="underline decoration-gray-600 hover:decoration-gray-300">
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
        )}
        {item.price !== undefined && (
          <p className="text-sm">
            <span className="font-semibold">{formatPrice(item.price)}</span> <span className="text-gray-400">{item.format}</span>
          </p>
        )}
        {!item.available && (
          <p className="text-sm text-amber-300">Unavailable: {item.unavailableReason}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {item.available && (
            <button type="button" disabled={busy} onClick={() => onAdd(item.bookId)} className={primaryClass} aria-label={`Add to cart: ${item.title}`}>
              Add to cart
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => onRemove(item.bookId)} className={buttonClass} aria-label={`Remove ${item.title} from wishlist`}>
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

export default function WishlistPage() {
  const { items, count, status, refresh, remove, moveToCart } = useWishlist()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null) // { kind: 'ok' | 'error', text }

  const run = async (fn) => {
    setBusy(true)
    setFeedback(null)
    try {
      await fn()
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onRemove = (bookId) => run(() => remove(bookId))
  const onAdd = (bookId) =>
    run(async () => setFeedback({ kind: 'ok', text: wishlistCartSummary(await moveToCart([bookId])) || 'Nothing was added.' }))
  const onAddAll = () =>
    run(async () => setFeedback({ kind: 'ok', text: wishlistCartSummary(await moveToCart()) || 'Nothing was added.' }))

  if (status === 'loading' || status === 'idle') {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading your wishlist...
      </p>
    )
  }
  if (status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          Your wishlist could not be loaded. Please try again.
        </p>
        <button type="button" onClick={refresh} className={`mt-3 ${buttonClass}`}>
          Retry
        </button>
      </section>
    )
  }

  const anyAvailable = items.some((i) => i.available)

  return (
    <section className="p-4" aria-labelledby="wishlist-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="wishlist-title" className="text-2xl font-semibold">
          My Wishlist
        </h1>
        {count > 0 && (
          <button type="button" disabled={busy || !anyAvailable} onClick={onAddAll} className={primaryClass}>
            Add all available to cart
          </button>
        )}
      </div>
      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${feedback.kind === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {feedback.text}
        </p>
      )}
      {count === 0 ? (
        <div className="mt-2">
          <p className="text-gray-300">Your wishlist is empty. Save books you want to read later.</p>
          <Link to="/books" className="mt-4 inline-block underline">
            Browse books
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <Row key={item.bookId} item={item} busy={busy} onRemove={onRemove} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </section>
  )
}