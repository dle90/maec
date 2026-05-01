import React, { useState, useEffect } from 'react'
import axios from 'axios'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function createApi() {
  const auth = JSON.parse(localStorage.getItem('maec_partner_auth') || '{}')
  const instance = axios.create({ baseURL: '/api/partner-portal' })
  instance.interceptors.request.use(cfg => {
    if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`
    return cfg
  })
  instance.interceptors.response.use(r => r, err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('maec_partner_auth')
      window.location.href = '/partner-login'
    }
    return Promise.reject(err)
  })
  return instance
}

const REF_STATUS = {
  pending: { label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Đã tiếp nhận', color: 'bg-blue-100 text-blue-700' },
  appointment_created: { label: 'Đã tạo lịch', color: 'bg-cyan-100 text-cyan-700' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700' },
}

// ── Referral Form ───────────────────────────────────────
function ReferralForm({ api, services, sites, onSubmitted }) {
  const [form, setForm] = useState({
    patientName: '', patientPhone: '', patientDob: '', patientGender: 'M',
    requestedServiceId: '', requestedServiceName: '', modality: '', site: '',
    clinicalInfo: '', notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectService = (svc) => {
    setForm(p => ({ ...p, requestedServiceId: svc._id, requestedServiceName: svc.name, modality: svc.modality || '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    setSubmitting(true)
    try {
      await api.post('/referrals', form)
      setSuccess('Chuyển gửi thành công!')
      setForm({ patientName: '', patientPhone: '', patientDob: '', patientGender: 'M', requestedServiceId: '', requestedServiceName: '', modality: '', site: '', clinicalInfo: '', notes: '' })
      onSubmitted?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi gửi yêu cầu')
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Chuyển bệnh nhân</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Họ tên bệnh nhân *</label>
          <input value={form.patientName} onChange={e => setForm(p => ({ ...p, patientName: e.target.value }))} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại *</label>
          <input value={form.patientPhone} onChange={e => setForm(p => ({ ...p, patientPhone: e.target.value }))} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Ngày sinh</label>
          <input type="date" value={form.patientDob} onChange={e => setForm(p => ({ ...p, patientDob: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Giới tính</label>
          <select value={form.patientGender} onChange={e => setForm(p => ({ ...p, patientGender: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400">
            <option value="M">Nam</option><option value="F">Nữ</option><option value="other">Khác</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Chi nhánh *</label>
          <select value={form.site} onChange={e => setForm(p => ({ ...p, site: e.target.value }))} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400">
            <option value="">-- Chọn chi nhánh --</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Dịch vụ</label>
          <select value={form.requestedServiceId} onChange={e => {
            const svc = services.find(s => s._id === e.target.value)
            if (svc) selectService(svc)
          }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400">
            <option value="">-- Chọn dịch vụ --</option>
            {services.map(s => <option key={s._id} value={s._id}>{s.name} ({fmtMoney(s.basePrice)}đ)</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-600 mb-1">Thông tin lâm sàng</label>
          <textarea value={form.clinicalInfo} onChange={e => setForm(p => ({ ...p, clinicalInfo: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none" rows={2} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none" rows={2} />
        </div>
      </div>
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</div>}
      {success && <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">{success}</div>}
      <button type="submit" disabled={submitting}
        className="mt-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm px-6 py-2 rounded-lg disabled:opacity-50">
        {submitting ? 'Đang gửi...' : 'Gửi chuyển bệnh nhân'}
      </button>
    </form>
  )
}

// ── Referral Tracking ───────────────────────────────────
function ReferralTracking({ api, refreshKey }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = {}
    if (statusFilter) params.status = statusFilter
    api.get('/referrals', { params }).then(r => setReferrals(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter, refreshKey])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Theo dõi chuyển gửi</h3>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả</option>
          {Object.entries(REF_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Đang tải...</div>
      ) : referrals.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Chưa có chuyển gửi</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Ngày gửi</th>
                <th className="px-4 py-2">Bệnh nhân</th>
                <th className="px-4 py-2">SĐT</th>
                <th className="px-4 py-2">Dịch vụ</th>
                <th className="px-4 py-2">Chi nhánh</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2">Lịch hẹn</th>
                <th className="px-4 py-2">Ca chụp</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map(r => {
                const st = REF_STATUS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={r._id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2 font-medium">{r.patientName}</td>
                    <td className="px-4 py-2">{r.patientPhone}</td>
                    <td className="px-4 py-2">{r.requestedServiceName || '—'}</td>
                    <td className="px-4 py-2">{r.site}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{r.appointmentStatus || '—'}</td>
                    <td className="px-4 py-2 text-xs">{r.studyStatus || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Commission Summary ──────────────────────────────────
function CommissionSummary({ api }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/commissions').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Hoa hồng</h3>
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Đang tải...</div>
      ) : data.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Chưa có dữ liệu hoa hồng</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2">Tháng</th>
                <th className="px-4 py-2 text-right">Số ca chuyển gửi</th>
                <th className="px-4 py-2 text-right">Tổng doanh thu</th>
                <th className="px-4 py-2 text-right">Hoa hồng</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.month} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{row.month}</td>
                  <td className="px-4 py-2 text-right">{row.referralCount}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(row.totalRevenue)}đ</td>
                  <td className="px-4 py-2 text-right font-semibold text-orange-600">{fmtMoney(row.commissionAmount)}đ</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-2">Tổng cộng</td>
                <td className="px-4 py-2 text-right">{data.reduce((s, r) => s + r.referralCount, 0)}</td>
                <td className="px-4 py-2 text-right">{fmtMoney(data.reduce((s, r) => s + r.totalRevenue, 0))}đ</td>
                <td className="px-4 py-2 text-right text-orange-600">{fmtMoney(data.reduce((s, r) => s + r.commissionAmount, 0))}đ</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Portal Page ────────────────────────────────────
export default function PartnerPortal() {
  const [auth] = useState(() => JSON.parse(localStorage.getItem('maec_partner_auth') || '{}'))
  const [api] = useState(() => createApi())
  const [tab, setTab] = useState('referral')
  const [services, setServices] = useState([])
  const [sites, setSites] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!auth.token) { window.location.href = '/partner-login'; return }
    api.get('/services').then(r => setServices(r.data)).catch(() => {})
    api.get('/sites').then(r => setSites(r.data)).catch(() => {})
  }, [])

  const logout = () => {
    localStorage.removeItem('maec_partner_auth')
    window.location.href = '/partner-login'
  }

  if (!auth.token) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-blue-900">Cổng đối tác — MAEC</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{auth.displayName} — {auth.facilityName}</span>
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">Đăng xuất</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 mt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'referral', label: 'Chuyển bệnh nhân' },
            { key: 'tracking', label: 'Theo dõi' },
            { key: 'commission', label: 'Hoa hồng' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {tab === 'referral' && (
          <ReferralForm api={api} services={services} sites={sites} onSubmitted={() => setRefreshKey(k => k + 1)} />
        )}
        {tab === 'tracking' && (
          <ReferralTracking api={api} refreshKey={refreshKey} />
        )}
        {tab === 'commission' && (
          <CommissionSummary api={api} />
        )}
      </div>
    </div>
  )
}
