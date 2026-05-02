import { useEffect } from 'react'

// Shared hook for closing modals/drawers on Escape. Call inside the modal
// component with its onClose handler. Listener is added to window so it works
// regardless of which element has focus, and removed on unmount so multiple
// stacked modals don't fire each other's close. Set `enabled=false` to
// temporarily disable (e.g. when a child modal is open and should swallow Esc).
export function useEscapeKey(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof onClose !== 'function') return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, enabled])
}
