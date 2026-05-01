import React, { useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const DEMO_ACCOUNTS = [
  { username: 'partner_ndh', password: 'partner123', name: 'BV Nhi Đồng Hải Phòng' },
  { username: 'partner_tm',  password: 'partner123', name: 'PK Tâm Minh' },
]

export default function PartnerLogin() {
  const [username, setUsername] = useState(DEMO_ACCOUNTS[0].username)
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/partner-portal/login', { username, password })
      localStorage.setItem('linkrad_partner_auth', JSON.stringify(data))
      window.location.href = '/partner-portal'
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-orange-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-blue-900 tracking-wide">LinkRad</div>
          <div className="text-orange-600 text-sm font-medium mt-1">Cổng đối tác</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="partner_ndh"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-xs text-gray-400 text-center">
          Dành cho đối tác bệnh viện / phòng khám
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Tài khoản demo</div>
          <div className="flex flex-wrap gap-1">
            {DEMO_ACCOUNTS.map(a => {
              const selected = a.username === username
              return (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => { setUsername(a.username); setPassword(a.password); setError('') }}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${selected ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600'}`}
                  title={`${a.username} • ${a.password}`}
                >
                  {a.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
