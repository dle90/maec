import React, { createContext, useContext, useState } from 'react'
import { EN } from '../pages/diagnostic.i18n'

// Lightweight bilingual context. `t(vn)` returns the Vietnamese string unchanged
// in 'vi' mode (so wrapping a string is a no-op for the default UI) and the
// English translation in 'en' mode (falling back to the VN string if missing).
// Currently consumed only by the diagnostic assistant.
const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('maec_lang') || 'vi' } catch { return 'vi' }
  })
  const setLang = (l) => {
    try { localStorage.setItem('maec_lang', l) } catch {}
    setLangState(l)
  }
  const t = (vn) => (lang === 'en' ? (EN[vn] || vn) : vn)
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

// Safe outside a provider (returns Vietnamese identity).
export const useLanguage = () =>
  useContext(LanguageContext) || { lang: 'vi', setLang: () => {}, t: (s) => s }
