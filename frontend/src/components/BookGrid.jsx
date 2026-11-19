import BookCard from './BookCard.jsx'

/** Grid of cards with a consistent layout. `empty` is shown when there are no books. */
export default function BookGrid({ books, empty = 'No books to show.' }) {
  if (!books || books.length === 0) {
    return (
      <p role="status" className="rounded border border-dashed border-gray-700 p-6 text-center text-gray-400">
        {empty}
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((b) => (
        <li key={b.id}>
          <BookCard book={b} />
        </li>
      ))}
    </ul>
  )
}
