import { useId, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'

/** Quantity picker plus "Add to cart", used on book cards and the details page. */
export default function AddToCart({ book }) {
  const { add } = useCart()
  const [quantityText, setQuantityText] = useState('1')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null) // { kind: 'ok' | 'error', text }
  const qtyId = useId()

  if (!book.inStock) return null

  const submit = async (e) => {
    e.preventDefault()
    // Free typing in the field; clamp to 1..99 only when submitting.
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(quantityText)) || 1))
    setQuantityText(String(quantity))
    setBusy(true)
    setFeedback(null)
    try {
      const message = await add(book.id, quantity)
      setFeedback({ kind: 'ok', text: message ?? 'Added to your cart.' })
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={qtyId} className="sr-only">
          Quantity for {book.title}
        </label>
        <input
          id={qtyId}
          type="number"
          inputMode="numeric"
          min="1"
          max="99"
          value={quantityText}
          onChange={(e) => setQuantityText(e.target.value)}
          className="w-16 rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={`Add to cart: ${book.title}`}
          className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-60"
        >
          {busy ? 'Adding...' : 'Add to cart'}
        </button>
      </div>
      {feedback && (
        <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${feedback.kind === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {feedback.text}
        </p>
      )}
    </form>
  )
}
