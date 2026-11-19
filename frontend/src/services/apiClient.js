// Single place for backend calls. The Vite dev server proxies /api to the backend,
// so the httpOnly session cookie is same-origin and never readable from JavaScript.
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields ?? {}
  }
}

export async function getHealth() {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error('Backend unavailable')
  return res.json()
}

async function request(path, { method = 'GET', body, headers } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body || headers ? { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Please try again.')
  }
  if (res.status === 204) return null
  let data = null
  try {
    data = await res.json()
  } catch {
    // Non-JSON response: fall through to the generic error below.
  }
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong', e?.fields)
  }
  return data
}

export const registerMember = (payload) => request('/members/register', { method: 'POST', body: payload })
export const loginMember = (payload) => request('/members/login', { method: 'POST', body: payload })
export const logoutMember = () => request('/members/logout', { method: 'POST' })
export const getMe = () => request('/members/me')

// Catalogue (public). Empty values are dropped so URLs stay clean.
function qs(params = {}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const getCategories = () => request('/categories')
export const getAuthors = () => request('/authors')
export const getPublishers = () => request('/publishers')
export const getLanguages = () => request('/languages')
export const getBooks = (params) => request(`/books${qs(params)}`)
export const getBook = (id) => request(`/books/${encodeURIComponent(id)}`)
export const getFeatured = (type, limit = 6) => request(`/books/featured${qs({ type, limit })}`)
export const getRecommended = (limit = 6) => request(`/books/recommended${qs({ limit })}`)

// Cart (guests and members). The server owns prices and availability; only ids and quantities are sent.
export const getCart = () => request('/cart')
export const addCartItem = (bookId, quantity) => request('/cart/items', { method: 'POST', body: { bookId, quantity } })
export const updateCartItem = (bookId, quantity) =>
  request(`/cart/items/${encodeURIComponent(bookId)}`, { method: 'PATCH', body: { quantity } })
export const removeCartItem = (bookId) =>
  request(`/cart/items/${encodeURIComponent(bookId)}`, { method: 'DELETE' })

// Addresses, checkout and payment (signed-in members). The server computes every price; only choices are sent.
export const listAddresses = () => request('/addresses')
export const createAddress = (payload) => request('/addresses', { method: 'POST', body: payload })
export const updateAddress = (id, payload) => request(`/addresses/${encodeURIComponent(id)}`, { method: 'PUT', body: payload })
export const deleteAddress = (id) => request(`/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const reviewCheckout = (payload) => request('/checkout/review', { method: 'POST', body: payload })
export const placeOrder = (payload) => request('/checkout/order', { method: 'POST', body: payload })
export const getOrder = (orderNumber) => request(`/orders/${encodeURIComponent(orderNumber)}`)
// Never pass card, UPI or bank details: the server refuses them. The key makes a repeated submit safe.
export const payOrder = (payload, idempotencyKey) =>
  request('/payments', { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey } })

// Orders (signed-in members). Every call is scoped to the member by the server (SC-020).
export const listOrders = () => request('/orders')
export const cancelOrder = (orderNumber, reason) =>
  request(`/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: 'POST', body: { reason: reason || undefined } })
export const returnOrder = (orderNumber) =>
  request(`/orders/${encodeURIComponent(orderNumber)}/return`, { method: 'POST', body: {} })
export const buyAgain = (orderNumber) =>
  request(`/orders/${encodeURIComponent(orderNumber)}/buy-again`, { method: 'POST', body: {} })
export const getGiftPoints = () => request('/gift-points')
// My Wishlist and My Writers (signed-in members). Every call is scoped to the member by the server (SC-022).
export const getWishlist = () => request('/wishlist')
export const addWishlistItem = (bookId) => request('/wishlist/items', { method: 'POST', body: { bookId } })
export const removeWishlistItem = (bookId) => request(`/wishlist/items/${encodeURIComponent(bookId)}`, { method: 'DELETE' })
export const wishlistToCart = (bookIds) => request('/wishlist/cart', { method: 'POST', body: bookIds ? { bookIds } : {} })
export const listFollowedWriters = () => request('/writers')
export const followWriter = (authorId) => request(`/writers/${encodeURIComponent(authorId)}/follow`, { method: 'POST' })
export const unfollowWriter = (authorId) => request(`/writers/${encodeURIComponent(authorId)}/follow`, { method: 'DELETE' })
// Public writer details; a signed-in member also gets `following`.
export const getWriter = (authorId) => request(`/authors/${encodeURIComponent(authorId)}`)
