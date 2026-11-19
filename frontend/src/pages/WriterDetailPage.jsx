import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BookGrid from '../components/BookGrid.jsx'
import FollowButton from '../components/FollowButton.jsx'
import { bookCountLabel } from '../lib/writers.js'
import { getBooks, getWriter } from '../services/apiClient.js'

/** Public writer page: name, follow toggle and the writer's active books (FR-089). */
export default function WriterDetailPage() {
  const { authorId } = useParams()
  const [state, setState] = useState({ status: 'loading', author: null, books: [] })

  const load = useCallback(async () => {
    setState({ status: 'loading', author: null, books: [] })
    try {
      const { author } = await getWriter(authorId)
      const { items } = await getBooks({ author: author.id, pageSize: 50 })
      setState({ status: 'ready', author, books: items })
    } catch (err) {
      setState({ status: err.status === 404 ? 'notfound' : 'error', author: null, books: [] })
    }
  }, [authorId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (state.status === 'loading') return <p role="status" className="p-4 text-gray-400">Loading...</p>

  if (state.status === 'notfound') {
    return (
      <section className="p-4">
        <h1 className="text-2xl font-semibold">Writer not found</h1>
        <p role="alert" className="mt-2 text-gray-300">We could not find that writer.</p>
        <Link to="/books" className="mt-4 inline-block underline">
          Browse all books
        </Link>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="p-4">
        <p role="alert" className="text-red-400">This writer could not be loaded. Please try again.</p>
        <button type="button" onClick={load} className="mt-3 rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800">
          Retry
        </button>
      </section>
    )
  }

  const { author, books } = state
  return (
    <section className="p-4" aria-labelledby="writer-title">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="writer-title" className="text-2xl font-semibold">
          {author.name}
        </h1>
        <FollowButton author={author} />
      </div>
      <p className="mt-1 text-sm text-gray-400">{bookCountLabel(author.bookCount)}</p>
      <div className="mt-4">
        <BookGrid books={books} empty="This writer has no books available right now." />
      </div>
    </section>
  )
}