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

const line = (over = {}) => ({
  bookId: 1,
  title: 'The Silent Witness',
  coverUrl: '/covers/1.svg',
  format: 'Paperback',
  authors: ['Meera Iyer'],
  unitPrice: 100,
  previousPrice: null,
  priceChanged: false,
  quantity: 2,
  maxQuantity: 5,
  available: true,
  lineTotal: 200,
  warnings: [],
  ...over,
})

const cartOf = (items, over = {}) => ({
  items,
  itemCount: items.reduce((n, i) => n + i.quantity, 0),
  subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
  estimatedDelivery: items.length ? '2026-11-21' : null,
  hasWarnings: items.some((i) => i.warnings.length > 0),
  ...over,
})

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

/** `cartHandler(method, path, body)` answers every /cart request. */
function stubApi({ cartHandler, member = null, bookOverride = {} } = {}) {
  const cartCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const path = String(url).replace(/^\/api/, '')
      const [route] = path.split('?')
      const method = opts.method ?? 'GET'
      if (route === '/health') return json(200, { status: 'ok' })
      if (route === '/members/me') return member ? json(200, { member }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
      if (route.startsWith('/cart')) {
        const body = opts.body ? JSON.parse(opts.body) : undefined
        cartCalls.push({ method, path, body })
        return cartHandler(method, path, body)
      }
      if (route === '/categories') return json(200, { items: [] })
      if (route === '/languages' || route === '/authors' || route === '/publishers') return json(200, { items: [] })
      if (route === '/books/featured') return json(200, { items: [book] })
      if (route === '/books/recommended') return json(200, { personalised: false, items: [] })
      if (route === '/books/1') return json(200, { book: { ...book, ...bookOverride, description: 'Full text.', publicationDate: '2020-01-01', related: [] } })
      throw new Error(`Unexpected request ${path}`)
    }),
  )
  return cartCalls
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('Cart page', () => {
  it('shows an empty state with a link back to the books', async () => {
    stubApi({ cartHandler: () => json(200, { cart: cartOf([]) }) })
    renderAt('/cart')
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse books' })).toHaveAttribute('href', '/books')
  })

  it('shows a loading state, then an error with a working retry', async () => {
    let calls = 0
    stubApi({
      cartHandler: () => {
        calls += 1
        return calls === 1 ? json(500, { error: { code: 'ERROR', message: 'boom' } }) : json(200, { cart: cartOf([line()]) })
      },
    })
    renderAt('/cart')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your cart could not be loaded')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('The Silent Witness')).toBeInTheDocument()
  })

  it('lists items with prices, a running total and a labelled delivery estimate', async () => {
    stubApi({ cartHandler: () => json(200, { cart: cartOf([line(), line({ bookId: 2, title: 'Second Book', quantity: 1, lineTotal: 100 })]) }) })
    renderAt('/cart')
    expect(await screen.findByText('The Silent Witness')).toBeInTheDocument()
    expect(screen.getByText('Second Book')).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(summary).toHaveTextContent('₹300')
    expect(summary).toHaveTextContent('(estimate, not confirmed)')
    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toHaveTextContent('Cart (3)')
  })

  it('changes a quantity and removes an item using the server response', async () => {
    const state = { items: [line()] }
    const calls = stubApi({
      cartHandler: (method, _path, body) => {
        if (method === 'PATCH') state.items = [line({ quantity: body.quantity, lineTotal: 100 * body.quantity })]
        if (method === 'DELETE') state.items = []
        return json(200, { cart: cartOf(state.items) })
      },
    })
    renderAt('/cart')
    const qty = await screen.findByLabelText('Quantity')
    await userEvent.clear(qty)
    await userEvent.type(qty, '4')
    await userEvent.tab()

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.body.quantity === 4)).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove The Silent Witness from cart' }))
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/cart/items/1')).toBe(true)
  })

  it('warns about price and availability changes and blocks checkout for unavailable items (FR-049)', async () => {
    stubApi({
      cartHandler: () =>
        json(200, {
          cart: cartOf([
            line({ unitPrice: 120, previousPrice: 100, priceChanged: true, warnings: ['The price changed from ₹100.00 to ₹120.00 since you added this book.'] }),
            line({ bookId: 2, title: 'Gone Book', available: false, quantity: 0, lineTotal: 0, warnings: ['This book is no longer available. Remove it to continue.'] }),
          ]),
        }),
      member: { id: 1, name: 'Asha', email: 'a@example.com', mobile: '9876543210', role: 'MEMBER' },
    })
    renderAt('/cart')
    expect(await screen.findByText(/The price changed from/)).toBeInTheDocument()
    expect(screen.getByText(/no longer available/)).toBeInTheDocument()
    expect(screen.getByText('Remove unavailable items to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Checkout/ })).toBeDisabled()
  })

  it('asks a guest to sign in to check out and keeps the cart', async () => {
    stubApi({ cartHandler: () => json(200, { cart: cartOf([line()]) }) })
    renderAt('/cart')
    await userEvent.click(await screen.findByRole('link', { name: 'Sign in to check out' }))
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Add to cart', () => {
  it('adds from the book details page with a chosen quantity and updates the header count', async () => {
    let cart = cartOf([])
    const calls = stubApi({
      cartHandler: (method, _path, body) => {
        if (method === 'POST') cart = cartOf([line({ quantity: body.quantity, lineTotal: 100 * body.quantity })])
        return json(200, { cart })
      },
    })
    renderAt('/books/1')
    const qty = await screen.findByLabelText('Quantity for The Silent Witness')
    await userEvent.clear(qty)
    await userEvent.type(qty, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart: The Silent Witness' }))
    expect(await screen.findByText('Added to your cart.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST').body).toEqual({ bookId: 1, quantity: 3 })
    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument()
  })

  it('shows the server message when the quantity was limited by stock (FR-050)', async () => {
    stubApi({
      cartHandler: (method) =>
        method === 'POST'
          ? json(200, { cart: cartOf([line({ quantity: 5, lineTotal: 500 })]), message: 'Only 5 copies are available, so the quantity was limited to 5.' })
          : json(200, { cart: cartOf([]) }),
    })
    renderAt('/books/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart: The Silent Witness' }))
    expect(await screen.findByText(/Only 5 copies are available/)).toBeInTheDocument()
  })

  it('shows an error next to the button when adding fails', async () => {
    stubApi({
      cartHandler: (method) =>
        method === 'POST'
          ? json(409, { error: { code: 'OUT_OF_STOCK', message: 'This book is out of stock' } })
          : json(200, { cart: cartOf([]) }),
    })
    renderAt('/books/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart: The Silent Witness' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This book is out of stock')
  })

  it('offers no add button for a book that is out of stock', async () => {
    stubApi({ cartHandler: () => json(200, { cart: cartOf([]) }), bookOverride: { inStock: false } })
    renderAt('/books/1')
    expect(await screen.findByText('Currently unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to cart/ })).not.toBeInTheDocument()
  })
})