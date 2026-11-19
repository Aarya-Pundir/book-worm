import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal shell: role=dialog, labelled, closes on Escape and backdrop click.
 * Keyboard: focus moves into the dialog, Tab and Shift+Tab stay inside it, and focus goes back to the control that
 * opened it when it closes (WCAG 2.4.3, 2.1.2).
 */
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    ref.current?.querySelector('input, button')?.focus()
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const items = Array.from(ref.current.querySelectorAll(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (!ref.current.contains(current)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && current === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-gray-700 bg-[#1e1e1e] p-6 shadow-xl"
      >
        <h2 id="modal-title" className="mb-4 text-xl font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
