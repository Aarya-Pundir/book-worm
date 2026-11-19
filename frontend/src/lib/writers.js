/** Plain helpers for My Writers (kept out of component files so they can be tested and reused). */

export const writerIdSet = (items) => new Set(items.map((i) => i.id))

export const bookCountLabel = (count) => `${count} ${count === 1 ? 'book' : 'books'}`