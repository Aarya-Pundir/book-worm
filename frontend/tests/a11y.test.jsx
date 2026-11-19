import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import App from '../src/App.jsx'
import Modal from '../src/components/Modal.jsx'
import { contrastRatio } from '../src/lib/contrast.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <a href="/elsewhere">Outside link</a>
      {open && (
        <Modal title="Test dialog" onClose={() => setOpen(false)}>
          <input aria-label="First field" />
          <button type="button">Middle</button>
          <button type="button">Last</button>
        </Modal>
      )}
    </>
  )
}

describe('dialog keyboard behaviour (WCAG 2.1.2, 2.4.3)', () => {
  it('moves focus into the dialog and keeps Tab and Shift+Tab inside it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toContainElement(document.activeElement)
    for (let i = 0; i < 6; i += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement)
    }
    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement)
    }
  })

  it('wraps from the last control to the first, and back', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(screen.getByLabelText('First field')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('First field')).toHaveFocus()
  })

  it('closes on Escape and returns focus to the control that opened it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

describe('labels (WCAG 2.5.3, Label in Name)', () => {
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
  const book = {
    id: 1, title: 'The Silent Witness', shortDescription: 'A puzzle.', coverUrl: '/covers/1.svg', price: 100, format: 'Paperback',
    language: 'English', inStock: true, publisher: { id: 3, name: 'Lantern Press' }, authors: [{ id: 7, name: 'Meera Iyer' }],
    categories: [{ id: 2, name: 'Mystery', slug: 'mystery' }], estimatedDelivery: '2026-11-21',
  }

  it('starts every button name with its visible text, for signed-in and guest visitors', async () => {
    const member = { id: 1, name: 'Asha', email: 'a@example.com', mobile: '9876543210', role: 'MEMBER' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url).replace(/^\/api/, '').split('?')[0]
        if (path === '/health') return json(200, { status: 'ok' })
        if (path === '/members/me') return json(200, { member })
        if (path === '/cart') return json(200, { cart: { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false } })
        if (path === '/wishlist') return json(200, { items: [{ bookId: 1 }], count: 1, maxItems: 200 })
        if (path === '/writers') return json(200, { items: [{ id: 7, name: 'Meera Iyer', bookCount: 1, followedAt: 'x' }] })
        if (path === '/books/1') return json(200, { book: { ...book, description: 'Full.', publicationDate: '2020-01-01', related: [] } })
        throw new Error(`Unexpected request ${path}`)
      }),
    )
    render(
      <MemoryRouter initialEntries={['/books/1']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'The Silent Witness' })
    await screen.findByRole('button', { name: 'Unfollow Meera Iyer' })
    for (const button of screen.getAllByRole('button')) {
      const visible = button.textContent.trim().toLowerCase()
      const name = (button.getAttribute('aria-label') ?? button.textContent).trim().toLowerCase()
      if (visible) expect(name.startsWith(visible), `"${name}" should start with "${visible}"`).toBe(true)
    }
  })
})

describe('colour contrast (WCAG 1.4.3)', () => {
  // Backgrounds and text colours the pages use (Tailwind palette values). Text must reach 4.5:1.
  const backgrounds = { page: '#121212', card: '#1b1b1b', header: '#181818', dialog: '#1e1e1e', cover: '#262626' }
  const texts = { body: '#e5e7eb', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af', error: '#f87171', warning: '#fcd34d', success: '#4ade80' }

  it('keeps every text colour readable on every surface', () => {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      for (const [name, fg] of Object.entries(texts)) {
        expect(contrastRatio(fg, bg), `${name} on ${bgName}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps white text on the indigo buttons readable', () => {
    expect(contrastRatio('#ffffff', '#4f46e5')).toBeGreaterThanOrEqual(4.5) // indigo-600
  })

  it('no longer uses the dim gray-500 for text (it measured 3.9:1 on the page background)', () => {
    expect(contrastRatio('#6b7280', '#121212')).toBeLessThan(4.5)
    const sources = import.meta.glob('../src/**/*.jsx', { query: '?raw', import: 'default', eager: true })
    const offenders = Object.entries(sources)
      .filter(([, text]) => /text-gray-(500|600|700)\b/.test(text))
      .map(([file]) => file)
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    expect(offenders).toEqual([])
  })
})
