import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useState } from 'react'

function SearchForm({ initial }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const [value, setValue] = useState(initial)

  function onSubmit(e) {
    e.preventDefault()
    // Keep the active filters when already browsing the catalogue; start fresh from other pages.
    const next = new URLSearchParams(pathname === '/books' ? params : undefined)
    next.delete('page')
    const q = value.trim()
    if (q) next.set('q', q)
    else next.delete('q')
    const s = next.toString()
    navigate(`/books${s ? `?${s}` : ''}`)
  }

  return (
    <form onSubmit={onSubmit} role="search" className="mb-4 flex gap-2">
      <label htmlFor="book-search" className="sr-only">
        Search books by title or author
      </label>
      <input
        id="book-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by title or author"
        maxLength={100}
        className="w-full rounded border border-gray-600 bg-[#121212] px-3 py-2 text-gray-100"
      />
      <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500">
        Search
      </button>
    </form>
  )
}

export default function SearchBar() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  // key resets the text box when the URL's search term changes (back/forward, clear filters).
  return <SearchForm key={q} initial={q} />
}
