import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
const member = { id: 1, name: 'Asha', email: 'a@example.com', mobile: '9876543210', role: 'MEMBER' }
const NUMBER = 'BW-20261116-AAAA1111'

const orderOf = (over = {}) => ({
  orderNumber: NUMBER,
  status: 'Confirmed',
  placedAt: '2026-11-16T10:00:00.000Z',
  confirmedAt: '2026-11-16T10:00:00.000Z',
  deliveredAt: null,
  cancelledAt: null,
  cancelReason: null,
  items: [{ bookId: 1, title: 'The Silent Witness', format: 'Paperback', quantity: 2, unitPrice: 100, lineTotal: 200 }],
  address: { recipient: 'Asha Rao', line1: '12 MG Road', line2: null, city: 'Pune', state: 'Maharashtra', pinCode: '411001' },
  subtotal: 200, shippingCharge: 40, couponCode: null, couponDiscount: 0, pointsRedeemed: 0, pointsDiscount: 0, total: 240,
  estimatedDelivery: '2026-11-21',
  confirmedDelivery: null,
  payment: { method: 'CARD', amount: 240, status: 'AUTHORIZED', statusLabel: 'Authorised', reference: 'MOCK-REF-1' },
  shipment: { status: 'Preparing', trackingRef: null, confirmedDate: null, events: [{ status: 'Preparing', at: '2026-11-16T10:00:00.000Z', by: 'System' }] },
  returnShipment: null,
  refunds: [],
  actions: { cancel: { allowed: true }, return: { allowed: false, reason: 'Only delivered orders can be returned.' }, buyAgain: { allowed: true } },
  ...over,
})

const summary = (number, status, placedAt, title) => ({ orderNumber: number, status, placedAt, total: 240, items: [{ bookId: 1, title, quantity: 1, coverUrl: null }] })

/** Routes by "METHOD /path". Anything not listed throws, so a missing stub is a visible failure. */
function stubApi(routes) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const key = `${opts.method ?? 'GET'} ${String(url).replace(/^\/api/, '')}`
      calls.push(key)
      if (key === 'GET /health') return json(200, { status: 'ok' })
      if (key === 'GET /members/me') return json(200, { member })
      if (key === 'GET /cart') return json(200, { cart: { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false } })
      const handler = routes[key]
      if (!handler) throw new Error(`Unexpected request ${key}`)
      return typeof handler === 'function' ? handler(opts) : handler
    }),
  )
  return calls
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('My Orders list', () => {
  it('lists the member orders in the order the server returns them (newest first)', async () => {
    stubApi({
      'GET /orders': json(200, {
        items: [summary('BW-NEW', 'Confirmed', '2026-11-16T10:00:00Z', 'Newer Book'), summary('BW-OLD', 'Delivered', '2026-11-01T10:00:00Z', 'Older Book')],
      }),
    })
    renderAt('/orders')
    const list = await screen.findByRole('list', { name: 'Your orders' })
    const links = Array.from(list.querySelectorAll('a')).map((a) => a.textContent)
    expect(links).toEqual(['BW-NEW', 'BW-OLD'])
    expect(screen.getByText('Newer Book')).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    stubApi({ 'GET /orders': json(200, { items: [] }) })
    renderAt('/orders')
    expect(await screen.findByText('You have not placed any orders yet.')).toBeInTheDocument()
  })

  it('shows a loading message and then an error with retry', async () => {
    let attempt = 0
    stubApi({
      'GET /orders': () => {
        attempt += 1
        return attempt === 1 ? json(500, { error: { code: 'INTERNAL', message: 'Something went wrong' } }) : json(200, { items: [] })
      },
    })
    const user = userEvent.setup()
    renderAt('/orders')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your orders could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('You have not placed any orders yet.')).toBeInTheDocument()
  })
})

describe('Order details', () => {
  it('labels the date as an estimate before dispatch', async () => {
    stubApi({ [`GET /orders/${NUMBER}`]: json(200, { order: orderOf() }) })
    renderAt(`/orders/${NUMBER}`)
    expect(await screen.findByText(/Estimated delivery by/)).toHaveTextContent('estimate, not confirmed')
    expect(screen.getByText('Preparing', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/12 MG Road/)).toBeInTheDocument()
  })

  it('shows a confirmed date and tracking reference after dispatch', async () => {
    const order = orderOf({
      status: 'Dispatched',
      estimatedDelivery: null,
      confirmedDelivery: '2026-11-22',
      shipment: { status: 'Dispatched', trackingRef: 'BWT123456', confirmedDate: '2026-11-22', events: [{ status: 'Preparing', at: '2026-11-16T10:00:00Z', by: 'System' }, { status: 'Dispatched', at: '2026-11-16T10:02:00Z', by: 'Admin' }] },
      actions: { cancel: { allowed: false, reason: 'This order has already been dispatched.' }, return: { allowed: false, reason: 'Only delivered orders can be returned.' }, buyAgain: { allowed: true } },
    })
    stubApi({ [`GET /orders/${NUMBER}`]: json(200, { order }) })
    renderAt(`/orders/${NUMBER}`)
    expect(await screen.findByText(/Delivery date:/)).toBeInTheDocument()
    expect(screen.queryByText(/Estimated delivery by/)).not.toBeInTheDocument()
    expect(screen.getByText('Tracking reference: BWT123456')).toBeInTheDocument()
    expect(screen.getByText('(set by an admin)')).toBeInTheDocument()
    expect(screen.getByText('Cancel: This order has already been dispatched.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('shows no shipment for an eBook-only order', async () => {
    const order = orderOf({
      status: 'Delivered',
      items: [{ bookId: 2, title: 'Digital Tales', format: 'eBook', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      shipment: null,
      estimatedDelivery: null,
      shippingCharge: 0,
      total: 100,
      actions: { cancel: { allowed: false, reason: 'This order is already delivered.' }, return: { allowed: false, reason: 'eBooks cannot be returned.' }, buyAgain: { allowed: true } },
    })
    stubApi({ [`GET /orders/${NUMBER}`]: json(200, { order }) })
    renderAt(`/orders/${NUMBER}`)
    expect(await screen.findByText(/There is no shipment/)).toBeInTheDocument()
    expect(screen.queryByText(/Shipment status/)).not.toBeInTheDocument()
  })

  it('shows a not-found message for an order that is not the member’s', async () => {
    stubApi({ [`GET /orders/${NUMBER}`]: json(404, { error: { code: 'NOT_FOUND', message: 'Order not found' } }) })
    renderAt(`/orders/${NUMBER}`)
    expect(await screen.findByText('This order could not be found.')).toBeInTheDocument()
  })

  it('shows the refund status next to the payment', async () => {
    const order = orderOf({
      status: 'Cancelled',
      cancelReason: 'Changed my mind',
      refunds: [{ reason: 'CANCELLATION', amount: 240, status: 'COMPLETED' }],
      actions: { cancel: { allowed: false, reason: 'This order is cancelled.' }, return: { allowed: false, reason: 'x' }, buyAgain: { allowed: true } },
    })
    stubApi({ [`GET /orders/${NUMBER}`]: json(200, { order }) })
    renderAt(`/orders/${NUMBER}`)
    expect(await screen.findByText(/Cancellation refund of .*240.* completed/)).toBeInTheDocument()
    expect(screen.getByText('Reason: Changed my mind')).toBeInTheDocument()
  })
})

describe('Order actions', () => {
  it('asks for confirmation, cancels and shows the result', async () => {
    const cancelled = orderOf({
      status: 'Cancelled',
      refunds: [{ reason: 'CANCELLATION', amount: 240, status: 'COMPLETED' }],
      actions: { cancel: { allowed: false, reason: 'This order is cancelled.' }, return: { allowed: false, reason: 'x' }, buyAgain: { allowed: true } },
    })
    let body
    const calls = stubApi({
      [`GET /orders/${NUMBER}`]: json(200, { order: orderOf() }),
      [`POST /orders/${NUMBER}/cancel`]: (opts) => {
        body = JSON.parse(opts.body)
        return json(200, { order: cancelled })
      },
    })
    const user = userEvent.setup()
    renderAt(`/orders/${NUMBER}`)
    await user.click(await screen.findByRole('button', { name: 'Cancel order' }))
    expect(calls).not.toContain(`POST /orders/${NUMBER}/cancel`) // nothing is sent until confirmed
    await user.type(screen.getByLabelText('Reason (optional)'), 'Found it cheaper')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel this order' }))
    expect(await screen.findByText('Your order was cancelled.')).toBeInTheDocument()
    expect(body).toEqual({ reason: 'Found it cheaper' })
    expect(screen.getByText(/Cancellation refund of/)).toBeInTheDocument()
  })

  it('shows the server reason when a cancel is declined', async () => {
    stubApi({
      [`GET /orders/${NUMBER}`]: json(200, { order: orderOf() }),
      [`POST /orders/${NUMBER}/cancel`]: json(409, { error: { code: 'CANCEL_NOT_ALLOWED', message: 'The 48-hour cancellation window has passed.' } }),
    })
    const user = userEvent.setup()
    renderAt(`/orders/${NUMBER}`)
    await user.click(await screen.findByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel this order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The 48-hour cancellation window has passed.')
  })

  it('requests a return for a delivered order', async () => {
    const delivered = orderOf({
      status: 'Delivered',
      shipment: { status: 'Delivered', trackingRef: 'BWT1', confirmedDate: '2026-11-20', events: [{ status: 'Delivered', at: '2026-11-20T10:00:00Z', by: 'System' }] },
      estimatedDelivery: null,
      confirmedDelivery: '2026-11-20',
      actions: { cancel: { allowed: false, reason: 'This order is already delivered.' }, return: { allowed: true }, buyAgain: { allowed: true } },
    })
    const returned = orderOf({
      ...delivered,
      status: 'Return Requested',
      returnShipment: { status: 'Requested', trackingRef: 'BWR999' },
      actions: { cancel: { allowed: false, reason: 'x' }, return: { allowed: false, reason: 'A return was already requested.' }, buyAgain: { allowed: true } },
    })
    stubApi({
      [`GET /orders/${NUMBER}`]: json(200, { order: delivered }),
      [`POST /orders/${NUMBER}/return`]: json(200, { order: returned }),
    })
    const user = userEvent.setup()
    renderAt(`/orders/${NUMBER}`)
    await user.click(await screen.findByRole('button', { name: 'Return books' }))
    await user.click(screen.getByRole('button', { name: 'Yes, return these books' }))
    expect(await screen.findByText('Your return was requested.')).toBeInTheDocument()
    expect(screen.getByText('Return tracking reference: BWR999')).toBeInTheDocument()
  })

  it('adds the books to the cart with Buy again and opens the cart', async () => {
    stubApi({
      [`GET /orders/${NUMBER}`]: json(200, { order: orderOf() }),
      [`POST /orders/${NUMBER}/buy-again`]: json(200, { added: ['The Silent Witness'], unavailable: [], notes: [], message: null, cart: {} }),
    })
    const user = userEvent.setup()
    renderAt(`/orders/${NUMBER}`)
    await user.click(await screen.findByRole('button', { name: 'Buy again' }))
    expect(await screen.findByRole('heading', { name: /cart/i })).toBeInTheDocument()
  })

  it('lists unavailable books and stays on the page when nothing can be added', async () => {
    stubApi({
      [`GET /orders/${NUMBER}`]: json(200, { order: orderOf() }),
      [`POST /orders/${NUMBER}/buy-again`]: json(200, { added: [], unavailable: ['The Silent Witness'], notes: [], message: 'Not available right now: The Silent Witness.', cart: {} }),
    })
    const user = userEvent.setup()
    renderAt(`/orders/${NUMBER}`)
    await user.click(await screen.findByRole('button', { name: 'Buy again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not available right now: The Silent Witness.')
    expect(screen.getByRole('heading', { name: `Order ${NUMBER}` })).toBeInTheDocument()
  })
})
