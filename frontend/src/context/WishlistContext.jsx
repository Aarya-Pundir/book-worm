import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { addWishlistItem, getWishlist, removeWishlistItem, wishlistToCart } from '../services/apiClient.js'
import { wishlistIdSet } from '../lib/wishlist.js'
import { useAuth } from './AuthContext.jsx'
import { useCart } from './CartContext.jsx'

const WishlistContext = createContext(null)

const EMPTY = { items: [], count: 0, maxItems: null }

/**
 * Holds the signed-in member's wishlist. Guests have none: nothing is requested or stored for them.
 * The server is the source of truth, so every change is read back from its answer.
 */
export function WishlistProvider({ children }) {
  const { member, loading: authLoading } = useAuth()
  const { refresh: refreshCart } = useCart()
  const [list, setList] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'

  const memberId = member?.id ?? null

  const refresh = useCallback(async () => {
    if (memberId === null) {
      setList(EMPTY)
      setStatus('idle')
      return
    }
    setStatus('loading')
    try {
      setList(await getWishlist())
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [memberId])

  useEffect(() => {
    if (authLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [authLoading, refresh])

  const add = useCallback(async (bookId) => {
    const data = await addWishlistItem(bookId)
    setList((l) => ({ ...l, items: [data.item, ...l.items.filter((i) => i.bookId !== bookId)], count: data.count }))
  }, [])

  const remove = useCallback(async (bookId) => {
    await removeWishlistItem(bookId)
    setList((l) => {
      const items = l.items.filter((i) => i.bookId !== bookId)
      return { ...l, items, count: items.length }
    })
  }, [])

  // Moves available books to the cart (all of them, or the ids given). They stay on the wishlist (D3).
  const moveToCart = useCallback(
    async (bookIds) => {
      const result = await wishlistToCart(bookIds)
      await refreshCart()
      await refresh()
      return result
    },
    [refresh, refreshCart],
  )

  const value = useMemo(
    () => ({ ...list, status, ids: wishlistIdSet(list.items), refresh, add, remove, moveToCart }),
    [list, status, refresh, add, remove, moveToCart],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider')
  return ctx
}