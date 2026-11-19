import { useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import BookGrid from '../components/BookGrid.jsx'
import CatalogueFilters from '../components/CatalogueFilters.jsx'
import Pagination from '../components/Pagination.jsx'
import SortDropdown from '../components/SortDropdown.jsx'
import { getBooks } from '../services/apiClient.js'

const FILTER_KEYS = ['category', 'q', 'language', 'format', 'author', 'publisher', 'minPrice', 'maxPrice']
const PAGE_SIZE = 12

/**
 * One reusable catalogue view for every genre (FR-027). All state lives in the URL, so filters persist
 * across pages (FR-033) and links are shareable. Filtering, sorting and paging run on the server (FR-032).
 */
export default function CataloguePage() {
  const { categories } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, error: '', fields: {}, data: null })

  const query = params.toString()
  const sort = params.get('sort') ?? 'relevance'
  const category = categories.find((c) => c.slug === params.get('category'))
  const hasFilters = FILTER_KEYS.some((k) => k !== 'category' && params.has(k))

  useEffect(() => {
    let active = true
    getBooks({ ...Object.fromEntries(new URLSearchParams(query)), pageSize: PAGE_SIZE })
      .then((data) => active && setState({ loading: false, error: '', fields: {}, data }))
      .catch((err) => {
        if (!active) return
        // 400: show the server's clear validation message instead of an error page (FR-034).
        const fields = err.fields ?? {}
        const message = err.status === 400 ? Object.values(fields).join(' ') || err.message : 'Books could not be loaded. Please try again.'
        setState({ loading: false, error: message, fields, data: null })
      })
    return () => {
      active = false
    }
  }, [query])

  function update(patch, { keepPage = false } = {}) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined || v === null) next.delete(k)
      else next.set(k, String(v))
    }
    if (!keepPage) next.delete('page')
    setParams(next)
  }

  function clearFilters() {
    const next = new URLSearchParams()
    if (params.get('category')) next.set('category', params.get('category'))
    setParams(next)
  }

  const title = category ? category.name : 'All books'
  const total = state.data?.total

  return (
    <section aria-labelledby="catalogue-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="catalogue-title" className="text-2xl font-semibold">
            {title}
          </h1>
          {total !== undefined && (
            <p role="status" className="text-sm text-gray-400">
              {total} {total === 1 ? 'book' : 'books'}
              {params.get('q') ? ` matching "${params.get('q')}"` : ''}
            </p>
          )}
        </div>
        <SortDropdown value={sort} onChange={(v) => update({ sort: v === 'relevance' ? '' : v })} />
      </div>

      <CatalogueFilters params={params} errors={state.fields} onChange={update} onClear={clearFilters} hasFilters={hasFilters} />

      {state.loading && !state.data && <p role="status" className="text-gray-400">Loading...</p>}
      {state.error && (
        <p role="alert" className="rounded border border-red-800 p-3 text-red-300">
          {state.error}
        </p>
      )}
      {state.data && (
        <>
          <BookGrid
            books={state.data.items}
            empty={category && !hasFilters ? `There are no books in ${category.name} yet.` : 'No books match your search or filters.'}
          />
          <Pagination page={state.data.page} totalPages={state.data.totalPages} onPage={(p) => update({ page: p === 1 ? '' : p }, { keepPage: true })} />
        </>
      )}
    </section>
  )
}
