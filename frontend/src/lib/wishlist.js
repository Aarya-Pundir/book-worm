/** Plain helpers for My Wishlist (kept out of component files so they can be tested and reused). */

export const wishlistIdSet = (items) => new Set(items.map((i) => i.bookId))

/** Short text for the result of "add to cart" from the wishlist. */
export function wishlistCartSummary(result) {
  const added = result.added.length
  const parts = []
  if (added > 0) parts.push(`${added} ${added === 1 ? 'book' : 'books'} added to your cart.`)
  if (result.message) parts.push(result.message)
  return parts.join(' ')
}