import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
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

const item = (over = {}) => ({
  bookId: 1,
  title: 'The Silent Witness',
  coverUrl: '/covers/1.svg',
  format: 'Paperback',
  price: 100,
  authors: [{ id: 7, name: 'Meera Iyer' }],
  available: true,
  unavailableReason: null,
  ...over,
})

const listOf = (items) => ({ items, count: items.length, maxItems: 200 })

/** `state.list` is the server's wishlist; the stub mutates it like the real API. */
function stubApi({ signedIn = true, list = [], listStatus = 200, cartResult } = {}) {
  const state = { list: [...list], calls: [], listStatus }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const path = String(url).replace(/^\/api/, '')
      const [route] = path.split('?')
      const method = opts.method ?? 'GET'
      const body = opts.body ? JSON.parse(opts.body) : undefined
      state.calls.push(`${method} ${route}`)
      if (route === '/health') return json(200, { status: 'ok' })
      if (route === '/members/me') return signedIn ? json(200, { member }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
      if (route === '/cart') return json(200, { cart: emptyCart })
      if (route === '/wishlist' && method === 'GET') {
        return state.listStatus === 200 ? json(200, listOf(state.list)) : json(500, { error: { code: 'ERROR', message: 'Something went wrong' } })
      }
      if (route === '/wishlist/items' && method === 'POST') {
        if (body.bookId === 99) return json(404, { error: { code: 'NOT_FOUND', message: 'This book is not available' } })
        const added = item({ bookId: body.bookId })
        state.list = [added, ...state.list.filter((i) => i.bookId !== body.bookId)]
        return json(201, { item: added, count: state.list.length })
      }
      if (route.startsWith('/wishlist/items/') && method === 'DELETE') {
        const id = Number(route.split('/').pop())
        state.list = state.list.filter((i) => i.bookId !== id)
        return { ok: true, status: 204, json: async () => null }
      }
      if (route === '/wishlist/cart' && method === 'POST') {
        state.cartBody = body
        return json(200, cartResult ?? { added: [{ bookId: 1, title: 'The Silent Witness', quantity: 1 }], skipped: [], cart: emptyCart, message: null })
      }
      if (route === '/writers') return json(200, { items: [] })
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

describe('My Wishlist page', () => {
  it('asks a guest to sign in and requests nothing', async () => {
    const state = stubApi({ signedIn: false })
    renderAt('/wishlist')
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    expect(state.calls).not.toContain('GET /wishlist')
  })

  it('shows an empty state without fabricated books', async () => {
    stubApi({ list: [] })
    renderAt('/wishlist')
    expect(await screen.findByText(/Your wishlist is empty/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add all available/ })).not.toBeInTheDocument()
  })

  it('lists books with price, format and a writer link', async () => {
    stubApi({ list: [item()] })
    renderAt('/wishlist')
    expect(await screen.findByRole('heading', { name: 'The Silent Witness' })).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Meera Iyer' })).toHaveAttribute('href', '/writers/7')
  })

  it('shows an error with Retry, and recovers', async () => {
    const state = stubApi({ listStatus: 500 })
    const user = userEvent.setup()
    renderAt('/wishlist')
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    state.listStatus = 200
    state.list = [item()]
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'The Silent Witness' })).toBeInTheDocument()
  })

  it('removes a book', async () => {
    const state = stubApi({ list: [item()] })
    const user = userEvent.setup()
    renderAt('/wishlist')
    await user.click(await screen.findByRole('button', { name: 'Remove The Silent Witness from wishlist' }))
    expect(await screen.findByText(/Your wishlist is empty/)).toBeInTheDocument()
    expect(state.calls).toContain('DELETE /wishlist/items/1')
  })

  it('labels an out-of-stock book unavailable and offers no add-to-cart', async () => {
    stubApi({ list: [item({ available: false, unavailableReason: 'Out of stock' })] })
    renderAt('/wishlist')
    expect(await screen.findByText('Unavailable: Out of stock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to cart: The Silent Witness/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove The Silent Witness/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add all available/ })).toBeDisabled()
  })

  it('shows an inactive book with only title and cover, and lets it be removed', async () => {
    stubApi({
      list: [{ bookId: 5, title: 'Gone Book', coverUrl: '/covers/5.svg', available: false, unavailableReason: 'No longer available' }],
    })
    const user = userEvent.setup()
    renderAt('/wishlist')
    expect(await screen.findByText('Gone Book')).toBeInTheDocument()
    expect(screen.getByText('Unavailable: No longer available')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Gone Book' })).not.toBeInTheDocument()
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Gone Book from wishlist' }))
    expect(await screen.findByText(/Your wishlist is empty/)).toBeInTheDocument()
  })

  it('adds one book to the cart and keeps it on the wishlist', async () => {
    const state = stubApi({ list: [item()] })
    const user = userEvent.setup()
    renderAt('/wishlist')
    await user.click(await screen.findByRole('button', { name: 'Add to cart: The Silent Witness' }))
    expect(await screen.findByText('1 book added to your cart.')).toBeInTheDocument()
    expect(state.cartBody).toEqual({ bookIds: [1] })
    expect(screen.getByRole('heading', { name: 'The Silent Witness' })).toBeInTheDocument()
  })

  it('adds all available books and reports the skipped ones with reasons', async () => {
    const state = stubApi({
      list: [item(), item({ bookId: 2, title: 'Sold Out', available: false, unavailableReason: 'Out of stock' })],
      cartResult: {
        added: [{ bookId: 1, title: 'The Silent Witness', quantity: 1 }],
        skipped: [{ bookId: 2, title: 'Sold Out', reason: 'Out of stock' }],
        cart: emptyCart,
        message: 'Not added: Sold Out (Out of stock).',
      },
    })
    const user = userEvent.setup()
    renderAt('/wishlist')
    await user.click(await screen.findByRole('button', { name: /Add all available/ }))
    const note = await screen.findByText(/1 book added to your cart\./)
    expect(note).toHaveTextContent('Not added: Sold Out (Out of stock).')
    expect(state.cartBody).toEqual({})
  })

  it('shows an error next to the page when adding to the cart fails', async () => {
    stubApi({ list: [item()] })
    const user = userEvent.setup()
    renderAt('/wishlist')
    const button = await screen.findByRole('button', { name: 'Add to cart: The Silent Witness' })
    fetch.mockImplementationOnce(async () => json(500, { error: { code: 'ERROR', message: 'Something went wrong' } }))
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})

describe('wishlist button on books', () => {
  it('asks a guest to sign in instead of saving', async () => {
    const state = stubApi({ signedIn: false })
    const user = userEvent.setup()
    renderAt('/books/1')
    await user.click(await screen.findByRole('button', { name: 'Add to wishlist: The Silent Witness' }))
    expect(await screen.findByText('Sign in to keep a wishlist.')).toBeInTheDocument()
    expect(state.calls).not.toContain('POST /wishlist/items')
  })

  it('toggles a book on and off for a member, reflected by aria-pressed', async () => {
    const state = stubApi({})
    const user = userEvent.setup()
    renderAt('/books/1')
    const add = await screen.findByRole('button', { name: 'Add to wishlist: The Silent Witness' })
    expect(add).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(add).not.toBeDisabled())
    await user.click(add)
    const on = await screen.findByRole('button', { name: 'Remove from wishlist: The Silent Witness' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    expect(state.list.map((i) => i.bookId)).toEqual([1])
    await user.click(on)
    expect(await screen.findByRole('button', { name: 'Add to wishlist: The Silent Witness' })).toHaveAttribute('aria-pressed', 'false')
    expect(state.list).toEqual([])
  })

  it('shows the server message when a book cannot be added', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderAt('/')
    const card = (await screen.findAllByRole('heading', { name: 'The Silent Witness' }))[0].closest('article')
    fetch.mockImplementationOnce(async () => json(404, { error: { code: 'NOT_FOUND', message: 'This book is not available' } }))
    const btn = within(card).getByRole('button', { name: /wishlist/ })
    await waitFor(() => expect(btn).not.toBeDisabled())
    await user.click(btn)
    expect(await within(card).findByRole('alert')).toHaveTextContent('This book is not available')
  })
})