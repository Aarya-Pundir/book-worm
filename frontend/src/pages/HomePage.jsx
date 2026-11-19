import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BookGrid from '../components/BookGrid.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getFeatured, getRecommended } from '../services/apiClient.js'

function Section({ title, note, state, empty, viewAllTo }) {
  return (
    <section aria-labelledby={`h-${title.replace(/\s+/g, '-')}`} className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id={`h-${title.replace(/\s+/g, '-')}`} className="text-xl font-semibold">
            {title}
          </h2>
          {note && <p className="text-sm text-gray-400">{note}</p>}
        </div>
        {viewAllTo && (
          <Link to={viewAllTo} className="text-sm underline">
            View all
          </Link>
        )}
      </div>
      {state.loading && <p role="status" className="text-gray-400">Loading...</p>}
      {state.error && (
        <p role="alert" className="text-red-400">
          {title} could not be loaded.
        </p>
      )}
      {!state.loading && !state.error && <BookGrid books={state.items} empty={empty} />}
    </section>
  )
}

const initial = { loading: true, error: false, items: [], personalised: false }

export default function HomePage() {
  const { member, loading: authLoading } = useAuth()
  const [recommended, setRecommended] = useState(initial)
  const [bestsellers, setBestsellers] = useState(initial)
  const [launches, setLaunches] = useState(initial)

  useEffect(() => {
    let active = true
    const run = (fetcher, set) =>
      fetcher()
        .then((d) => active && set({ loading: false, error: false, items: d?.items ?? [], personalised: Boolean(d?.personalised) }))
        .catch(() => active && set({ loading: false, error: true, items: [], personalised: false }))
    run(() => getFeatured('bestsellers'), setBestsellers)
    run(() => getFeatured('new'), setLaunches)
    return () => {
      active = false
    }
  }, [])

  // Re-fetched when the signed-in member changes, so signing in or out updates the recommendations.
  const memberId = member?.id ?? null
  useEffect(() => {
    if (authLoading) return undefined
    let active = true
    getRecommended()
      .then((d) => active && setRecommended({ loading: false, error: false, items: d?.items ?? [], personalised: Boolean(d?.personalised) }))
      .catch(() => active && setRecommended({ loading: false, error: true, items: [], personalised: false }))
    return () => {
      active = false
    }
  }, [authLoading, memberId])

  return (
    <>
      <Section
        title="Recommended for You"
        note={recommended.personalised ? 'Based on your past orders' : 'Popular books right now'}
        state={recommended}
        empty="No recommendations yet."
      />
      <Section title="Bestsellers This Month" state={bestsellers} empty="No bestsellers yet." viewAllTo="/books?sort=popularity" />
      <Section title="New Launches" state={launches} empty="No new launches yet." viewAllTo="/books?sort=newest" />
    </>
  )
}
