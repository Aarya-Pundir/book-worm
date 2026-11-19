import { SORT_OPTIONS } from '../lib/sortOptions.js'

export default function SortDropdown({ value, onChange }) {
  return (
    <div>
      <label htmlFor="sort-by" className="mb-1 block text-xs text-gray-400">
        Sort by
      </label>
      <select
        id="sort-by"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-600 bg-[#121212] px-2 py-2 text-sm"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
