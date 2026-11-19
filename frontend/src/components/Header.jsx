import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'

const linkClass = 'rounded px-3 py-2 text-sm hover:bg-gray-800'

export default function Header() {
  const { member, loading, logout, openLogin } = useAuth()
  const { itemCount } = useCart()

  return (
    <header className="border-b border-gray-800 bg-[#181818]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 p-3">
        <Link to="/" className="mr-4 text-xl font-semibold">
          Book Worm
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
          <Link to="/orders" className={linkClass}>
            My Orders
          </Link>
          <Link to="/wishlist" className={linkClass}>
            My Wishlist
          </Link>
          <Link to="/writers" className={linkClass}>
            My Writers
          </Link>
        </nav>
        <Link to="/cart" className={linkClass} aria-label={`Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}>
          Cart ({itemCount})
        </Link>
        {!loading &&
          (member ? (
            <div className="flex items-center gap-2 text-sm">
              <span>
                {member.name}
                {member.role === 'ADMIN' && ' (Admin)'}
              </span>
              <button type="button" className="rounded border border-gray-600 px-3 py-1" onClick={logout}>
                Sign out
              </button>
            </div>
          ) : (
            <button type="button" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white" onClick={openLogin}>
              Login
            </button>
          ))}
      </div>
    </header>
  )
}