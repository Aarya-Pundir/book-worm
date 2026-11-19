import { useEffect, useState } from 'react'
import { getHealth } from '../services/apiClient.js'

/** Small dev-friendly indicator that the frontend can reach the API (quickstart scenario 1). */
export default function HealthStatus() {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    getHealth()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <footer className="border-t border-gray-800 px-4 py-3 text-center">
      <p role="status" className="text-xs text-gray-400">
        {status === 'loading' && 'Checking backend...'}
        {status === 'ok' && 'Backend is healthy'}
        {status === 'error' && 'Backend is unavailable'}
      </p>
    </footer>
  )
}
