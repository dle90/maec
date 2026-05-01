import React, { useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const DEMO_ACCOUNTS = [
  { phone: '0901000001', dob: '1975-04-12', name: 'Nguyễn Văn Nam' },
  { phone: '0901000002', dob: '1988-09-23', name: 'Trần Thị Hoa' },
  { phone: '0901000003', dob: '1965-02-28', name: 'Lê Văn Đức' },
  { phone: '0901000004', dob: '1992-07-15', name: 'Phạm Thị Mai' },
  { phone: '0901000005', dob: '1958-11-03', name: 'Hoàng Văn Minh' },
]

export default function PatientLogin() {
  const [phone, setPhone] = useState(DEMO_ACCOUNTS[0].phone)
  const [dob, setDob] = useState(DEMO_ACCOUNTS[0].dob)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/patient-portal/login', { phone, dob })
      localStorage.setItem('linkrad_patient_auth', JSON.stringify(data))
      window.location.href = '/patient-portal'
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-blue-900 tracking-wide">LinkRad</div>
          <div className="text-green-600 text-sm font-medium mt-1">Cổng bệnh nhân</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0901000001"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Ngày sinh</label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200"
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
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-xs text-gray-400 text-center">
          Nhập số điện thoại và ngày sinh đã đăng ký khám
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Tài khoản demo</div>
          <div className="flex flex-wrap gap-1">
            {DEMO_ACCOUNTS.map(a => {
              const selected = a.phone === phone
              return (
                <button
                  key={a.phone}
                  type="button"
                  onClick={() => { setPhone(a.phone); setDob(a.dob); setError('') }}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${selected ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-300 hover:bg-green-50 text-gray-600'}`}
                  title={`${a.phone} • ${a.dob}`}
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
