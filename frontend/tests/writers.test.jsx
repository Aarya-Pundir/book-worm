import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
const member = { id: '1', name: 'Asha Verma', email: 'a@example.com', mobile: '9000000001', role: 'MEMBER' }
const emptyCart = { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false }

const meera = { id: 7, name: 'Meera Iyer', bookCount: 2 }

const book = {
  id: 1,
  title: 'The Silent Witness',
  shortDescription: 'A puzzle.',
  coverUrl: '/covers/1.svg',
  price: 100,
  format: 'Paperback',
  language: 'English',
  inStock: true,
  publisher: { id: 3, name: 'Lantern Press' },
  authors: [{ id: 7, name: 'Meera Iyer' }],
  categories: [{ id: 2, name: 'Mystery', slug: 'mystery' }],
  estimatedDelivery: '2026-11-21',
}

/** `state.followed` is the server's list; the stub mutates it like the real API. */
function stubApi({ signedIn = true, followed = [], listStatus = 200, writerStatus = 200 } = {}) {
  const state = { followed: [...followed], calls: [], listStatus, writerStatus }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const path = String(url).replace(/^\/api/, '')
      const [route, query] = path.split('?')
      const method = opts.method ?? 'GET'
      state.calls.push(`${method} ${path}`)
      if (route === '/health') return json(200, { status: 'ok' })
      if (route === '/members/me') return signedIn ? json(200, { member }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
      if (route === '/cart') return json(200, { cart: emptyCart })
      if (route === '/wishlist') return json(200, { items: [], count: 0, maxItems: 200 })
      if (route === '/writers' && method === 'GET') {
        return state.listStatus === 200 ? json(200, { items: state.followed }) : json(500, { error: { code: 'ERROR', message: 'Something went wrong' } })
      }
      if (route === '/writers/7/follow' && method === 'POST') {
        if (!state.followed.some((w) => w.id === 7)) state.followed = [{ ...meera, followedAt: '2026-11-17T00:00:00Z' }, ...state.followed]
        return json(201, { author: { ...meera, following: true } })
      }
      if (route === '/writers/7/follow' && method === 'DELETE') {
        state.followed = state.followed.filter((w) => w.id !== 7)
        return { ok: true, status: 204, json: async () => null }
      }
      if (route === '/authors/7') {
        if (state.writerStatus === 404) return json(404, { error: { code: 'NOT_FOUND', message: 'Writer not found' } })
        if (state.writerStatus !== 200) return json(500, { error: { code: 'ERROR', message: 'Something went wrong' } })
        return json(200, { author: { ...meera, ...(signedIn ? { following: state.followed.some((w) => w.id === 7) } : {}) } })
      }
      if (route === '/authors/999') return json(404, { error: { code: 'NOT_FOUND', message: 'Writer not found' } })
      if (route === '/books' && query === 'author=7&pageSize=50') return json(200, { items: [book], page: 1, pageSize: 50, total: 1, totalPages: 1 })
      if (route === '/categories') return json(200, { items: [] })
      if (route === '/languages' || route === '/authors' || route === '/publishers') return json(200, { items: [] })
      if (route === '/books/featured') return json(200, { items: [book] })
      if (route === '/books/recommended') return json(200, { personalised: false, items: [] })
      if (route === '/books/1') return json(200, { book: { ...book, description: 'Full text.', publicationDate: '2020-01-01', related: [] } })
      throw new Error(`Unexpected request ${method} ${path}`)
    }),
  )
  return state
}

const renderAt = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('My Writers page', () => {
  it('asks a guest to sign in and requests nothing', async () => {
    const state = stubApi({ signedIn: false })
    renderAt('/writers')
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    expect(state.calls).not.toContain('GET /writers')
  })

  it('shows an empty state without fabricated writers', async () => {
    stubApi({})
    renderAt('/writers')
    expect(await screen.findByText(/not following any writers yet/)).toBeInTheDocument()
  })

  it('lists followed writers with their book count and a link to the writer page', async () => {
    stubApi({ followed: [{ ...meera, followedAt: 'x' }, { id: 8, name: 'Quiet Writer', bookCount: 0, followedAt: 'y' }] })
    renderAt('/writers')
    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toHaveAttribute('href', '/writers/7')
    expect(screen.getByText('2 books')).toBeInTheDocument()
    expect(screen.getByText('0 books')).toBeInTheDocument() // a writer with no active books is kept
  })

  it('shows an error with Retry, and recovers', async () => {
    const state = stubApi({ listStatus: 500 })
    const user = userEvent.setup()
    renderAt('/writers')
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    state.listStatus = 200
    state.followed = [{ ...meera, followedAt: 'x' }]
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toBeInTheDocument()
  })

  it('unfollows a writer', async () => {
    const state = stubApi({ followed: [{ ...meera, followedAt: 'x' }] })
    const user = userEvent.setup()
    renderAt('/writers')
    await user.click(await screen.findByRole('button', { name: 'Unfollow Meera Iyer' }))
    expect(await screen.findByText(/not following any writers yet/)).toBeInTheDocument()
    expect(state.calls).toContain('DELETE /writers/7/follow')
  })
})

describe('writer page', () => {
  it('is public: a guest sees the writer and their books, and is asked to sign in to follow', async () => {
    const state = stubApi({ signedIn: false })
    const user = userEvent.setup()
    renderAt('/writers/7')
    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'The Silent Witness' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Follow Meera Iyer' }))
    expect(await screen.findByText('Sign in to follow writers.')).toBeInTheDocument()
    expect(state.calls).not.toContain('POST /writers/7/follow')
  })

  it('lets a member follow and unfollow, reflected by aria-pressed', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderAt('/writers/7')
    const follow = await screen.findByRole('button', { name: 'Follow Meera Iyer' })
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(follow).not.toBeDisabled())
    await user.click(follow)
    const on = await screen.findByRole('button', { name: 'Unfollow Meera Iyer' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    await user.click(on)
    expect(await screen.findByRole('button', { name: 'Follow Meera Iyer' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says so when the writer does not exist', async () => {
    stubApi({})
    renderAt('/writers/999')
    expect(await screen.findByRole('heading', { name: 'Writer not found' })).toBeInTheDocument()
  })

  it('shows an error with Retry when the writer cannot be loaded', async () => {
    const state = stubApi({ writerStatus: 500 })
    const user = userEvent.setup()
    renderAt('/writers/7')
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    state.writerStatus = 200
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument()
  })
})

describe('writers on the book page', () => {
  it('keeps the author link to the filtered catalogue and adds a "View writer" link and Follow button', async () => {
    stubApi({})
    renderAt('/books/1')
    const authorLink = await screen.findByRole('link', { name: 'Meera Iyer' })
    expect(authorLink).toHaveAttribute('href', '/books?author=7')
    expect(screen.getByRole('link', { name: 'View writer' })).toHaveAttribute('href', '/writers/7')
    expect(screen.getByRole('button', { name: 'Follow Meera Iyer' })).toBeInTheDocument()
  })
})