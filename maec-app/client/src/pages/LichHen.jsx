import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const SITES = ['Trung Kính', 'Kim Giang']

// 4 documented exam workflows from CLAUDE.md. Drives default duration
// + colour pill. Free-form on the model so future workflows can be added
// from a catalog later without a code change.
const EXAM_TYPES = [
  { value: 'Khám mắt cơ bản', dur: 30, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'Khám khúc xạ + thị giác hai mắt', dur: 90, color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'Khám kính tiếp xúc (mới)', dur: 60, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'Tái khám kính tiếp xúc', dur: 30, color: 'bg-teal-100 text-teal-800 border-teal-200' },
]
const examTypeMeta = (t) => EXAM_TYPES.find(e => e.value === t) || { color: 'bg-gray-100 text-gray-700 border-gray-200', dur: 30 }

const STATUS = {
  scheduled:   { label: 'Đã đặt',     pill: 'bg-blue-100 text-blue-800' },
  confirmed:   { label: 'Đã xác nhận', pill: 'bg-indigo-100 text-indigo-800' },
  arrived:     { label: 'Đã đến',     pill: 'bg-emerald-100 text-emerald-800' },
  in_progress: { label: 'Đang khám',  pill: 'bg-amber-100 text-amber-800' },
  completed:   { label: 'Đã khám',    pill: 'bg-gray-200 text-gray-700' },
  cancelled:   { label: 'Đã hủy',     pill: 'bg-rose-100 text-rose-700 line-through' },
  no_show:     { label: 'Vắng',       pill: 'bg-rose-100 text-rose-800' },
}
const REMINDER = {
  pending:  { label: 'Chưa nhắc', pill: 'bg-amber-100 text-amber-800' },
  reminded: { label: 'Đã nhắc',  pill: 'bg-emerald-100 text-emerald-800' },
  failed:   { label: 'Không liên lạc được', pill: 'bg-rose-100 text-rose-700' },
  skipped:  { label: 'Bỏ qua',   pill: 'bg-gray-200 text-gray-600' },
}

const todayLocal = () => new Date().toLocaleDateString('sv-SE')
const tomorrowLocal = () => {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv-SE')
}
const fmtDate = (d) => {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
const fmtTime = (iso) => iso ? iso.slice(11, 16) : '--:--'

// ── Page shell ─────────────────────────────────────────────
export default function LichHen() {
  const [tab, setTab] = useState('calendar') // calendar | reminder
  return (
    <div className="p-2 sm:p-4 max-w-[1600px] mx-auto h-full flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">Lịch hẹn</h1>
          <p className="text-xs text-gray-500 mt-0.5">Đặt lịch · Nhắc lịch · Tiếp đón từ lịch hẹn</p>
        </div>
        <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setTab('calendar')}
            className={`px-3 py-1.5 ${tab === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >📅 Lịch khám</button>
          <button
            onClick={() => setTab('reminder')}
            className={`px-3 py-1.5 ${tab === 'reminder' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >🔔 Nhắc lịch</button>
        </div>
      </div>
      {tab === 'calendar' ? <DayCalendarView /> : <ReminderView />}
    </div>
  )
}

// ── Day calendar (per-site columns, vertical time axis) ───
function DayCalendarView() {
  const [date, setDate] = useState(todayLocal())
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [openAppt, setOpenAppt] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/appointments', { params: { date } })
      setAppts(r.data || [])
    } catch (e) {
      setAppts([])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [date])

  const stepDate = (delta) => {
    const d = new Date(date); d.setDate(d.getDate() + delta)
    setDate(d.toLocaleDateString('sv-SE'))
  }

  const bySite = useMemo(() => {
    const map = Object.fromEntries(SITES.map(s => [s, []]))
    for (const a of appts) {
      if (!map[a.site]) map[a.site] = []
      map[a.site].push(a)
    }
    return map
  }, [appts])

  const otherSites = useMemo(() => Object.keys(bySite).filter(s => !SITES.includes(s)), [bySite])
  const siteCols = [...SITES, ...otherSites]

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <button onClick={() => stepDate(-1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm" title="Hôm trước">◀</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        <button onClick={() => stepDate(1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm" title="Hôm sau">▶</button>
        <button onClick={() => setDate(todayLocal())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">Hôm nay</button>
        <span className="ml-2 text-sm font-medium text-gray-700">{fmtDate(date)}</span>
        <span className="text-xs text-gray-400">{loading ? '…' : `${appts.length} lịch hẹn`}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200" title="Làm mới">⟳</button>
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">+ Đặt lịch</button>
        </div>
      </div>

      {/* Per-site columns: time axis on the left, events laid out by hour */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="grid border-b border-gray-200 sticky top-0 bg-gray-50 text-xs uppercase tracking-wide font-semibold text-gray-600 z-10"
             style={{ gridTemplateColumns: `60px repeat(${siteCols.length}, minmax(220px, 1fr))` }}>
          <div className="px-2 py-2 border-r border-gray-200">Giờ</div>
          {siteCols.map(s => (
            <div key={s} className="px-3 py-2 border-r border-gray-200 last:border-r-0 flex items-center justify-between">
              <span>{s}</span>
              <span className="text-[10px] font-normal text-gray-400">{(bySite[s] || []).filter(a => a.status !== 'cancelled' && a.status !== 'no_show').length}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          <CalendarGrid siteCols={siteCols} bySite={bySite} onPick={setOpenAppt} />
        </div>
      </div>

      {showCreate && (
        <AppointmentForm
          mode="create"
          defaultDate={date}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {openAppt && (
        <AppointmentDetail
          appointment={openAppt}
          onClose={() => setOpenAppt(null)}
          onMutated={() => { setOpenAppt(null); load() }}
        />
      )}
    </div>
  )
}

// Hourly grid 7:00 → 18:00. Each row = 30 min. Events render as absolutely-
// positioned cards inside their site column. Height ≈ duration / 30 * 32px.
function CalendarGrid({ siteCols, bySite, onPick }) {
  const HOUR_START = 7
  const HOUR_END = 18
  const SLOT_PX = 32 // half-hour
  const slots = []
  for (let h = HOUR_START; h < HOUR_END; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  const totalHeight = slots.length * SLOT_PX

  const offsetFor = (iso) => {
    const t = iso?.slice(11, 16) || '07:00'
    const [h, m] = t.split(':').map(Number)
    return ((h - HOUR_START) * 2 + m / 30) * SLOT_PX
  }
  const heightFor = (dur) => Math.max(SLOT_PX - 2, ((dur || 30) / 30) * SLOT_PX - 2)

  return (
    <div className="grid relative" style={{ gridTemplateColumns: `60px repeat(${siteCols.length}, minmax(220px, 1fr))`, minHeight: totalHeight }}>
      {/* Time axis */}
      <div className="border-r border-gray-200 text-[11px] text-gray-500 font-mono">
        {slots.map((t, i) => (
          <div key={t} className={`h-8 px-1 text-right pr-2 ${t.endsWith(':00') ? 'border-t border-gray-200 pt-0.5' : ''}`}>
            {t.endsWith(':00') ? t : ''}
          </div>
        ))}
      </div>
      {/* Per-site columns */}
      {siteCols.map(site => (
        <div key={site} className="relative border-r border-gray-200 last:border-r-0">
          {/* Hour grid lines */}
          {slots.map((t, i) => (
            <div key={t} className={`h-8 ${t.endsWith(':00') ? 'border-t border-gray-200' : 'border-t border-gray-50'}`} />
          ))}
          {/* Events */}
          {(bySite[site] || []).map(a => {
            const meta = examTypeMeta(a.examType)
            const cancelled = a.status === 'cancelled' || a.status === 'no_show'
            return (
              <button
                key={a._id}
                onClick={() => onPick(a)}
                className={`absolute left-1 right-1 rounded-md border ${meta.color} ${cancelled ? 'opacity-40 line-through' : ''} text-left px-2 py-1 hover:shadow-md hover:z-10 transition-shadow overflow-hidden`}
                style={{ top: offsetFor(a.scheduledAt), height: heightFor(a.duration) }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-mono font-semibold">{fmtTime(a.scheduledAt)}</span>
                  <span className="text-xs font-medium truncate flex-1">{a.patientName || '—'}</span>
                </div>
                <div className="text-[10px] truncate opacity-80">{a.examType || a.modality || ''}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[10px] px-1 rounded ${STATUS[a.status]?.pill || 'bg-gray-100 text-gray-700'}`}>{STATUS[a.status]?.label || a.status}</span>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Reminder view (tomorrow's queue + manual đã nhắc tick) ─
function ReminderView() {
  const [date, setDate] = useState(tomorrowLocal())
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/appointments/upcoming-reminders', { params: { date } })
      setAppts(r.data?.appointments || [])
    } catch { setAppts([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [date])

  const tickReminded = async (id, status, method = '') => {
    try {
      await api.post(`/appointments/${id}/remind`, { status, method })
      load()
    } catch (e) { alert(e.response?.data?.error || 'Lỗi cập nhật nhắc lịch') }
  }

  const counts = useMemo(() => {
    const c = { total: appts.length, pending: 0, reminded: 0, failed: 0, skipped: 0 }
    appts.forEach(a => { c[a.reminderStatus || 'pending'] = (c[a.reminderStatus || 'pending'] || 0) + 1 })
    return c
  }, [appts])

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        <button onClick={() => setDate(tomorrowLocal())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">Ngày mai</button>
        <button onClick={() => setDate(todayLocal())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">Hôm nay</button>
        <span className="ml-2 text-sm font-medium text-gray-700">{fmtDate(date)}</span>
        <div className="flex items-center gap-3 ml-2 text-xs">
          <span><b>{counts.total}</b> tổng</span>
          <span className="text-amber-700"><b>{counts.pending || 0}</b> chưa nhắc</span>
          <span className="text-emerald-700"><b>{counts.reminded || 0}</b> đã nhắc</span>
          {counts.failed > 0 && <span className="text-rose-700"><b>{counts.failed}</b> không liên lạc được</span>}
        </div>
        <button onClick={load} className="ml-auto px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200" title="Làm mới">⟳</button>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-600 font-semibold">
                <th className="px-3 py-2">Giờ</th>
                <th className="px-3 py-2">Bệnh nhân</th>
                <th className="px-3 py-2">Liên hệ</th>
                <th className="px-3 py-2">Cơ sở · Loại khám</th>
                <th className="px-3 py-2">Nhắc</th>
                <th className="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Đang tải…</td></tr>}
              {!loading && appts.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Không có lịch hẹn cần nhắc cho ngày này.</td></tr>
              )}
              {appts.map(a => {
                const r = REMINDER[a.reminderStatus || 'pending']
                return (
                  <tr key={a._id} className="border-t border-gray-100 hover:bg-blue-50/30">
                    <td className="px-3 py-2 font-mono text-sm">{fmtTime(a.scheduledAt)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{a.patientName || '—'}</div>
                      {a.guardianName && <div className="text-xs text-gray-500">PH: {a.guardianName}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      <div>{a.phone || '—'}</div>
                      {a.guardianPhone && <div>{a.guardianPhone}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{a.site}</div>
                      <div className="text-gray-500">{a.examType || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${r.pill}`}>{r.label}</span>
                      {a.remindedAt && <div className="text-[10px] text-gray-400 mt-0.5">{a.remindMethod || ''} · {a.remindedBy || ''}</div>}
                    </td>
                    <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                      {a.reminderStatus !== 'reminded' && (
                        <>
                          <button onClick={() => tickReminded(a._id, 'reminded', 'call')} className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100" title="Đã gọi">📞 Gọi</button>
                          <button onClick={() => tickReminded(a._id, 'reminded', 'sms')} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100" title="Đã nhắn">💬 Nhắn</button>
                          <button onClick={() => tickReminded(a._id, 'failed')} className="text-xs px-2 py-1 bg-rose-50 text-rose-700 rounded hover:bg-rose-100" title="Không liên lạc được">⚠</button>
                        </>
                      )}
                      {a.reminderStatus === 'reminded' && (
                        <button onClick={() => tickReminded(a._id, 'pending')} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="Bỏ đánh dấu">↺</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Patient typeahead (also offers create-new fallback) ───
function PatientPicker({ value, onPick, onClear }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get('/registration/patients', { params: { q, limit: 8 } })
        setResults(r.data || [])
        setOpen(true)
      } catch { setResults([]) }
      setLoading(false)
    }, 200)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [q])

  if (value) {
    return (
      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-blue-50 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-800">{value.name}</div>
          <div className="text-xs text-gray-600 font-mono">{value.patientId || value._id} · {value.phone || '—'}</div>
        </div>
        <button onClick={onClear} className="text-blue-600 hover:text-blue-900 text-sm" title="Bỏ chọn">×</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Tìm tên / SĐT / mã BN..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
      />
      {loading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {results.map(p => (
            <button key={p._id} type="button" onMouseDown={() => { onPick(p); setQ(''); setResults([]); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0">
              <div className="text-sm font-medium text-gray-800">{p.name}</div>
              <div className="text-xs text-gray-500 font-mono">{p.patientId || p._id} · {p.phone || '—'}</div>
            </button>
          ))}
        </div>
      )}
      {open && q && !loading && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 px-3 py-2 text-xs text-gray-500">
          Không tìm thấy bệnh nhân. Có thể nhập tên + SĐT bên dưới để tạo lịch tạm (chưa có hồ sơ).
        </div>
      )}
    </div>
  )
}

// ── Đặt lịch / Sửa lịch form ───────────────────────────────
function AppointmentForm({ mode, defaultDate, defaultSite, existing, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [picked, setPicked] = useState(existing?.patientId ? { _id: existing.patientId, patientId: existing.patientId, name: existing.patientName, phone: existing.phone } : null)
  const [walkInName, setWalkInName] = useState(existing?.patientName || '')
  const [walkInPhone, setWalkInPhone] = useState(existing?.phone || '')
  const [site, setSite] = useState(existing?.site || defaultSite || SITES[0])
  const [examType, setExamType] = useState(existing?.examType || EXAM_TYPES[0].value)
  const [date, setDate] = useState(existing?.scheduledAt?.slice(0, 10) || defaultDate || todayLocal())
  const [time, setTime] = useState(existing?.scheduledAt?.slice(11, 16) || '09:00')
  const [duration, setDuration] = useState(existing?.duration || examTypeMeta(EXAM_TYPES[0].value).dur)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Auto-update duration when examType changes (unless user has manually
  // overridden — we only sync from the canonical EXAM_TYPES default)
  useEffect(() => {
    setDuration(examTypeMeta(examType).dur)
  }, [examType])

  const submit = async () => {
    setErr('')
    if (!picked && !walkInName) { setErr('Cần chọn bệnh nhân hoặc nhập tên khách'); return }
    if (!date || !time) { setErr('Thiếu ngày hoặc giờ hẹn'); return }
    setSaving(true)
    try {
      const body = {
        site, examType, duration: Number(duration) || 30,
        scheduledAt: `${date}T${time}:00`,
        notes,
      }
      if (picked) {
        body.patientId = picked._id || picked.patientId
      } else {
        body.patientName = walkInName
        body.phone = walkInPhone
      }
      if (isEdit) {
        await api.put(`/appointments/${existing._id}`, body)
      } else {
        await api.post('/appointments', body)
      }
      onSaved && onSaved()
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi lưu lịch hẹn')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="font-semibold text-gray-800">{isEdit ? 'Sửa lịch hẹn' : 'Đặt lịch hẹn mới'}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Bệnh nhân</label>
            <PatientPicker value={picked} onPick={setPicked} onClear={() => setPicked(null)} />
            {!picked && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="Hoặc tên khách (chưa có hồ sơ)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} placeholder="SĐT" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cơ sở</label>
              <select value={site} onChange={e => setSite(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {SITES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Loại khám</label>
              <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Giờ</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} step="900" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Thời lượng (phút)</label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="15" step="15" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Triệu chứng, yêu cầu, lưu ý..." />
          </div>

          {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{err}</div>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
          <button onClick={submit} disabled={saving} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-semibold">{saving ? 'Đang lưu…' : (isEdit ? 'Lưu thay đổi' : 'Đặt lịch')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Appointment detail (view + tiếp đón / cancel / reschedule) ─
function AppointmentDetail({ appointment, onClose, onMutated }) {
  const navigate = useNavigate()
  const [appt, setAppt] = useState(appointment)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)

  const meta = examTypeMeta(appt.examType)
  const status = STATUS[appt.status] || { label: appt.status, pill: 'bg-gray-100 text-gray-700' }

  const checkIn = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await api.post(`/appointments/${appt._id}/check-in`)
      // Hand off to Khám with the encounter open. Kham reads ?id= from URL
      // and auto-opens that encounter in the right pane.
      navigate(`/kham?id=${encodeURIComponent(r.data.encounterId)}`)
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi tiếp đón')
    }
    setBusy(false)
  }
  const cancel = async () => {
    const reason = window.prompt('Lý do hủy lịch?')
    if (reason === null) return
    setErr(''); setBusy(true)
    try {
      await api.post(`/appointments/${appt._id}/cancel`, { reason })
      onMutated && onMutated()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi hủy lịch') }
    setBusy(false)
  }
  const noShow = async () => {
    if (!window.confirm('Đánh dấu bệnh nhân không đến?')) return
    setErr(''); setBusy(true)
    try {
      await api.post(`/appointments/${appt._id}/no-show`)
      onMutated && onMutated()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi cập nhật') }
    setBusy(false)
  }
  const confirm = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await api.put(`/appointments/${appt._id}`, { status: 'confirmed' })
      setAppt(r.data); onMutated && onMutated()
    } catch (e) { setErr(e.response?.data?.error || 'Lỗi xác nhận') }
    setBusy(false)
  }

  if (editing) {
    return <AppointmentForm
      mode="edit"
      existing={appt}
      onClose={() => setEditing(false)}
      onSaved={() => { setEditing(false); onMutated && onMutated() }}
    />
  }

  const final = ['cancelled', 'no_show', 'completed'].includes(appt.status)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{appt.patientName || '—'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${status.pill}`}>{status.label}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">Thời gian</div>
              <div className="font-medium">{fmtDate(appt.scheduledAt?.slice(0, 10))} · {fmtTime(appt.scheduledAt)} ({appt.duration || 30} phút)</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Cơ sở</div>
              <div className="font-medium">{appt.site}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500">Loại khám</div>
              <div><span className={`inline-block text-xs px-1.5 py-0.5 rounded border ${meta.color}`}>{appt.examType || '—'}</span></div>
            </div>
            {appt.phone && <div>
              <div className="text-xs text-gray-500">SĐT bệnh nhân</div>
              <div className="font-mono">{appt.phone}</div>
            </div>}
            {appt.guardianName && <div>
              <div className="text-xs text-gray-500">Phụ huynh / Người nhà</div>
              <div>{appt.guardianName} {appt.guardianPhone && `· ${appt.guardianPhone}`}</div>
            </div>}
            {appt.notes && <div className="col-span-2">
              <div className="text-xs text-gray-500">Ghi chú</div>
              <div className="whitespace-pre-wrap">{appt.notes}</div>
            </div>}
            {appt.encounterId && <div className="col-span-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 text-xs">
              Đã tiếp đón → lượt khám <span className="font-mono">{appt.encounterId}</span>
              <button onClick={() => navigate(`/kham?id=${encodeURIComponent(appt.encounterId)}`)} className="ml-2 text-blue-600 hover:underline">Mở</button>
            </div>}
            {appt.cancelReason && <div className="col-span-2 text-xs text-rose-700">Lý do hủy: {appt.cancelReason}</div>}
          </div>
          {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{err}</div>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            {!final && <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded">Sửa</button>}
            {!final && appt.status !== 'arrived' && appt.status !== 'in_progress' && <button onClick={cancel} disabled={busy} className="px-3 py-1.5 text-sm text-rose-700 border border-rose-200 hover:bg-rose-50 rounded">Hủy lịch</button>}
            {!final && appt.status !== 'arrived' && appt.status !== 'in_progress' && <button onClick={noShow} disabled={busy} className="px-3 py-1.5 text-sm text-rose-700 border border-rose-200 hover:bg-rose-50 rounded">Vắng</button>}
          </div>
          <div className="flex gap-2 ml-auto">
            {appt.status === 'scheduled' && <button onClick={confirm} disabled={busy} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded">Xác nhận</button>}
            {!final && appt.status !== 'arrived' && appt.status !== 'in_progress' && <button onClick={checkIn} disabled={busy || !appt.patientId} title={!appt.patientId ? 'Lịch hẹn khách vãng lai — vui lòng tạo bệnh nhân trước' : ''} className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-semibold">Tiếp đón →</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
