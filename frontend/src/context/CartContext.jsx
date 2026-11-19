import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { addCartItem, getCart, removeCartItem, updateCartItem } from '../services/apiClient.js'
import { useAuth } from './AuthContext.jsx'

const CartContext = createContext(null)

const EMPTY = { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false }

/**
 * Holds the cart for the current visitor. The server is the source of truth for prices and
 * availability, so every change replaces the cart with the server's answer.
 */
export function CartProvider({ children }) {
  const { member, loading: authLoading } = useAuth()
  const [cart, setCart] = useState(EMPTY)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await getCart()
      setCart(data.cart)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  // Load once the session is known, and again after sign-in or sign-out so a guest cart merge shows up.
  const memberId = member?.id ?? null
  useEffect(() => {
    if (authLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [authLoading, memberId, refresh])

  // Each change returns { cart, message? }. Errors are thrown to the caller to show next to the control.
  const apply = useCallback(async (call) => {
    const data = await call()
    setCart(data.cart)
    setStatus('ready')
    return data.message ?? null
  }, [])

  const value = useMemo(
    () => ({
      cart,
      status,
      itemCount: cart.itemCount,
      refresh,
      add: (bookId, quantity = 1) => apply(() => addCartItem(bookId, quantity)),
      setQuantity: (bookId, quantity) => apply(() => updateCartItem(bookId, quantity)),
      remove: (bookId) => apply(() => removeCartItem(bookId)),
    }),
    [cart, status, refresh, apply],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
