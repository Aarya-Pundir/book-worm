import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import Modal from './Modal.jsx'

export default function LoginModal({ notice }) {
  const { login, closeModal, openRegister } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [forgotShown, setForgotShown] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!identifier.trim()) next.identifier = 'Email or mobile number is required'
    if (!password) next.password = 'Password is required'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await login(identifier.trim(), password)
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded border border-gray-600 bg-[#121212] px-3 py-2 text-gray-100'

  return (
    <Modal title="Sign in to Book Worm" onClose={closeModal}>
      {notice && <p className="mb-3 text-sm text-amber-300">{notice}</p>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-identifier" className="mb-1 block text-sm">
            Email or mobile number
          </label>
          <input
            id="login-identifier"
            className={input}
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-invalid={Boolean(errors.identifier)}
          />
          {errors.identifier && <p className="mt-1 text-sm text-red-400">{errors.identifier}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm">
            Password
          </label>
          <div className="flex gap-2">
            <input
              id="login-password"
              className={input}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
            />
            <button
              type="button"
              className="rounded border border-gray-600 px-3 text-sm"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-red-400">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="underline" onClick={() => setForgotShown(true)}>
          Forgot password?
        </button>
        <button type="button" className="underline" onClick={openRegister}>
          Sign Up
        </button>
        <button type="button" className="underline" onClick={closeModal}>
          Continue as Guest
        </button>
      </div>
      {forgotShown && (
        <p role="status" className="mt-3 text-sm text-gray-400">
          Password reset is coming soon.
        </p>
      )}
    </Modal>
  )
}
