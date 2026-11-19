import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import Modal from './Modal.jsx'

const FIELDS = [
  { name: 'name', label: 'Full name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'mobile', label: 'Mobile number', type: 'tel', autoComplete: 'tel' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
]

// Client checks are for quick feedback only; the server validates everything again.
function validate(v) {
  const e = {}
  if (v.name.trim().length < 2) e.name = 'Name must be at least 2 characters'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address'
  const digits = v.mobile.replace(/[\s()-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '')
  if (!/^[6-9]\d{9}$/.test(digits)) e.mobile = 'Enter a valid 10-digit Indian mobile number'
  if (v.password.length < 8) e.password = 'Password must be at least 8 characters'
  else if (!/[a-z]/.test(v.password)) e.password = 'Password needs a lowercase letter'
  else if (!/[A-Z]/.test(v.password)) e.password = 'Password needs an uppercase letter'
  else if (!/\d/.test(v.password)) e.password = 'Password needs a digit'
  if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match'
  return e
}

export default function RegistrationForm() {
  const { register, closeModal, openLogin } = useAuth()
  const [values, setValues] = useState({ name: '', email: '', mobile: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await register(values)
      setDone(true)
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal title="Account created" onClose={closeModal}>
        <p role="status" className="mb-4 text-sm text-green-400">
          Your account was created. You can now sign in.
        </p>
        <button type="button" className="w-full rounded bg-indigo-600 py-2 font-medium text-white" onClick={openLogin}>
          Go to sign in
        </button>
      </Modal>
    )
  }

  return (
    <Modal title="Create your account" onClose={closeModal}>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={`reg-${f.name}`} className="mb-1 block text-sm">
              {f.label}
            </label>
            <input
              id={`reg-${f.name}`}
              className="w-full rounded border border-gray-600 bg-[#121212] px-3 py-2 text-gray-100"
              type={f.type}
              autoComplete={f.autoComplete}
              value={values[f.name]}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              aria-invalid={Boolean(errors[f.name])}
            />
            {errors[f.name] && <p className="mt-1 text-sm text-red-400">{errors[f.name]}</p>}
          </div>
        ))}
        <p className="text-xs text-gray-400">
          Password: at least 8 characters with an uppercase letter, a lowercase letter and a digit.
        </p>
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
          {busy ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <button type="button" className="underline" onClick={openLogin}>
          Already have an account? Sign in
        </button>
        <button type="button" className="underline" onClick={closeModal}>
          Continue as Guest
        </button>
      </div>
    </Modal>
  )
}
