export default function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null
  const btn = 'rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span aria-live="polite" className="text-sm text-gray-300">
        Page {page} of {totalPages}
      </span>
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  )
}
