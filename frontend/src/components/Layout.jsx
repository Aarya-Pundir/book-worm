import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { getCategories } from '../services/apiClient.js'
import Sidebar from './Sidebar.jsx'
import SearchBar from './SearchBar.jsx'

/** Shared catalogue shell: genre sidebar on the left, search bar and page content on the right. */
export default function Layout() {
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getCategories()
      .then((d) => active && setCategories(d?.items ?? []))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row">
      <Sidebar categories={categories} error={error} />
      <div className="min-w-0 flex-1">
        <SearchBar />
        <Outlet context={{ categories }} />
      </div>
    </div>
  )
}
