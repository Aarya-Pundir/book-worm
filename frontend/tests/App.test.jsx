import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderApp = () =>
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )

describe('App health status', () => {
  it('shows healthy when the backend responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const body = String(url).endsWith('/cart')
          ? { cart: { items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false } }
          : { status: 'ok' }
        return { ok: true, status: 200, json: async () => body }
      }),
    )
    renderApp()
    expect(await screen.findByText('Backend is healthy')).toBeInTheDocument()
  })

  it('shows unavailable when the backend fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    renderApp()
    expect(await screen.findByText('Backend is unavailable')).toBeInTheDocument()
  })
})
