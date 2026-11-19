import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

/** Routes fetch calls by "METHOD /path" so each test states only what it needs. */
function stubApi(routes) {
  const fn = vi.fn(async (url, opts = {}) => {
    const key = `${opts.method ?? 'GET'} ${String(url).replace(/^\/api/, '')}`
    if (key === 'GET /health') return json(200, { status: 'ok' })
    // Catalogue calls are not the subject of these tests; answer with empty data.
    if (key === 'GET /categories') return json(200, { items: [] })
    if (key.startsWith('GET /books/recommended')) return json(200, { personalised: false, items: [] })
    if (key.startsWith('GET /books/featured')) return json(200, { items: [] })
    if (key === 'GET /members/me' && !routes['GET /members/me']) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } })
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request ${key}`)
    return typeof handler === 'function' ? handler(opts) : handler
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('LoginModal', () => {
  it('toggles password visibility', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('shows field messages for empty fields and does not call the API', async () => {
    const fetchMock = stubApi({})
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Email or mobile number is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/members/login'))).toBe(false)
  })

  it('shows the generic error for wrong credentials', async () => {
    stubApi({
      'POST /members/login': json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email/mobile or password' } }),
    })
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    await user.type(screen.getByLabelText('Email or mobile number'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'Wrong1234')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email/mobile or password')
  })

  it('signs in, shows the profile control, and signs out', async () => {
    const member = { id: '1', name: 'Asha Verma', email: 'asha@example.com', mobile: '9000000001', role: 'MEMBER' }
    stubApi({
      'POST /members/login': json(200, { member }),
      'POST /members/logout': { ok: true, status: 204, json: async () => null },
    })
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    await user.type(screen.getByLabelText('Email or mobile number'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
  })

  it('offers Forgot password (coming soon), Sign Up and Continue as Guest', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByText('Password reset is coming soon.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('RegistrationForm', () => {
  const open = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    await user.click(screen.getByRole('button', { name: 'Sign Up' }))
  }

  it('shows field-level messages for invalid input', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderApp()
    await open(user)
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Mobile number'), '123')
    await user.type(screen.getByLabelText('Password'), 'weak')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid 10-digit Indian mobile number')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('shows server duplicate messages next to the right field', async () => {
    stubApi({
      'POST /members/register': json(409, {
        error: { code: 'DUPLICATE_MEMBER', message: 'exists', fields: { email: 'This email is already registered' } },
      }),
    })
    const user = userEvent.setup()
    renderApp()
    await open(user)
    await user.type(screen.getByLabelText('Full name'), 'Test Reader')
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Mobile number'), '9876543210')
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret')
    await user.type(screen.getByLabelText('Confirm password'), 'Sup3rSecret')
    await user.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(await screen.findByText('This email is already registered')).toBeInTheDocument()
  })

  it('shows a success message after registering', async () => {
    stubApi({ 'POST /members/register': json(201, { member: {}, message: 'ok' }) })
    const user = userEvent.setup()
    renderApp()
    await open(user)
    await user.type(screen.getByLabelText('Full name'), 'Test Reader')
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Mobile number'), '9876543210')
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret')
    await user.type(screen.getByLabelText('Confirm password'), 'Sup3rSecret')
    await user.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(await screen.findByText('Your account was created. You can now sign in.')).toBeInTheDocument()
  })
})

describe('header and protected routes', () => {
  it('asks a guest to sign in when opening My Orders', async () => {
    stubApi({})
    renderApp('/orders')
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
  })

  it('asks a guest to sign in when opening My Wishlist or My Writers, without fabricated data', async () => {
    stubApi({})
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('link', { name: 'My Wishlist' }))
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'My Writers' }))
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })

  it('lets a signed-in member open My Orders', async () => {
    const member = { id: '1', name: 'Asha Verma', email: 'a@example.com', mobile: '9000000001', role: 'MEMBER' }
    stubApi({ 'GET /members/me': json(200, { member }), 'GET /orders': json(200, { items: [] }) })
    renderApp('/orders')
    expect(await screen.findByText('You have not placed any orders yet.')).toBeInTheDocument()
  })
})
