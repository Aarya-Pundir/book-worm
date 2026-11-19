import { Link, useLocation, useSearchParams } from 'react-router-dom'

const base = 'block whitespace-nowrap rounded px-3 py-2 text-sm hover:bg-gray-800'
const active = 'bg-indigo-600 text-white hover:bg-indigo-600'

/**
 * Genre sidebar. "All" is a UI-only option; the genres come from the API (FR-021, FR-022).
 * "All" is highlighted on the home page and on the catalogue when no genre is selected (FR-023).
 */
export default function Sidebar({ categories, error }) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const selected = params.get('category')
  const onCatalogue = pathname === '/' || pathname === '/books'

  return (
    <nav aria-label="Genres" className="md:w-56 md:shrink-0">
      <h2 className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-gray-400 md:block">Genres</h2>
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        <li>
          <Link
            to="/books"
            className={`${base} ${onCatalogue && !selected ? active : ''}`}
            aria-current={onCatalogue && !selected ? 'page' : undefined}
          >
            All
          </Link>
        </li>
        {categories.map((c) => {
          const isActive = pathname === '/books' && selected === c.slug
          return (
            <li key={c.id}>
              <Link
                to={`/books?category=${c.slug}`}
                className={`${base} ${isActive ? active : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {c.name}
              </Link>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 px-3 text-sm text-red-400">
          Genres could not be loaded.
        </p>
      )}
    </nav>
  )
}
