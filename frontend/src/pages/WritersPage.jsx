import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWriters } from '../context/WritersContext.jsx'
import { bookCountLabel } from '../lib/writers.js'

const buttonClass = 'rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60'

export default function WritersPage() {
  const { items, status, refresh, unfollow } = useWriters()
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const onUnfollow = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await unfollow(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <p role="status" className="p-4 text-gray-400">
        Loading your writers...
      </p>
    )
  }
  if (status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">
          Your writers could not be loaded. Please try again.
        </p>
        <button type="button" onClick={refresh} className={`mt-3 ${buttonClass}`}>
          Retry
        </button>
      </section>
    )
  }

  return (
    <section className="p-4" aria-labelledby="writers-title">
      <h1 id="writers-title" className="text-2xl font-semibold">
        My Writers
      </h1>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <div className="mt-2">
          <p className="text-gray-300">You are not following any writers yet. Open a book and follow its writer.</p>
          <Link to="/books" className="mt-4 inline-block underline">
            Browse books
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-[#1b1b1b] p-3">
              <div>
                <h2 className="text-base font-semibold">
                  <Link to={`/writers/${w.id}`} className="hover:underline">
                    {w.name}
                  </Link>
                </h2>
                <p className="text-sm text-gray-400">{bookCountLabel(w.bookCount)}</p>
              </div>
              <button
                type="button"
                disabled={busyId === w.id}
                onClick={() => onUnfollow(w.id)}
                className={buttonClass}
                aria-label={`Unfollow ${w.name}`}
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}