import React, { useState, useEffect } from 'react'
import axios from 'axios'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function createApi() {
  const auth = JSON.parse(localStorage.getItem('linkrad_patient_auth') || '{}')
  const instance = axios.create({ baseURL: '/api/patient-portal' })
  instance.interceptors.request.use(cfg => {
    if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`
    return cfg
  })
  instance.interceptors.response.use(r => r, err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('linkrad_patient_auth')
      window.location.href = '/patient-login'
    }
    return Promise.reject(err)
  })
  return instance
}

const STATUS_LABEL = {
  scheduled: 'Đã đặt lịch', confirmed: 'Đã xác nhận', arrived: 'Đã đến',
  in_progress: 'Đang thực hiện', completed: 'Hoàn thành', cancelled: 'Đã hủy', no_show: 'Không đến',
}
const STATUS_COLOR = {
  scheduled: 'bg-blue-100 text-blue-700', confirmed: 'bg-cyan-100 text-cyan-700',
  arrived: 'bg-yellow-100 text-yellow-700', in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700', no_show: 'bg-gray-100 text-gray-500',
}
const PAY_LABEL = { draft: 'Chờ thanh toán', issued: 'Đã xuất', paid: 'Đã thanh toán', partially_paid: 'Thanh toán một phần', cancelled: 'Đã hủy', refunded: 'Hoàn trả' }
const PAY_COLOR = { draft: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', partially_paid: 'bg-orange-100 text-orange-700', cancelled: 'bg-red-100 text-red-700', refunded: 'bg-purple-100 text-purple-700' }

// ── Star Rating Component ───────────────────────────────
function StarRating({ value, onChange, readonly }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange && onChange(star)}
          className={`text-2xl transition-colors ${star <= value ? 'text-yellow-400' : 'text-gray-300'} ${!readonly ? 'hover:text-yellow-500 cursor-pointer' : ''}`}
        >
          &#9733;
        </button>
      ))}
    </div>
  )
}

// ── Visit Card ──────────────────────────────────────────
function VisitCard({ visit, api, onFeedbackSaved }) {
  const [expanded, setExpanded] = useState(false)
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [rating, setRating] = useState(visit.feedback?.rating || 0)
  const [comment, setComment] = useState(visit.feedback?.comment || '')
  const [submitting, setSubmitting] = useState(false)
  const [fbSaved, setFbSaved] = useState(!!visit.feedback)

  const loadReport = async () => {
    if (report || !visit.study?.hasReport) return
    setLoadingReport(true)
    try {
      const { data } = await api.get(`/visits/${visit.appointmentId}/report`)
      setReport(data)
    } catch { setReport({ error: true }) }
    setLoadingReport(false)
  }

  const toggleExpand = () => {
    if (!expanded) loadReport()
    setExpanded(!expanded)
  }

  const submitFeedback = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      await api.post('/feedback', { appointmentId: visit.appointmentId, rating, comment })
      setFbSaved(true)
      onFeedbackSaved?.()
    } catch {}
    setSubmitting(false)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={toggleExpand}>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-gray-800">{fmtDateTime(visit.date)}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[visit.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[visit.status] || visit.status}
          </span>
          <span className="text-xs text-gray-500">{visit.modality}</span>
          <span className="text-xs text-gray-400">{visit.site}</span>
        </div>
        <div className="flex items-center gap-3">
          {visit.invoice && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_COLOR[visit.invoice.status] || 'bg-gray-100'}`}>
              {fmtMoney(visit.invoice.grandTotal)}đ — {PAY_LABEL[visit.invoice.status] || visit.invoice.status}
            </span>
          )}
          {visit.feedback && <span className="text-yellow-400 text-sm">{'★'.repeat(visit.feedback.rating)}</span>}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Clinical info */}
          {visit.clinicalInfo && (
            <div className="text-sm"><span className="font-medium text-gray-600">Lý do khám:</span> {visit.clinicalInfo}</div>
          )}

          {/* Invoice items */}
          {visit.invoice?.items && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Dịch vụ:</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 text-xs">
                  <th className="pb-1">Tên dịch vụ</th><th className="pb-1 text-right">Đơn giá</th><th className="pb-1 text-right">SL</th><th className="pb-1 text-right">Thành tiền</th>
                </tr></thead>
                <tbody>
                  {visit.invoice.items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1">{item.serviceName}</td>
                      <td className="py-1 text-right">{fmtMoney(item.unitPrice)}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right font-medium">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right mt-2 text-sm font-semibold text-gray-800">
                Tổng: {fmtMoney(visit.invoice.grandTotal)}đ
                {visit.invoice.paidAmount > 0 && visit.invoice.paidAmount < visit.invoice.grandTotal &&
                  <span className="text-orange-600 ml-2">(Đã trả: {fmtMoney(visit.invoice.paidAmount)}đ)</span>}
              </div>
            </div>
          )}

          {/* Report */}
          {visit.study?.hasReport && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Kết quả:</div>
              {loadingReport ? (
                <div className="text-sm text-gray-400">Đang tải...</div>
              ) : report?.error ? (
                <div className="text-sm text-red-500">Không thể tải kết quả</div>
              ) : report ? (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  {report.technique && <div><span className="font-medium">Kỹ thuật:</span> {report.technique}</div>}
                  {report.findings && <div><span className="font-medium">Mô tả:</span> {report.findings}</div>}
                  {report.impression && <div><span className="font-medium">Kết luận:</span> {report.impression}</div>}
                  {report.recommendation && <div><span className="font-medium">Đề nghị:</span> {report.recommendation}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    Trạng thái: {report.status === 'final' ? 'Đã duyệt' : 'Sơ bộ'} — {fmtDateTime(report.reportedAt)}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Feedback */}
          <div>
            <div className="text-sm font-medium text-gray-600 mb-2">Đánh giá dịch vụ:</div>
            {fbSaved ? (
              <div className="flex items-center gap-2">
                <StarRating value={rating} readonly />
                {comment && <span className="text-sm text-gray-500">— {comment}</span>}
                <span className="text-xs text-green-600 ml-2">Đã gửi</span>
              </div>
            ) : (
              <div className="space-y-2">
                <StarRating value={rating} onChange={setRating} />
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Nhận xét về chất lượng dịch vụ..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 resize-none"
                  rows={2}
                />
                <button
                  onClick={submitFeedback}
                  disabled={!rating || submitting}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Portal Page ────────────────────────────────────
export default function PatientPortal() {
  const [auth] = useState(() => JSON.parse(localStorage.getItem('linkrad_patient_auth') || '{}'))
  const [api] = useState(() => createApi())
  const [tab, setTab] = useState('visits')
  const [visits, setVisits] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth.token) { window.location.href = '/patient-login'; return }
    Promise.all([
      api.get('/visits').then(r => setVisits(r.data)),
      api.get('/profile').then(r => setProfile(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  const logout = () => {
    localStorage.removeItem('linkrad_patient_auth')
    window.location.href = '/patient-login'
  }

  if (!auth.token) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-blue-900">LinkRad</span>
            <span className="text-green-600 text-sm font-medium">Cổng bệnh nhân</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{auth.patientName}</span>
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">Đăng xuất</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'visits', label: 'Lịch sử khám' },
            { key: 'profile', label: 'Thông tin cá nhân' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center text-gray-400 py-12">Đang tải dữ liệu...</div>
        ) : tab === 'visits' ? (
          <div className="space-y-3">
            {visits.length === 0 ? (
              <div className="text-center text-gray-400 py-12">Chưa có lịch sử khám</div>
            ) : visits.map(v => (
              <VisitCard key={v.appointmentId} visit={v} api={api} onFeedbackSaved={() => {}} />
            ))}
          </div>
        ) : tab === 'profile' && profile ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Thông tin cá nhân</h3>
            <div className="space-y-3 text-sm">
              <div className="flex"><span className="w-32 text-gray-500">Mã bệnh nhân:</span><span className="font-medium">{profile.patientId}</span></div>
              <div className="flex"><span className="w-32 text-gray-500">Họ tên:</span><span className="font-medium">{profile.name}</span></div>
              <div className="flex"><span className="w-32 text-gray-500">Ngày sinh:</span><span>{fmtDate(profile.dob)}</span></div>
              <div className="flex"><span className="w-32 text-gray-500">Giới tính:</span><span>{profile.gender === 'M' ? 'Nam' : profile.gender === 'F' ? 'Nữ' : 'Khác'}</span></div>
              <div className="flex"><span className="w-32 text-gray-500">Điện thoại:</span><span>{profile.phone}</span></div>
              <div className="flex"><span className="w-32 text-gray-500">Địa chỉ:</span><span>{profile.address || '—'}</span></div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
