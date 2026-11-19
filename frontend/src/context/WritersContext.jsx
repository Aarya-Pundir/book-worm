import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { followWriter, listFollowedWriters, unfollowWriter } from '../services/apiClient.js'
import { writerIdSet } from '../lib/writers.js'
import { useAuth } from './AuthContext.jsx'

const WritersContext = createContext(null)

/**
 * Holds the writers the signed-in member follows. Guests follow nobody and nothing is requested for them.
 */
export function WritersProvider({ children }) {
  const { member, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'

  const memberId = member?.id ?? null

  const refresh = useCallback(async () => {
    if (memberId === null) {
      setItems([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    try {
      const data = await listFollowedWriters()
      setItems(data.items)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [memberId])

  useEffect(() => {
    if (authLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [authLoading, refresh])

  // Following or unfollowing changes the list, so it is read back from the server (it also knows the book counts).
  const follow = useCallback(
    async (authorId) => {
      await followWriter(authorId)
      await refresh()
    },
    [refresh],
  )

  const unfollow = useCallback(
    async (authorId) => {
      await unfollowWriter(authorId)
      await refresh()
    },
    [refresh],
  )

  const value = useMemo(
    () => ({ items, status, ids: writerIdSet(items), refresh, follow, unfollow }),
    [items, status, refresh, follow, unfollow],
  )

  return <WritersContext.Provider value={value}>{children}</WritersContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWriters() {
  const ctx = useContext(WritersContext)
  if (!ctx) throw new Error('useWriters must be used inside WritersProvider')
  return ctx
}