import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AddToCart from '../components/AddToCart.jsx'
import BookGrid from '../components/BookGrid.jsx'
import FollowButton from '../components/FollowButton.jsx'
import WishlistButton from '../components/WishlistButton.jsx'
import { FALLBACK_COVER, formatDate, formatPrice } from '../lib/format.js'
import { getBook } from '../services/apiClient.js'

function Cover({ src, title }) {
  const [broken, setBroken] = useState(false)
  return (
    <img
      src={broken || !src ? FALLBACK_COVER : src}
      alt={`Cover of ${title}`}
      width="300"
      height="450"
      className="aspect-[2/3] w-full max-w-xs rounded border border-gray-800 object-cover"
      onError={() => setBroken(true)}
    />
  )
}

export default function BookDetailsPage() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, notFound: false, error: false, book: null })

  useEffect(() => {
    let active = true
    getBook(id)
      .then((d) => active && setState({ loading: false, notFound: false, error: false, book: d.book }))
      .catch((err) => {
        if (!active) return
        if (err.status === 404) setState({ loading: false, notFound: true, error: false, book: null })
        else setState({ loading: false, notFound: false, error: true, book: null })
      })
    return () => {
      active = false
    }
  }, [id])

  if (state.loading) return <p role="status" className="text-gray-400">Loading...</p>

  if (state.notFound) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Book not found</h1>
        <p role="alert" className="mt-2 text-gray-300">
          We could not find that book. It may have been removed.
        </p>
        <Link to="/books" className="mt-4 inline-block underline">
          Browse all books
        </Link>
      </section>
    )
  }

  if (state.error) {
    return (
      <p role="alert" className="text-red-400">
        This book could not be loaded. Please try again.
      </p>
    )
  }

  const b = state.book
  return (
    <article>
      <Link to="/books" className="text-sm underline">
        &larr; Back to books
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Cover src={b.coverUrl} title={b.title} />
        <div>
          <h1 className="text-3xl font-semibold">{b.title}</h1>
          <p className="mt-1 text-gray-300">
            by{' '}
            {b.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/books?author=${a.id}`} className="underline">
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
          <ul aria-label="Writers" className="mt-2 flex flex-col gap-1 text-sm">
            {b.authors.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span>{a.name}</span>
                <Link to={`/writers/${a.id}`} className="underline">
                  View writer
                </Link>
                <FollowButton author={a} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-2xl font-semibold">{formatPrice(b.price)}</p>
          <p className={`mt-1 text-sm ${b.inStock ? 'text-green-400' : 'text-amber-300'}`}>
            {b.inStock ? 'In stock' : 'Currently unavailable'}
          </p>
          {b.estimatedDelivery ? (
            <p className="text-sm text-gray-400">Estimated delivery by {formatDate(b.estimatedDelivery)} (estimate, not confirmed)</p>
          ) : (
            <p className="text-sm text-gray-400">Digital book: no shipping needed</p>
          )}
          <div className="mt-3 flex max-w-xs flex-col gap-2">
            <AddToCart book={b} />
            <WishlistButton book={b} />
          </div>

          <dl className="mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-400">Publisher</dt>
            <dd>
              {b.publisher ? (
                <Link to={`/books?publisher=${b.publisher.id}`} className="underline">
                  {b.publisher.name}
                </Link>
              ) : (
                'Not available'
              )}
            </dd>
            <dt className="text-gray-400">Genres</dt>
            <dd className="flex flex-wrap gap-1">
              {b.categories.map((c) => (
                <Link key={c.id} to={`/books?category=${c.slug}`} className="rounded-full border border-gray-700 px-2 py-0.5 text-xs hover:bg-gray-800">
                  {c.name}
                </Link>
              ))}
            </dd>
            <dt className="text-gray-400">Language</dt>
            <dd>{b.language}</dd>
            <dt className="text-gray-400">Format</dt>
            <dd>{b.format}</dd>
            <dt className="text-gray-400">Published</dt>
            <dd>{formatDate(b.publicationDate)}</dd>
          </dl>

          <h2 className="mt-6 text-lg font-semibold">About this book</h2>
          <p className="mt-1 text-gray-300">{b.description}</p>
        </div>
      </div>

      {b.related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-10">
          <h2 id="related-title" className="mb-3 text-xl font-semibold">
            Related books
          </h2>
          <BookGrid books={b.related} />
        </section>
      )}
    </article>
  )
}
