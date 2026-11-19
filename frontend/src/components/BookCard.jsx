import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FALLBACK_COVER, formatDate, formatPrice } from '../lib/format.js'
import AddToCart from './AddToCart.jsx'
import WishlistButton from './WishlistButton.jsx'

export default function BookCard({ book }) {
  const [broken, setBroken] = useState(false)

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1b1b1b]">
      <Link to={`/books/${book.id}`} className="block bg-[#262626]" tabIndex={-1} aria-hidden="true">
        <img
          src={broken || !book.coverUrl ? FALLBACK_COVER : book.coverUrl}
          alt=""
          width="300"
          height="450"
          loading="lazy"
          className="aspect-[2/3] w-full object-cover"
          onError={() => setBroken(true)}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="text-base font-semibold leading-snug">
          <Link to={`/books/${book.id}`} className="hover:underline">
            {book.title}
          </Link>
        </h3>
        <p className="text-sm text-gray-300">
          by{' '}
          {book.authors.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <Link to={`/books?author=${a.id}`} className="underline decoration-gray-600 hover:decoration-gray-300">
                {a.name}
              </Link>
            </span>
          ))}
        </p>
        <p className="text-sm text-gray-400">{book.shortDescription}</p>
        <ul className="flex flex-wrap gap-1" aria-label="Genres">
          {book.categories.map((c) => (
            <li key={c.id}>
              <Link
                to={`/books?category=${c.slug}`}
                className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-800"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-semibold">{formatPrice(book.price)}</span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs">{book.format}</span>
        </div>
        {!book.inStock && <p className="text-xs text-amber-300">Currently unavailable</p>}
        {book.estimatedDelivery && (
          <p className="text-xs text-gray-400">Estimated delivery by {formatDate(book.estimatedDelivery)}</p>
        )}
        <AddToCart book={book} />
        <WishlistButton book={book} />
      </div>
    </article>
  )
}
