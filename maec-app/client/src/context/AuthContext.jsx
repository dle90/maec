import React, { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const stored = localStorage.getItem('linkrad_auth')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const login = (data) => {
    localStorage.setItem('linkrad_auth', JSON.stringify(data))
    setAuth(data)
  }

  const logout = () => {
    localStorage.removeItem('linkrad_auth')
    setAuth(null)
  }

  // Admin always passes; otherwise check the permissions array embedded at login.
  const hasPerm = (key) => {
    if (!auth) return false
    if (auth.role === 'admin') return true
    const perms = auth.permissions || []
    return perms.includes(key) || perms.includes('system.admin')
  }

  // Site-scoped permission check. If the permission was granted only via a site-scope
  // role at a specific site, match the siteId. Group-scope perms apply everywhere.
  const hasPermAtSite = (key, siteId) => {
    if (!auth) return false
    if (auth.role === 'admin') return true
    if (auth.permissions?.includes('system.admin')) return true
    const sitePerms = auth.sitePerms?.[siteId] || []
    if (sitePerms.includes(key)) return true
    const siteScoped = new Set()
    Object.values(auth.sitePerms || {}).forEach(arr => arr.forEach(p => siteScoped.add(p)))
    // If a perm exists globally and isn't tied to a site elsewhere, it's group-scope
    return (auth.permissions || []).includes(key) && !siteScoped.has(key)
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout, hasPerm, hasPermAtSite }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
