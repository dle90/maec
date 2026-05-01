import React, { createContext, useContext, useState, useCallback } from 'react'

// Open-case tabs for Ca đọc (Teleradiology). Lives at App level so tabs survive
// in-app route changes (e.g. bacsi clicks Đăng ký and comes back). Resets on
// full page refresh, which is fine — studies reload from the server anyway.

const TeleradTabsContext = createContext(null)

export const SYS_WORKLIST = '__worklist__'

export function TeleradTabsProvider({ children }) {
  const [openCases, setOpenCases] = useState([])
  const [activeCaseId, setActiveCaseId] = useState(SYS_WORKLIST)

  const openCase = useCallback((study) => {
    setOpenCases(cs => cs.find(c => c._id === study._id) ? cs : [...cs, study])
    setActiveCaseId(study._id)
  }, [])

  const closeCase = useCallback((id) => {
    setOpenCases(cs => cs.filter(c => c._id !== id))
    setActiveCaseId(prev => prev === id ? SYS_WORKLIST : prev)
  }, [])

  // Refresh open tab data against a freshly-loaded study list (status may have
  // changed server-side while the user was away).
  const syncWithStudies = useCallback((studies) => {
    setOpenCases(cs => cs.map(c => studies.find(s => s._id === c._id) || c))
  }, [])

  return (
    <TeleradTabsContext.Provider value={{ openCases, activeCaseId, setActiveCaseId, openCase, closeCase, syncWithStudies }}>
      {children}
    </TeleradTabsContext.Provider>
  )
}

export function useTeleradTabs() {
  const ctx = useContext(TeleradTabsContext)
  if (!ctx) throw new Error('useTeleradTabs must be used inside TeleradTabsProvider')
  return ctx
}
