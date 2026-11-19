import { useEffect, useState } from 'react'
import { getAuthors, getLanguages, getPublishers } from '../services/apiClient.js'

const FORMATS = ['Paperback', 'Hardcover', 'eBook']
const field = 'rounded border border-gray-600 bg-[#121212] px-2 py-2 text-sm'

function Select({ id, label, value, onChange, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-400">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} max-w-44`}>
        <option value="">Any</option>
        {children}
      </select>
    </div>
  )
}

function PriceRange({ min, max, error, onApply }) {
  const [lo, setLo] = useState(min)
  const [hi, setHi] = useState(max)
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(lo, hi)
      }}
    >
      <div>
        <label htmlFor="min-price" className="mb-1 block text-xs text-gray-400">
          Min price
        </label>
        <input id="min-price" type="number" min="0" value={lo} onChange={(e) => setLo(e.target.value)} className={`${field} w-24`} />
      </div>
      <div>
        <label htmlFor="max-price" className="mb-1 block text-xs text-gray-400">
          Max price
        </label>
        <input id="max-price" type="number" min="0" value={hi} onChange={(e) => setHi(e.target.value)} className={`${field} w-24`} />
      </div>
      <button type="submit" className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800">
        Apply price
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  )
}

/**
 * Language, format, author, publisher and price filters. Options come from the API.
 * `params` is the current URLSearchParams; `onChange(patch)` updates the URL (which drives the fetch).
 */
export default function CatalogueFilters({ params, errors = {}, onChange, onClear, hasFilters }) {
  const [options, setOptions] = useState({ languages: [], authors: [], publishers: [] })

  useEffect(() => {
    let active = true
    Promise.all([getLanguages(), getAuthors(), getPublishers()])
      .then(([l, a, p]) => active && setOptions({ languages: l?.items ?? [], authors: a?.items ?? [], publishers: p?.items ?? [] }))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const min = params.get('minPrice') ?? ''
  const max = params.get('maxPrice') ?? ''

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3" role="group" aria-label="Filters">
      <Select id="filter-language" label="Language" value={params.get('language') ?? ''} onChange={(v) => onChange({ language: v })}>
        {options.languages.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>
      <Select id="filter-format" label="Format" value={params.get('format') ?? ''} onChange={(v) => onChange({ format: v })}>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </Select>
      <Select id="filter-author" label="Author" value={params.get('author') ?? ''} onChange={(v) => onChange({ author: v })}>
        {options.authors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select id="filter-publisher" label="Publisher" value={params.get('publisher') ?? ''} onChange={(v) => onChange({ publisher: v })}>
        {options.publishers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <PriceRange
        key={`${min}-${max}`}
        min={min}
        max={max}
        error={errors.minPrice || errors.maxPrice}
        onApply={(lo, hi) => onChange({ minPrice: lo, maxPrice: hi })}
      />
      {hasFilters && (
        <button type="button" className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  )
}
