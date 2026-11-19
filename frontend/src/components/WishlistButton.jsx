import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWishlist } from '../context/WishlistContext.jsx'

/** Heart-style toggle for My Wishlist. A guest is asked to sign in (FR-081). */
export default function WishlistButton({ book }) {
  const { member, openLogin } = useAuth()
  const { ids, add, remove, status } = useWishlist()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState(false)

  const saved = ids.has(book.id)
  // The visible text starts the accessible name (WCAG 2.5.3, Label in Name).
  const label = saved ? 'Remove from wishlist' : 'Add to wishlist'

  const toggle = async () => {
    setError('')
    if (!member) {
      setPrompt(true)
      openLogin()
      return
    }
    setBusy(true)
    try {
      await (saved ? remove(book.id) : add(book.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || (member && status === 'loading')}
        aria-pressed={saved}
        aria-label={`${label}: ${book.title}`}
        className="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60"
      >
        {label}
      </button>
      {prompt && !member && (
        <p role="status" className="text-xs text-gray-300">
          Sign in to keep a wishlist.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}