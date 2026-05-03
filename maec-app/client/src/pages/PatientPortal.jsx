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
  const auth = JSON.parse(localStorage.getItem('maec_patient_auth') || '{}')
  const instance = axios.create({ baseURL: '/api/patient-portal' })
  instance.interceptors.request.use(cfg => {
    if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`
    return cfg
  })
  instance.interceptors.response.use(r => r, err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('maec_patient_auth')
      window.location.href = '/patient-login'
    }
    return Promise.reject(err)
  })
  return instance
}

// Encounter status — mirrors the enum used by Khám / Thu Ngân.
const STATUS_LABEL = {
  scheduled: 'Đã đặt lịch', in_progress: 'Đang khám',
  pending_read: 'Chờ đọc', reading: 'Đang đọc', reported: 'Đã có kết quả',
  verified: 'Đã duyệt', completed: 'Đã hoàn',
  partial: 'Thu một phần', paid: 'Đã thanh toán', cancelled: 'Đã hủy',
}
const STATUS_COLOR = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  pending_read: 'bg-cyan-100 text-cyan-700',
  reading: 'bg-cyan-100 text-cyan-700',
  reported: 'bg-emerald-100 text-emerald-700',
  verified: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-rose-100 text-rose-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}
const KIND_LABEL = { service: 'Dịch vụ', package: 'Gói khám', kinh: 'Kính', thuoc: 'Thuốc' }
const SVC_STATUS_LABEL = { pending: 'Chờ', in_progress: 'Đang làm', done: 'Hoàn thành', skipped: 'Bỏ qua' }
const PAY_METHOD_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', mixed: 'Hỗn hợp' }

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

// Render the free-form `output` map of a service line.
function ServiceOutput({ output }) {
  const entries = Object.entries(output || {}).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return <span className="text-gray-400">—</span>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700">
      {entries.map(([k, v]) => (
        <span key={k}><span className="text-gray-500">{k}:</span> <span className="font-mono">{String(v)}</span></span>
      ))}
    </div>
  )
}

// ── Visit Card ──────────────────────────────────────────
function VisitCard({ visit, api, onFeedbackSaved }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [rating, setRating] = useState(visit.feedback?.rating || 0)
  const [comment, setComment] = useState(visit.feedback?.comment || '')
  const [submitting, setSubmitting] = useState(false)
  const [fbSaved, setFbSaved] = useState(!!visit.feedback)

  const loadDetail = async () => {
    if (detail) return
    setLoadingDetail(true)
    try {
      const { data } = await api.get(`/visits/${visit.encounterId}`)
      setDetail(data)
    } catch { setDetail({ error: true }) }
    setLoadingDetail(false)
  }

  const toggleExpand = () => {
    if (!expanded) loadDetail()
    setExpanded(!expanded)
  }

  const submitFeedback = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      await api.post('/feedback', { encounterId: visit.encounterId, rating, comment })
      setFbSaved(true)
      onFeedbackSaved?.()
    } catch {}
    setSubmitting(false)
  }

  const billPill = visit.bill?.grandTotal > 0 && (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visit.bill.remaining === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
      {fmtMoney(visit.bill.grandTotal)}đ
      {visit.bill.remaining > 0 && ` · còn ${fmtMoney(visit.bill.remaining)}`}
    </span>
  )

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={toggleExpand}>
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <div className="text-sm font-medium text-gray-800 whitespace-nowrap">{fmtDateTime(visit.date)}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[visit.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[visit.status] || visit.status}
          </span>
          {visit.examType && <span className="text-xs text-gray-600 truncate">{visit.examType}</span>}
          {visit.site && <span className="text-xs text-gray-400">{visit.site}</span>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {billPill}
          {visit.feedback && <span className="text-yellow-400 text-sm">{'★'.repeat(visit.feedback.rating)}</span>}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {loadingDetail ? (
            <div className="text-sm text-gray-400">Đang tải chi tiết...</div>
          ) : detail?.error ? (
            <div className="text-sm text-red-500">Không thể tải chi tiết</div>
          ) : detail ? (
            <>
              {[
                { k: 'clinicalInfo',   label: 'Lý do đến khám' },
                { k: 'presentIllness', label: 'Quá trình bệnh lý' },
                { k: 'pastHistory',    label: 'Tiền sử người bệnh' },
                { k: 'diagnosis',      label: 'Chẩn đoán' },
              ].map(({ k, label }) => detail[k] ? (
                <div key={k} className="text-sm">
                  <div className="font-medium text-gray-600">{label}:</div>
                  <div className="whitespace-pre-wrap text-gray-700">{detail[k]}</div>
                </div>
              ) : null)}

              {detail.packages?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1.5">Gói khám</div>
                  <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
                    {detail.packages.map(p => (
                      <li key={p.code}>{p.name}{p.tier ? ` — ${p.tier}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.conclusion && (
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1.5">Kết luận của bác sĩ</div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm whitespace-pre-wrap">{detail.conclusion}</div>
                </div>
              )}

              {detail.services?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1.5">Dịch vụ ({detail.services.length})</div>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {detail.services.map((s, i) => (
                      <div key={i} className="px-3 py-2 border-t border-gray-100 first:border-t-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-gray-800 truncate"><strong>{s.name}</strong> <span className="text-xs text-gray-400 font-mono">{s.code}</span></div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">{SVC_STATUS_LABEL[s.status] || s.status}</span>
                        </div>
                        {s.status === 'done' && (
                          <div className="mt-1"><ServiceOutput output={s.output} /></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.bill?.items?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1.5">Hóa đơn</div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 text-xs">
                      <th className="pb-1">Loại</th><th className="pb-1">Tên</th><th className="pb-1 text-right">SL</th><th className="pb-1 text-right">Đơn giá</th><th className="pb-1 text-right">Thành tiền</th>
                    </tr></thead>
                    <tbody>
                      {detail.bill.items.map((b, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="py-1 text-xs text-gray-500">{KIND_LABEL[b.kind] || b.kind}</td>
                          <td className="py-1">{b.name}</td>
                          <td className="py-1 text-right">{b.qty}</td>
                          <td className="py-1 text-right font-mono text-xs">{fmtMoney(b.unitPrice)}</td>
                          <td className="py-1 text-right font-mono">{fmtMoney(b.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-sm space-y-0.5 text-right">
                    <div className="text-gray-600">Tạm tính: <span className="font-mono">{fmtMoney(detail.bill.subtotal)}đ</span></div>
                    {detail.bill.discountAmount > 0 && (
                      <div className="text-rose-600">Giảm giá{detail.bill.discountPercent > 0 ? ` (${detail.bill.discountPercent}%)` : ''}: <span className="font-mono">−{fmtMoney(detail.bill.discountAmount)}đ</span></div>
                    )}
                    <div className="text-blue-700 font-semibold">Tổng cộng: <span className="font-mono">{fmtMoney(detail.bill.grandTotal)}đ</span></div>
                    {detail.bill.paidAmount > 0 && (
                      <div className="text-green-700">Đã thu: <span className="font-mono">{fmtMoney(detail.bill.paidAmount)}đ</span></div>
                    )}
                    {detail.bill.remaining > 0 && (
                      <div className="text-amber-700">Còn lại: <span className="font-mono">{fmtMoney(detail.bill.remaining)}đ</span></div>
                    )}
                  </div>
                </div>
              )}

              {detail.payments?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-1.5">Lịch sử thanh toán</div>
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {detail.payments.map((p, i) => {
                      const isRefund = p.kind === 'refund'
                      return (
                        <li key={i} className={isRefund ? 'text-rose-600' : ''}>
                          {fmtDateTime(p.at)} · {isRefund ? 'Hoàn tiền' : 'Thu'} · {PAY_METHOD_LABEL[p.method] || p.method || '—'}
                          {p.byName && ` · ${p.byName}`}
                          <span className="ml-2 font-mono">{isRefund ? '−' : ''}{fmtMoney(p.amount)}đ</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : null}

          {/* Feedback */}
          <div>
            <div className="text-sm font-medium text-gray-600 mb-2">Đánh giá dịch vụ</div>
            {fbSaved ? (
              <div className="flex items-center gap-2 flex-wrap">
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
  const [auth] = useState(() => JSON.parse(localStorage.getItem('maec_patient_auth') || '{}'))
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
    localStorage.removeItem('maec_patient_auth')
    window.location.href = '/patient-login'
  }

  if (!auth.token) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-blue-900">Cổng bệnh nhân — Phòng khám Mắt Minh Anh</span>
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
              <VisitCard key={v.encounterId} visit={v} api={api} onFeedbackSaved={() => {}} />
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
