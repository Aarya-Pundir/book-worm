import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWriters } from '../context/WritersContext.jsx'

/** Follow / unfollow toggle for a writer. A guest is asked to sign in (FR-087). */
export default function FollowButton({ author }) {
  const { member, openLogin } = useAuth()
  const { ids, follow, unfollow, status } = useWriters()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState(false)

  const following = ids.has(author.id)

  const toggle = async () => {
    setError('')
    if (!member) {
      setPrompt(true)
      openLogin()
      return
    }
    setBusy(true)
    try {
      await (following ? unfollow(author.id) : follow(author.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || (member && status === 'loading')}
        aria-pressed={following}
        aria-label={`${following ? 'Unfollow' : 'Follow'} ${author.name}`}
        className="rounded border border-gray-600 px-2 py-0.5 text-xs hover:bg-gray-800 disabled:opacity-60"
      >
        {following ? 'Unfollow' : 'Follow'}
      </button>
      {prompt && !member && (
        <span role="status" className="text-xs text-gray-300">
          Sign in to follow writers.
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </span>
  )
}