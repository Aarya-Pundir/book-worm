import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

// Same names and order as the stored genres (the API returns 19; "All" is UI-only).
const GENRES = [
  'Romance', 'Mystery', 'Science Fiction', 'Fantasy', 'Historical', 'Biography', 'Self-help', 'Memoir', 'Travel',
  'Cooking', "Children's", 'Young Adult', 'Comics & Graphic Novels', 'Poetry', 'Drama', 'Science', 'Philosophy',
  'Religion', 'Language Learning',
]
const categories = GENRES.map((name, i) => ({
  id: i + 1,
  name,
  slug: name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  sortOrder: i + 1,
  bookCount: 5,
}))

const book = (over = {}) => ({
  id: 1,
  title: 'The Silent Witness',
  shortDescription: 'A tightly plotted puzzle.',
  coverUrl: '/covers/1.svg',
  price: 349,
  format: 'Paperback',
  language: 'English',
  inStock: true,
  publisher: { id: 3, name: 'Lantern Press' },
  authors: [{ id: 7, name: 'Meera Iyer' }],
  categories: [{ id: 2, name: 'Mystery', slug: 'mystery' }],
  estimatedDelivery: '2026-11-21',
  ...over,
})

/** Records every request URL; `books` decides the /books response. */
function stubApi({ books = () => json(200, { items: [book()], page: 1, pageSize: 12, total: 1, totalPages: 1 }), member = null, recommended, details } = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const path = String(url).replace(/^\/api/, '')
      calls.push(path)
      const [route] = path.split('?')
      if (route === '/health') return json(200, { status: 'ok' })
      if (route === '/cart') return json(200, { cart: { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false } })
      if (route === '/members/me') return member ? json(200, { member }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
      if (route === '/categories') return json(200, { items: categories })
      if (route === '/languages') return json(200, { items: ['English', 'Hindi'] })
      if (route === '/authors') return json(200, { items: [{ id: 7, name: 'Meera Iyer', bookCount: 3 }] })
      if (route === '/publishers') return json(200, { items: [{ id: 3, name: 'Lantern Press', bookCount: 4 }] })
      if (route === '/books/featured') return json(200, { items: [book({ id: path.includes('bestsellers') ? 10 : 20, title: path.includes('bestsellers') ? 'Bestseller One' : 'Launch One' })] })
      if (route === '/books/recommended') return recommended ? recommended() : json(200, { personalised: false, items: [book({ id: 30, title: 'Popular One' })] })
      if (/^\/books\/[^/]+$/.test(route)) return details ? details(route) : json(404, { error: { code: 'NOT_FOUND', message: 'Book not found' } })
      if (route === '/books') return books(path, opts)
      throw new Error(`Unexpected request ${path}`)
    }),
  )
  return calls
}

const renderAt = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('Sidebar', () => {
  it('lists All plus the genres from the API in order, with All selected by default', async () => {
    stubApi()
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Genres' })
    await within(nav).findByRole('link', { name: 'Romance' })
    const names = within(nav).getAllByRole('link').map((a) => a.textContent)
    expect(names).toEqual(['All', ...GENRES])
    expect(names).toHaveLength(20)
    expect(within(nav).getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  })

  it('selecting a genre highlights it, requests only that genre and does not reload the page', async () => {
    const calls = stubApi()
    const user = userEvent.setup()
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Genres' })
    await user.click(await within(nav).findByRole('link', { name: 'Fantasy' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Fantasy' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Fantasy' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'All' })).not.toHaveAttribute('aria-current')
    expect(calls.some((c) => c.startsWith('/books?') && c.includes('category=fantasy'))).toBe(true)
    await user.click(within(nav).getByRole('link', { name: 'All' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'All books' })).toBeInTheDocument()
  })

  it('shows an empty-state message for a genre with no books', async () => {
    stubApi({ books: () => json(200, { items: [], page: 1, pageSize: 12, total: 0, totalPages: 1 }) })
    renderAt('/books?category=poetry')
    expect(await screen.findByText('There are no books in Poetry yet.')).toBeInTheDocument()
  })
})

describe('Home page sections', () => {
  it('shows Recommended for You, Bestsellers This Month and New Launches with real data', async () => {
    stubApi()
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Recommended for You' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bestsellers This Month' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New Launches' })).toBeInTheDocument()
    expect(await screen.findByText('Popular One')).toBeInTheDocument()
    expect(await screen.findByText('Bestseller One')).toBeInTheDocument()
    expect(await screen.findByText('Launch One')).toBeInTheDocument()
  })

  it('does not call popular books personalised', async () => {
    stubApi()
    renderAt('/')
    expect(await screen.findByText('Popular books right now')).toBeInTheDocument()
    expect(screen.queryByText(/based on your past orders/i)).not.toBeInTheDocument()
  })

  it('says "Based on your past orders" only when the API reports personalised', async () => {
    stubApi({
      member: { id: '1', name: 'Asha', email: 'a@example.com', mobile: '9000000001', role: 'MEMBER' },
      recommended: () => json(200, { personalised: true, items: [book({ id: 31, title: 'For Asha' })] }),
    })
    renderAt('/')
    expect(await screen.findByText('Based on your past orders')).toBeInTheDocument()
    expect(await screen.findByText('For Asha')).toBeInTheDocument()
  })
})

describe('BookCard', () => {
  it('shows cover, title, author, description, format, price, genres and an estimated delivery', async () => {
    stubApi()
    renderAt('/books')
    const card = (await screen.findByText('The Silent Witness')).closest('article')
    const c = within(card)
    expect(c.getByRole('link', { name: 'Meera Iyer' })).toHaveAttribute('href', '/books?author=7')
    expect(c.getByText('A tightly plotted puzzle.')).toBeInTheDocument()
    expect(c.getByText('Paperback')).toBeInTheDocument()
    expect(c.getByText('₹349')).toBeInTheDocument()
    expect(c.getByRole('link', { name: 'Mystery' })).toHaveAttribute('href', '/books?category=mystery')
    expect(c.getByText(/Estimated delivery by/)).toBeInTheDocument()
    expect(card.querySelector('img')).toHaveAttribute('src', '/covers/1.svg')
  })

  it('falls back to the default cover when the image fails to load', async () => {
    stubApi()
    renderAt('/books')
    const img = (await screen.findByText('The Silent Witness')).closest('article').querySelector('img')
    fireEvent.error(img)
    await waitFor(() => expect(img).toHaveAttribute('src', '/covers/fallback.svg'))
  })

  it('marks unavailable books', async () => {
    stubApi({ books: () => json(200, { items: [book({ inStock: false })], page: 1, pageSize: 12, total: 1, totalPages: 1 }) })
    renderAt('/books')
    expect(await screen.findByText('Currently unavailable')).toBeInTheDocument()
  })
})

describe('Search, filters, sort and pagination', () => {
  it('sends every active criterion together to the server and keeps filters across pages', async () => {
    const calls = stubApi({
      books: () => json(200, { items: [book()], page: 1, pageSize: 12, total: 30, totalPages: 3 }),
    })
    const user = userEvent.setup()
    renderAt('/books?category=mystery')
    await screen.findByText('The Silent Witness')

    await user.selectOptions(screen.getByLabelText('Language'), 'English')
    await user.selectOptions(screen.getByLabelText('Format'), 'Hardcover')
    await user.type(screen.getByLabelText('Min price'), '100')
    await user.type(screen.getByLabelText('Max price'), '500')
    await user.click(screen.getByRole('button', { name: 'Apply price' }))
    await user.selectOptions(screen.getByLabelText('Sort by'), 'price_asc')
    await user.type(screen.getByRole('searchbox'), 'silent')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      const last = new URLSearchParams(calls.filter((c) => c.startsWith('/books?')).at(-1).split('?')[1])
      expect(Object.fromEntries(last)).toMatchObject({
        category: 'mystery', language: 'English', format: 'Hardcover', minPrice: '100', maxPrice: '500',
        sort: 'price_asc', q: 'silent', page: '2',
      })
    })
  })

  it('shows the server validation message for min price above max price', async () => {
    stubApi({
      books: (path) =>
        path.includes('minPrice=500')
          ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'bad', fields: { minPrice: 'Minimum price cannot be higher than maximum price' } } })
          : json(200, { items: [book()], page: 1, pageSize: 12, total: 1, totalPages: 1 }),
    })
    renderAt('/books?minPrice=500&maxPrice=100')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((a) => /cannot be higher than maximum price/.test(a.textContent))).toBe(true)
  })

  it('shows a clear message when nothing matches', async () => {
    stubApi({ books: () => json(200, { items: [], page: 1, pageSize: 12, total: 0, totalPages: 1 }) })
    renderAt('/books?q=zzzz')
    expect(await screen.findByText('No books match your search or filters.')).toBeInTheDocument()
  })

  it('offers author and publisher filters from stored data', async () => {
    const calls = stubApi()
    const user = userEvent.setup()
    renderAt('/books')
    await screen.findByText('The Silent Witness')
    await waitFor(() => expect(within(screen.getByLabelText('Author')).getByRole('option', { name: 'Meera Iyer' })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Author'), 'Meera Iyer')
    await user.selectOptions(screen.getByLabelText('Publisher'), 'Lantern Press')
    await waitFor(() => expect(calls.at(-1)).toMatch(/author=7.*publisher=3|publisher=3.*author=7/))
  })

  it('clears filters but keeps the selected genre', async () => {
    const calls = stubApi()
    const user = userEvent.setup()
    renderAt('/books?category=mystery&format=eBook')
    await screen.findByText('The Silent Witness')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(calls.filter((c) => c.startsWith('/books?')).at(-1)).toBe('/books?category=mystery&pageSize=12'))
  })
})

describe('Book details', () => {
  const detail = () =>
    json(200, {
      book: { ...book(), description: 'A long description.', publicationDate: '2019-05-04', related: [book({ id: 2, title: 'A Related Book' })] },
    })

  it('shows the full details and related books', async () => {
    stubApi({ details: detail })
    renderAt('/books/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'The Silent Witness' })).toBeInTheDocument()
    expect(screen.getByText('A long description.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lantern Press' })).toBeInTheDocument()
    expect(screen.getByText('In stock')).toBeInTheDocument()
    expect(screen.getByText(/estimate, not confirmed/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cover of The Silent Witness' })).toBeInTheDocument()
    expect(screen.getByText('A Related Book')).toBeInTheDocument()
  })

  it('shows a clear not-found message for an unknown book', async () => {
    stubApi()
    renderAt('/books/999999')
    expect(await screen.findByRole('heading', { name: 'Book not found' })).toBeInTheDocument()
    expect(screen.getByText(/could not find that book/i)).toBeInTheDocument()
  })
})
