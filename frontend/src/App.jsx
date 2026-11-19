import { Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { WishlistProvider } from './context/WishlistContext.jsx'
import { WritersProvider } from './context/WritersContext.jsx'
import Header from './components/Header.jsx'
import HealthStatus from './components/HealthStatus.jsx'
import Layout from './components/Layout.jsx'
import LoginModal from './components/LoginModal.jsx'
import RegistrationForm from './components/RegistrationForm.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import HomePage from './pages/HomePage.jsx'
import CataloguePage from './pages/CataloguePage.jsx'
import BookDetailsPage from './pages/BookDetailsPage.jsx'
import CartPage from './pages/CartPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import { OrderDetailPage, OrdersPage } from './pages/OrdersPage.jsx'
import WishlistPage from './pages/WishlistPage.jsx'
import WritersPage from './pages/WritersPage.jsx'
import WriterDetailPage from './pages/WriterDetailPage.jsx'

function AuthModals() {
  const { modal } = useAuth()
  if (modal === 'login') return <LoginModal />
  if (modal === 'register') return <RegistrationForm />
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
        <WritersProvider>
        <Header />
        <main className="mx-auto min-h-[70vh] max-w-6xl">
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/books" element={<CataloguePage />} />
              <Route path="/books/:id" element={<BookDetailsPage />} />
            </Route>
            <Route path="/cart" element={<CartPage />} />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <CheckoutPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:orderNumber"
              element={
                <ProtectedRoute>
                  <OrderDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wishlist"
              element={
                <ProtectedRoute>
                  <WishlistPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/writers"
              element={
                <ProtectedRoute>
                  <WritersPage />
                </ProtectedRoute>
              }
            />
            <Route path="/writers/:authorId" element={<WriterDetailPage />} />
            <Route path="*" element={<p className="p-8">Page not found.</p>} />
          </Routes>
        </main>
        <HealthStatus />
        <AuthModals />
        </WritersProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  )
}
