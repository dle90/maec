import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const STATUS_BADGE = {
  pending:     { label: 'Chờ',          cls: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'Đang thực hiện', cls: 'bg-yellow-100 text-yellow-700' },
  done:        { label: 'Hoàn thành',   cls: 'bg-green-100 text-green-700' },
  skipped:     { label: 'Bỏ qua',       cls: 'bg-gray-100 text-gray-400' },
}

const KIND_BADGE = {
  service: { label: 'Dịch vụ', cls: 'bg-blue-100 text-blue-700' },
  package: { label: 'Gói khám', cls: 'bg-purple-100 text-purple-700' },
  kinh:    { label: 'Kính',     cls: 'bg-emerald-100 text-emerald-700' },
  thuoc:   { label: 'Thuốc',    cls: 'bg-amber-100 text-amber-700' },
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const startOfWeekISO = () => {
  const d = new Date()
  const day = d.getDay() || 7   // Sun = 0 → 7; Mon = 1
  if (day !== 1) d.setDate(d.getDate() - (day - 1))
  return d.toISOString().slice(0, 10)
}
const startOfMonthISO = () => {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
const startOfYearISO = () => {
  const d = new Date()
  d.setMonth(0, 1)
  return d.toISOString().slice(0, 10)
}

const PERIOD_LABELS = { today: 'Hôm nay', week: 'Tuần này', month: 'Tháng này', ytd: 'YTD', custom: 'Tùy chỉnh' }
const periodToRange = (p) => {
  const today = todayISO()
  if (p === 'today') return { from: today, to: today }
  if (p === 'week')  return { from: startOfWeekISO(), to: today }
  if (p === 'month') return { from: startOfMonthISO(), to: today }
  if (p === 'ytd')   return { from: startOfYearISO(), to: today }
  return null
}

export default function Kham() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(searchParams.get('id'))
  const [showCreate, setShowCreate] = useState(false)
  const [period, setPeriod] = useState(searchParams.get('period') || 'today')
  const [from, setFrom] = useState(searchParams.get('from') || todayISO())
  const [to, setTo] = useState(searchParams.get('to') || todayISO())
  const [site, setSite] = useState(searchParams.get('site') || '')

  // When a preset period is selected, derive from/to from it. Custom = user-set.
  useEffect(() => {
    if (period === 'custom') return
    const range = periodToRange(period)
    if (range) { setFrom(range.from); setTo(range.to) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const load = async () => {
    setLoading(true)
    try {
      const params = { from, to }
      if (site) params.site = site
      const r = await api.get('/encounters', { params })
      setList(r.data || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [from, to, site])

  // Sync filter + open-drawer state to URL (deep-link survives refresh)
  useEffect(() => {
    const next = {}
    if (openId) next.id = openId
    if (period !== 'today') next.period = period
    if (period === 'custom') { next.from = from; next.to = to }
    if (site) next.site = site
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, period, from, to, site])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Khám</h1>
          <p className="text-xs text-gray-500 mt-0.5">Lượt khám — gán gói, thực hiện dịch vụ, thêm kính/thuốc vào bill.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">+ Tạo lượt khám</button>
          <button onClick={load} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">⟳ Làm mới</button>
        </div>
      </div>

      {/* Filters: time + site */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {Object.entries(PERIOD_LABELS).map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium ${period === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
        )}
        {period !== 'custom' && (
          <span className="text-xs text-gray-500">{from === to ? from : `${from} → ${to}`}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">Cơ sở:</span>
          {[
            { v: '',            label: 'Tất cả' },
            { v: 'Trung Kính',  label: 'Trung Kính' },
            { v: 'Kim Giang',   label: 'Kim Giang' },
          ].map(s => (
            <button key={s.v} onClick={() => setSite(s.v)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium ${site === s.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">BN</th>
              <th className="px-3 py-2 text-left">Mã BN</th>
              <th className="px-3 py-2 text-left">Cơ sở</th>
              <th className="px-3 py-2 text-left">Gói</th>
              <th className="px-3 py-2 text-center">Dịch vụ</th>
              <th className="px-3 py-2 text-right">Bill</th>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Đang tải...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Chưa có lượt khám hôm nay</td></tr>
            ) : list.map(e => {
              const services = e.assignedServices || []
              const done = services.filter(s => s.status === 'done').length
              return (
                <tr key={e._id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => setOpenId(e._id)}>
                  <td className="px-3 py-2 font-medium text-gray-800">{e.patientName || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.patientId || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{e.site || '—'}</td>
                  <td className="px-3 py-2 text-xs">{e.packageName ? `${e.packageName}${e.packageTier ? ` (${e.packageTier})` : ''}` : <span className="text-gray-300 italic">Chưa gán</span>}</td>
                  <td className="px-3 py-2 text-center text-xs">{services.length === 0 ? '—' : `${done} / ${services.length}`}</td>
                  <td className="px-3 py-2 text-right font-mono text-blue-700">{fmtMoney(e.billTotal)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtTime(e.createdAt)}</td>
                  <td className="px-3 py-2 text-blue-600 text-xs">Mở →</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openId && <EncounterDrawer id={openId} onClose={() => { setOpenId(null); load() }} onOpenOther={(otherId) => setOpenId(otherId)} />}
      {showCreate && <CreateEncounterModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setOpenId(id); load() }} />}
    </div>
  )
}

// ── Create encounter (Lễ tân quick-create) ────────────────

function CreateEncounterModal({ onClose, onCreated }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)
  const [site, setSite] = useState('Trung Kính')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await api.get('/registration/patients', { params: { q, limit: 10 } })
        setResults(r.data || [])
      } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const submit = async () => {
    if (!picked) return setErr('Chọn bệnh nhân')
    setCreating(true); setErr('')
    try {
      const r = await api.post('/encounters', {
        patientId: picked.patientId || picked._id,
        patientName: picked.name,
        site,
        dob: picked.dob || '',
        gender: picked.gender || 'M',
      })
      onCreated(r.data._id)
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setCreating(false) }
  }

  return (
    <Modal onClose={onClose} title="Tạo lượt khám mới" wide>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Bệnh nhân</label>
          {picked ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-2">
              <div>
                <div className="font-semibold text-sm">{picked.name}</div>
                <div className="text-xs text-gray-500">{picked.patientId || picked._id} · {picked.phone || '—'}</div>
              </div>
              <button onClick={() => { setPicked(null); setQ('') }} className="text-xs text-blue-600 hover:text-blue-800">Đổi</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên / mã BN / SĐT / CCCD..." className="w-full border rounded px-3 py-2 text-sm" autoFocus />
              {searching && <div className="text-xs text-gray-400 mt-1">Đang tìm...</div>}
              {results.length > 0 && (
                <div className="mt-1 border rounded divide-y max-h-60 overflow-y-auto">
                  {results.map(p => (
                    <button key={p._id} onClick={() => setPicked(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.patientId || p._id} · {p.phone || '—'} · {p.dob || '—'}</div>
                    </button>
                  ))}
                </div>
              )}
              {!searching && q.trim() && results.length === 0 && (
                <div className="text-xs text-gray-400 mt-1">Không tìm thấy. Tạo BN mới ở trang Đăng ký trước.</div>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Cơ sở</label>
          <select value={site} onChange={e => setSite(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="Trung Kính">Trung Kính</option>
            <option value="Kim Giang">Kim Giang</option>
          </select>
        </div>
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={submit} disabled={creating || !picked} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">{creating ? 'Đang tạo...' : 'Tạo lượt khám'}</button>
          <button onClick={onClose} className="ml-auto text-sm text-gray-500 hover:text-gray-700 px-4">Hủy</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Encounter detail drawer ───────────────────────────────

function EncounterDrawer({ id, onClose, onOpenOther }) {
  const [enc, setEnc] = useState(null)
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [openServiceCode, setOpenServiceCode] = useState(null)
  const [showAddItem, setShowAddItem] = useState(null) // 'service' | 'kinh' | 'thuoc'
  const [showAssignPackage, setShowAssignPackage] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/encounters/${id}`)
      setEnc(r.data)
      // Load patient history (excluding current encounter)
      if (r.data.patientId) {
        api.get('/encounters', { params: { patientId: r.data.patientId, excludeId: id } })
          .then(h => setHistory(h.data || []))
          .catch(() => setHistory([]))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  if (loading || !enc) {
    return (
      <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
        <div className="w-full max-w-3xl bg-white h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <div className="text-gray-400">Đang tải...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between flex-shrink-0 gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-gray-900 flex items-center gap-2">
              {enc.patientName} <span className="font-mono text-xs text-gray-400">{enc.patientId}</span>
              {enc.status === 'paid' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Đã thanh toán</span>}
              {enc.status === 'cancelled' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Đã hủy</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{enc.site || '—'} · {enc._id}</div>
            {enc.status === 'paid' && enc.paidByName && (
              <div className="text-xs text-green-700 mt-0.5">Thu ngân: {enc.paidByName} · {enc.paidAt && new Date(enc.paidAt).toLocaleString('vi-VN')}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {enc.status !== 'paid' && enc.status !== 'cancelled' && (enc.billItems || []).length > 0 && (
              <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">Tổng bill: <b className="text-blue-700 font-mono">{fmtMoney(enc.billTotal)} đ</b> · chuyển <b>Thu ngân</b> để thanh toán</span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Patient history */}
          <section>
            <button onClick={() => setHistoryOpen(o => !o)} className="w-full text-left flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
              <span className="text-xs">{historyOpen ? '▾' : '▸'}</span>
              <span>Lịch sử khám</span>
              <span className="text-xs text-gray-400 font-normal">({history.length} lượt trước)</span>
            </button>
            {historyOpen && (
              history.length === 0 ? (
                <div className="mt-2 text-xs text-gray-400 italic px-2">Bệnh nhân này chưa có lượt khám nào trước đó.</div>
              ) : (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
                  {history.map(h => (
                    <button key={h._id} onClick={() => onOpenOther && onOpenOther(h._id)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm">
                      <span className="text-xs text-gray-500 font-mono w-24 flex-shrink-0">{(h.createdAt || '').slice(0, 10) || '—'}</span>
                      <span className="text-xs text-gray-500 w-20 flex-shrink-0 truncate">{h.site || '—'}</span>
                      <span className="flex-1 truncate">
                        {h.packageName || <span className="text-gray-400">— chưa gán gói —</span>}
                        {h.assignedServices?.length > 0 && <span className="text-xs text-gray-500 ml-1">({h.assignedServices.length} DV)</span>}
                      </span>
                      <span className="font-mono text-blue-700 text-xs flex-shrink-0">{fmtMoney(h.billTotal)}đ</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${h.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {h.status === 'paid' ? 'Đã trả' : h.status === 'cancelled' ? 'Hủy' : 'Mở'}
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}
          </section>

          {/* Package section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Gói khám</h3>
              <button onClick={() => setShowAssignPackage(true)} className="text-xs text-blue-600 hover:text-blue-800">{enc.packageCode ? 'Đổi gói' : '+ Gán gói'}</button>
            </div>
            {enc.packageCode ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm">
                <div className="font-semibold text-purple-900">{enc.packageName} {enc.packageTier && <span className="text-xs font-normal text-purple-700">— {enc.packageTier}</span>}</div>
                <div className="text-xs text-purple-700 mt-0.5">{enc.packageCode}</div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic">Chưa gán gói. Bấm "Gán gói" để chọn.</div>
            )}
          </section>

          {/* Services section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Dịch vụ ({(enc.assignedServices || []).length})</h3>
              <button onClick={() => setShowAddItem('service')} className="text-xs text-blue-600 hover:text-blue-800">+ Thêm dịch vụ (à la carte)</button>
            </div>
            {(enc.assignedServices || []).length === 0 ? (
              <div className="text-xs text-gray-400 italic">Chưa có dịch vụ nào. Gán gói khám hoặc thêm dịch vụ rời.</div>
            ) : (
              <div className="space-y-1.5">
                {enc.assignedServices.map(s => {
                  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.pending
                  return (
                    <div key={s.serviceCode} className="border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                      onClick={() => setOpenServiceCode(s.serviceCode)}>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.cls} flex-shrink-0`}>{badge.label}</span>
                      <span className="text-sm flex-1">{s.serviceName}</span>
                      <span className="font-mono text-[10px] text-gray-400">{s.serviceCode}</span>
                      <span className="text-xs text-blue-600">Mở →</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Bill section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Bill ({(enc.billItems || []).length} mục)</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowAddItem('kinh')} className="text-xs text-emerald-600 hover:text-emerald-800">+ Kính</button>
                <button onClick={() => setShowAddItem('thuoc')} className="text-xs text-amber-600 hover:text-amber-800">+ Thuốc</button>
              </div>
            </div>
            {(enc.billItems || []).length === 0 ? (
              <div className="text-xs text-gray-400 italic">Chưa có mục nào trên bill.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr><th className="text-left py-1">Loại</th><th className="text-left">Tên</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">TT</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enc.billItems.map((b, i) => {
                    const kb = KIND_BADGE[b.kind] || { label: b.kind, cls: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded ${kb.cls}`}>{kb.label}</span></td>
                        <td className="py-1.5">{b.name}</td>
                        <td className="py-1.5 text-right">{b.qty}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{fmtMoney(b.unitPrice)}</td>
                        <td className="py-1.5 text-right font-mono">{fmtMoney(b.totalPrice)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={async () => {
                            if (!confirm(`Xóa "${b.name}"?`)) return
                            await api.delete(`/encounters/${enc._id}/bill-items/${i}`)
                            load()
                          }} className="text-red-500 hover:text-red-700 text-xs">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td colSpan={4} className="py-2 text-right">Tổng</td>
                    <td className="py-2 text-right font-mono text-blue-700">{fmtMoney(enc.billTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </div>
      </div>

      {showAssignPackage && <AssignPackageModal encounterId={enc._id} onDone={async () => { setShowAssignPackage(false); await load() }} onClose={() => setShowAssignPackage(false)} />}
      {openServiceCode && <ServiceFormModal encounterId={enc._id} serviceCode={openServiceCode} onDone={async () => { setOpenServiceCode(null); await load() }} onClose={() => setOpenServiceCode(null)} />}
      {showAddItem && <AddItemModal encounterId={enc._id} kind={showAddItem} onDone={async () => { setShowAddItem(null); await load() }} onClose={() => setShowAddItem(null)} />}
    </div>
  )
}

// ── Assign Package modal ──────────────────────────────────

function AssignPackageModal({ encounterId, onClose, onDone }) {
  const [packages, setPackages] = useState([])
  const [pkgCode, setPkgCode] = useState('')
  const [tierCode, setTierCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/catalogs/packages').then(r => setPackages(r.data || []))
  }, [])

  const pkg = packages.find(p => p.code === pkgCode)
  const tiers = pkg?.pricingTiers || []

  const submit = async () => {
    if (!pkgCode) return setErr('Chọn gói')
    if (tiers.length > 0 && !tierCode) return setErr('Chọn tier')
    setSaving(true); setErr('')
    try {
      await api.post(`/encounters/${encounterId}/assign-package`, { packageCode: pkgCode, tierCode })
      onDone()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title="Gán gói khám">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Gói</label>
          <select value={pkgCode} onChange={e => { setPkgCode(e.target.value); setTierCode('') }} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">— Chọn gói —</option>
            {packages.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        {tiers.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tier</label>
            <select value={tierCode} onChange={e => setTierCode(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">— Chọn tier —</option>
              {tiers.map(t => <option key={t.code} value={t.code}>{t.name} — {fmtMoney(t.totalPrice)} đ</option>)}
            </select>
          </div>
        )}
        {pkg && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Bundled services: {(pkg.bundledServices || []).join(', ') || '—'}
          </div>
        )}
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? 'Đang lưu...' : 'Áp dụng'}</button>
          <button onClick={onClose} className="ml-auto text-sm text-gray-500 hover:text-gray-700 px-4">Hủy</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Service result form modal ─────────────────────────────

function ServiceFormModal({ encounterId, serviceCode, onClose, onDone }) {
  const [fields, setFields] = useState([])
  const [output, setOutput] = useState({})
  const [status, setStatus] = useState('in_progress')
  const [serviceName, setServiceName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get(`/encounters/${encounterId}/service-fields/${serviceCode}`),
      api.get(`/encounters/${encounterId}`),
    ]).then(([f, e]) => {
      if (cancelled) return
      setFields(f.data.fields || [])
      const svc = (e.data.assignedServices || []).find(s => s.serviceCode === serviceCode)
      setOutput(svc?.output || {})
      setStatus(svc?.status === 'pending' ? 'in_progress' : (svc?.status || 'in_progress'))
      setServiceName(svc?.serviceName || serviceCode)
      setLoading(false)
    }).catch(e => { setErr(e.message); setLoading(false) })
    return () => { cancelled = true }
  }, [encounterId, serviceCode])

  const submit = async (newStatus) => {
    setSaving(true); setErr('')
    try {
      await api.put(`/encounters/${encounterId}/services/${serviceCode}`, { output, status: newStatus })
      onDone()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setSaving(false) }
  }

  if (loading) return <Modal onClose={onClose} title="Đang tải..."><div className="py-10 text-center text-gray-400">...</div></Modal>

  return (
    <Modal onClose={onClose} title={serviceName} subtitle={serviceCode} wide>
      <div className="space-y-3">
        {fields.length === 0 && <div className="text-xs text-gray-400 italic">Chưa định nghĩa output fields cho service này.</div>}
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className={f.type === 'textarea' ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
              <FieldInput field={f} value={output[f.key]} onChange={v => setOutput(o => ({ ...o, [f.key]: v }))} />
            </div>
          ))}
        </div>
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex gap-2 pt-3 border-t">
          <button onClick={() => submit('done')} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">✓ Lưu + Hoàn thành</button>
          <button onClick={() => submit('in_progress')} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">Lưu (đang tiếp tục)</button>
          <button onClick={() => submit('skipped')} disabled={saving} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Bỏ qua</button>
          <button onClick={onClose} className="ml-auto text-sm text-gray-500 hover:text-gray-700 px-4">Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

function FieldInput({ field, value, onChange }) {
  const cls = 'w-full border rounded px-2 py-1.5 text-sm'
  if (field.type === 'textarea') return <textarea rows={3} className={cls + ' resize-y'} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
  if (field.type === 'boolean') return <label className="flex items-center gap-2"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /><span className="text-sm text-gray-600">Có</span></label>
  if (field.type === 'select') {
    const opts = (field.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o)
    return (
      <select className={cls} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Chọn —</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (field.type === 'number') return <input type="number" step={field.step || 'any'} className={cls} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder={field.placeholder} />
  if (field.type === 'datetime') return <input type="datetime-local" className={cls} value={value || ''} onChange={e => onChange(e.target.value)} />
  return <input type="text" className={cls} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
}

// ── Add bill item (service à la carte / kinh / thuoc) ────

function AddItemModal({ encounterId, kind, onClose, onDone }) {
  // Catalog endpoints per kind. 'service' uses /catalogs/services with
  // basePrice; 'kinh' / 'thuoc' use their dedicated catalogs with sellPrice.
  const catalogPath = kind === 'service' ? '/catalogs/services' : kind === 'kinh' ? '/catalogs/kinh' : '/catalogs/thuoc'
  const priceField  = kind === 'service' ? 'basePrice' : 'sellPrice'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)
  const [qty, setQty] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [note, setNote] = useState('')
  const [freeform, setFreeform] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get(catalogPath).then(r => setItems(r.data || [])).finally(() => setLoading(false))
  }, [catalogPath])

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim()
    if (!ql) return items.slice(0, 30)
    return items.filter(i =>
      (i.name || '').toLowerCase().includes(ql) ||
      (i.code || '').toLowerCase().includes(ql) ||
      (i.brand || '').toLowerCase().includes(ql)
    ).slice(0, 50)
  }, [items, q])

  const onPick = (item) => {
    setPicked(item)
    setUnitPrice(item[priceField] || 0)
  }

  const submit = async () => {
    setSaving(true); setErr('')
    try {
      if (kind === 'service' && picked) {
        await api.post(`/encounters/${encounterId}/services`, { serviceCode: picked.code })
      } else if (picked) {
        await api.post(`/encounters/${encounterId}/bill-items`, {
          kind, code: picked.code, name: picked.name, qty, unitPrice, note,
        })
      } else if (freeform && freeName.trim()) {
        await api.post(`/encounters/${encounterId}/bill-items`, {
          kind, code: '', name: freeName, qty, unitPrice, note,
        })
      } else {
        setErr('Chọn 1 mục từ catalog hoặc nhập freeform'); setSaving(false); return
      }
      onDone()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi'); setSaving(false) }
  }

  const title = kind === 'service' ? 'Thêm dịch vụ' : kind === 'kinh' ? 'Thêm kính' : 'Thêm thuốc'

  return (
    <Modal onClose={onClose} title={title} wide>
      <div className="space-y-3">
        {!picked && !freeform && (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên / mã / brand..." className="w-full border rounded px-3 py-2 text-sm" autoFocus />
            <div className="border rounded max-h-72 overflow-y-auto divide-y">
              {loading ? (
                <div className="p-3 text-center text-gray-400 text-sm">Đang tải catalog...</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-center text-gray-400 text-sm">Không có mục nào khớp</div>
              ) : filtered.map(item => (
                <button key={item.code} onClick={() => onPick(item)} className="w-full text-left px-3 py-2 hover:bg-blue-50">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">{item.code}</span>
                    <span className="font-medium text-sm flex-1">{item.name}</span>
                    <span className="font-mono text-sm text-blue-700">{fmtMoney(item[priceField])} đ</span>
                  </div>
                  {(item.brand || item.spec || item.category) && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {[item.brand, item.spec, item.category].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
            {kind !== 'service' && (
              <button onClick={() => setFreeform(true)} className="text-xs text-blue-600 hover:text-blue-800">
                + Nhập freeform (mục không có trong catalog)
              </button>
            )}
          </>
        )}

        {picked && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{picked.name}</div>
                <div className="text-xs text-gray-500 font-mono">{picked.code}</div>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-blue-600 hover:text-blue-800">Đổi</button>
            </div>
          </div>
        )}

        {freeform && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-yellow-800 font-semibold">Mục freeform (không có catalog code)</div>
              <button onClick={() => { setFreeform(false); setFreeName('') }} className="text-xs text-yellow-700 hover:text-yellow-900">← Quay lại catalog</button>
            </div>
            <input value={freeName} onChange={e => setFreeName(e.target.value)} placeholder={kind === 'kinh' ? 'vd: Gọng Rayban RB1234' : 'vd: Nước rửa kính loại khác'} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
        )}

        {(picked || freeform) && (
          <>
            {kind !== 'service' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Số lượng</label>
                  <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={qty} onChange={e => setQty(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Đơn giá (VND)</label>
                  <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value) || 0)} />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </>
        )}

        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={submit} disabled={saving || (!picked && !freeform)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? 'Đang lưu...' : 'Thêm vào bill'}</button>
          <button onClick={onClose} className="ml-auto text-sm text-gray-500 hover:text-gray-700 px-4">Hủy</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Generic modal ─────────────────────────────────────────

function Modal({ children, onClose, title, subtitle, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'} w-full max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            {subtitle && <div className="text-xs text-gray-400 font-mono mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
