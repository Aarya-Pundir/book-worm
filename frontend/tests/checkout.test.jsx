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

const address = {
  id: 5, recipient: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', line2: null,
  city: 'Pune', state: 'Maharashtra', pinCode: '411001', isDefault: true,
}

const cartLine = { bookId: 1, title: 'The Silent Witness', coverUrl: '/covers/1.svg', format: 'Paperback', authors: ['Meera Iyer'], unitPrice: 100, previousPrice: null, priceChanged: false, quantity: 2, maxQuantity: 5, available: true, lineTotal: 200, warnings: [] }
const cart = { items: [cartLine], itemCount: 2, subtotal: 200, estimatedDelivery: '2026-11-21', hasWarnings: false }

const reviewOf = (over = {}) => ({
  items: [{ bookId: 1, title: 'The Silent Witness', coverUrl: '/covers/1.svg', format: 'Paperback', authors: [], unitPrice: 100, quantity: 2, lineTotal: 200, estimatedDelivery: '2026-11-21' }],
  notices: [], blockers: [], hasPhysical: true, address, delivery: { zone: 'Metro', deliveryDays: 2, estimatedDelivery: '2026-11-21', charge: 40 },
  subtotal: 200, shipping: 40, coupon: null,
  points: { balance: 100, maxRedeemable: 40, redeemed: 0, discount: 0, pointValue: 1 },
  total: 240,
  paymentMethods: [{ method: 'CARD', available: true }, { method: 'UPI', available: true }, { method: 'NET_BANKING', available: true }, { method: 'COD', available: true }],
  ...over,
})

const paid = (status = 'AUTHORIZED', method = 'CARD') => ({
  order: { orderNumber: 'BW-20261116-AAAA1111', status: 'Confirmed', total: 240, estimatedDelivery: '2026-11-21' },
  payment: { method, amount: 240, status, reference: 'MOCK-REF-1', createdAt: '2026-11-16T10:00:00Z' },
})

/** Records every call. Handlers can be overridden per test. */
function stubApi({ signedIn = true, addresses = [address], review = () => json(200, { review: reviewOf() }), payment = () => json(200, paid()), cartBody = cart } = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts = {}) => {
      const path = String(url).replace(/^\/api/, '')
      const method = opts.method ?? 'GET'
      const body = opts.body ? JSON.parse(opts.body) : undefined
      calls.push({ method, path, body, headers: opts.headers ?? {} })
      if (path === '/health') return json(200, { status: 'ok' })
      if (path === '/members/me') return signedIn ? json(200, { member }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
      if (path === '/cart') return json(200, { cart: cartBody })
      if (path === '/addresses' && method === 'GET') return json(200, { items: addresses })
      if (path === '/addresses' && method === 'POST') return json(201, { address: { ...address, id: 9, ...body } })
      if (path === '/checkout/review') return review(body)
      if (path === '/checkout/order') return json(201, { order: { orderNumber: 'BW-20261116-AAAA1111' }, notices: [] })
      if (path === '/payments') return payment(body)
      throw new Error(`Unexpected request ${path}`)
    }),
  )
  return calls
}

const renderCheckout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <App />
    </MemoryRouter>,
  )

const payCalls = (calls) => calls.filter((c) => c.path === '/payments')

describe('Checkout', () => {
  it('asks a guest to sign in and shows no checkout data', async () => {
    stubApi({ signedIn: false })
    renderCheckout()
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    expect(screen.queryByText('Review your order')).not.toBeInTheDocument()
  })

  it('shows the address, estimated delivery, shipping and total for review (FR-053..FR-060)', async () => {
    stubApi()
    renderCheckout()
    expect(await screen.findByText('Review your order')).toBeInTheDocument()
    expect(await screen.findByText(/Estimated delivery by 21 Nov 2026 \(estimate, not confirmed\)/)).toBeInTheDocument()
    expect(screen.getByText(/12 MG Road/)).toBeInTheDocument()
    expect(screen.getByText('₹40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay ₹240' })).toBeEnabled()
    // No card, UPI or bank fields are ever collected.
    expect(screen.queryByLabelText(/card number|cvv|expiry|upi id/i)).not.toBeInTheDocument()
  })

  it('pays once with an idempotency key, sends no card data, and shows the confirmation (SC-014)', async () => {
    const calls = stubApi()
    renderCheckout()
    await userEvent.click(await screen.findByRole('button', { name: 'Pay ₹240' }))
    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
    expect(screen.getByText('BW-20261116-AAAA1111')).toBeInTheDocument()
    expect(screen.getByText('MOCK-REF-1')).toBeInTheDocument()
    expect(screen.getByText(/21 Nov 2026 \(estimate, not confirmed\)/)).toBeInTheDocument()
    const [call] = payCalls(calls)
    expect(call.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{16,80}$/)
    expect(Object.keys(call.body).sort()).toEqual(['method', 'orderNumber'])
  })

  it('does not submit twice when the button is pressed twice (FR-074)', async () => {
    let release
    const calls = stubApi({ payment: () => new Promise((resolve) => (release = () => resolve(json(200, paid())))) })
    renderCheckout()
    const button = await screen.findByRole('button', { name: 'Pay ₹240' })
    await userEvent.dblClick(button)
    expect(payCalls(calls)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
    release()
    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
  })

  it('keeps the order unconfirmed on a decline and lets the member retry with a new key (FR-075)', async () => {
    let n = 0
    const calls = stubApi({
      payment: () => (++n === 1 ? json(402, { error: { code: 'PAYMENT_FAILED', message: 'The payment was declined. You have not been charged.' } }) : json(200, paid())),
    })
    renderCheckout()
    await userEvent.click(await screen.findByRole('button', { name: 'Pay ₹240' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The payment was declined. You have not been charged.')
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹240' }))
    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
    const [first, second] = payCalls(calls)
    expect(second.headers['Idempotency-Key']).not.toBe(first.headers['Idempotency-Key'])
  })

  it('reuses the same key after a network failure so a retry cannot charge twice (SC-015)', async () => {
    let n = 0
    const calls = stubApi({
      payment: () => {
        if (++n === 1) throw new TypeError('network down')
        return json(200, paid())
      },
    })
    renderCheckout()
    await userEvent.click(await screen.findByRole('button', { name: 'Pay ₹240' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹240' }))
    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
    const [first, second] = payCalls(calls)
    expect(second.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
  })

  it('requires the Cash on Delivery terms before the order can be placed (FR-072a)', async () => {
    const calls = stubApi({ payment: () => json(200, paid('PAY_ON_DELIVERY_PENDING', 'COD')) })
    renderCheckout()
    await userEvent.click(await screen.findByRole('radio', { name: 'Cash on Delivery' }))
    const place = screen.getByRole('button', { name: 'Place order' })
    expect(place).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Cash on Delivery terms/ }))
    await userEvent.click(place)
    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
    expect(screen.getByText(/Pay on Delivery - Pending/)).toBeInTheDocument()
    expect(payCalls(calls)[0].body).toMatchObject({ method: 'COD', acceptCodTerms: true })
  })

  it('disables Cash on Delivery with the reason when it is not available', async () => {
    stubApi({
      review: () =>
        json(200, { review: reviewOf({ paymentMethods: [{ method: 'CARD', available: true }, { method: 'UPI', available: true }, { method: 'NET_BANKING', available: true }, { method: 'COD', available: false, reason: 'Cash on Delivery is only for orders of physical books.' }] }) }),
    })
    renderCheckout()
    expect(await screen.findByRole('radio', { name: /Cash on Delivery/ })).toBeDisabled()
    expect(screen.getByText(/only for orders of physical books/)).toBeInTheDocument()
  })

  it('shows a clear message for a rejected coupon and recalculates (FR-079)', async () => {
    stubApi({
      review: (body) =>
        json(200, { review: reviewOf(body.couponCode ? { coupon: { code: 'OLD', applied: false, discount: 0, message: 'This coupon has expired.' } } : {}) }),
    })
    renderCheckout()
    await userEvent.type(await screen.findByLabelText('Coupon code'), 'old')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('This coupon has expired.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay ₹240' })).toBeEnabled()
  })

  it('shows gift point redemption in the total (FR-078)', async () => {
    stubApi({
      review: (body) =>
        json(200, { review: reviewOf(body.redeemPoints ? { points: { balance: 100, maxRedeemable: 40, redeemed: 30, discount: 30, pointValue: 1 }, total: 210 } : {}) }),
    })
    renderCheckout()
    await userEvent.type(await screen.findByLabelText('Gift points to use'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(await screen.findByText('Gift points (30)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay ₹210' })).toBeInTheDocument()
  })

  it('blocks payment and explains when the PIN code cannot be served', async () => {
    stubApi({
      review: () =>
        json(200, { review: reviewOf({ delivery: null, shipping: 0, blockers: [{ code: 'UNSERVICEABLE_PIN', message: 'Delivery is not available to this PIN code. Please choose another address.' }] }) }),
    })
    renderCheckout()
    expect(await screen.findByText(/Delivery is not available to this PIN code/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pay/ })).toBeDisabled()
  })

  it('validates a new address in the form before saving it (FR-053)', async () => {
    const calls = stubApi({ addresses: [] })
    renderCheckout()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a new address' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('Recipient name is required')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('PIN code'), '012345')
    await userEvent.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('PIN code must be 6 digits and cannot start with 0')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/addresses' && c.method === 'POST')).toBe(false)
  })

  it('needs no address or shipping for an eBook-only order (FR-056)', async () => {
    stubApi({
      addresses: [],
      review: () =>
        json(200, {
          review: reviewOf({
            hasPhysical: false, address: null, delivery: null, shipping: 0, subtotal: 80, total: 80,
            items: [{ bookId: 2, title: 'Digital Tales', coverUrl: null, format: 'eBook', authors: [], unitPrice: 80, quantity: 1, lineTotal: 80, estimatedDelivery: null }],
            paymentMethods: [{ method: 'CARD', available: true }, { method: 'UPI', available: true }, { method: 'NET_BANKING', available: true }, { method: 'COD', available: false, reason: 'Cash on Delivery is only for orders of physical books.' }],
          }),
        }),
      cartBody: { ...cart, items: [{ ...cartLine, bookId: 2, format: 'eBook', title: 'Digital Tales' }] },
    })
    renderCheckout()
    expect(await screen.findByText(/only eBooks/)).toBeInTheDocument()
    expect(screen.queryByText('Delivery address')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Pay ₹80' })).toBeEnabled()
  })
})
