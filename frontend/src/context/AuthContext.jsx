import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, loginMember, logoutMember, registerMember } from '../services/apiClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  // null | 'login' | 'register'
  const [modal, setModal] = useState(null)

  useEffect(() => {
    let active = true
    getMe()
      .then((data) => active && setMember(data?.member ?? null))
      .catch(() => active && setMember(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (identifier, password) => {
    const data = await loginMember({ identifier, password })
    setMember(data.member)
    setModal(null)
  }, [])

  const register = useCallback((payload) => registerMember(payload), [])

  const logout = useCallback(async () => {
    try {
      await logoutMember()
    } finally {
      setMember(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      member,
      loading,
      modal,
      login,
      register,
      logout,
      openLogin: () => setModal('login'),
      openRegister: () => setModal('register'),
      closeModal: () => setModal(null),
    }),
    [member, loading, modal, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
