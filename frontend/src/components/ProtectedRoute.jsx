import { useAuth } from '../context/AuthContext.jsx'

/** Guests are asked to sign in; a `role` prop additionally restricts by role (server enforces too). */
export default function ProtectedRoute({ children, role }) {
  const { member, loading, openLogin } = useAuth()

  if (loading) return <p role="status" className="p-8 text-gray-400">Loading...</p>

  if (!member) {
    return (
      <div className="p-8">
        <p role="alert" className="mb-4">Please sign in to continue.</p>
        <button type="button" className="rounded bg-indigo-600 px-4 py-2 text-white" onClick={openLogin}>
          Sign in
        </button>
      </div>
    )
  }

  if (role && member.role !== role) {
    return <p role="alert" className="p-8">You do not have permission to view this page.</p>
  }

  return children
}
