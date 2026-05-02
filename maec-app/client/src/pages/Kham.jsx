import React, { useEffect, useMemo, useRef, useState } from 'react'
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

// ── Phiếu khám print (A4 visit summary) ─────────────────────────────────────
// Opens a dedicated window with the clinic letterhead + BN info + packages +
// services-with-results + bill + signature lines, then auto-prints. Works for
// any encounter status; fields that are empty (services with no output, no
// discount, etc.) are gracefully omitted.

function printVisitReport(enc) {
  const w = window.open('', '_blank', 'width=820,height=1100')
  if (!w) { alert('Trình duyệt chặn cửa sổ in — vui lòng cho phép pop-up.'); return }
  const now = new Date()
  const printedAt = now.toLocaleString('vi-VN')
  const visitAt = enc.createdAt ? new Date(enc.createdAt).toLocaleString('vi-VN') : '—'
  const age = enc.dob
    ? Math.floor((Date.now() - new Date(enc.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const gender = enc.gender === 'M' ? 'Nam' : enc.gender === 'F' ? 'Nữ' : '—'
  const esc = (s) => String(s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
  const money = (n) => Number(n || 0).toLocaleString('vi-VN')

  const formatOutput = (output) => {
    if (!output || typeof output !== 'object') return ''
    const entries = Object.entries(output).filter(([, v]) => v != null && v !== '')
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `<span class="mono">${esc(k)}: ${esc(String(v))}</span>`).join(' · ')
  }

  const packagesHtml = (enc.packages || []).length === 0 ? '' : `
    <div class="section">
      <h3>Gói khám (${enc.packages.length})</h3>
      <ul class="pkgs">
        ${enc.packages.map(p => `<li><strong>${esc(p.name)}</strong>${p.tier ? ` — ${esc(p.tier)}` : ''} <span class="mono small muted">${esc(p.code)}</span></li>`).join('')}
      </ul>
    </div>`

  const services = enc.assignedServices || []
  const statusLabel = (s) => s === 'done' ? 'Hoàn thành' : s === 'in_progress' ? 'Đang làm' : s === 'skipped' ? 'Bỏ qua' : 'Chờ'
  const servicesHtml = services.length === 0 ? '' : `
    <div class="section">
      <h3>Dịch vụ (${services.length})</h3>
      <table class="data">
        <thead><tr><th class="w8">#</th><th>Dịch vụ</th><th class="w20">Tình trạng</th><th>Kết quả</th></tr></thead>
        <tbody>
          ${services.map((s, i) => {
            const out = formatOutput(s.output)
            return `<tr>
              <td class="c">${i + 1}</td>
              <td><strong>${esc(s.serviceName)}</strong> <span class="mono small muted">${esc(s.serviceCode)}</span></td>
              <td class="c">${statusLabel(s.status)}</td>
              <td>${out || '<span class="muted">—</span>'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`

  const billItems = enc.billItems || []
  const subtotal = enc.billTotal || 0
  const discPct = enc.discountPercent || 0
  const discAmt = discPct > 0 ? Math.round(subtotal * discPct / 100) : (enc.discountAmount || 0)
  const grand = Math.max(0, subtotal - discAmt)
  const kindLabel = (k) => ({ service: 'Dịch vụ', package: 'Gói khám', kinh: 'Kính', thuoc: 'Thuốc' }[k] || k)
  const billHtml = billItems.length === 0 ? '' : `
    <div class="section">
      <h3>Bảng giá / Hóa đơn</h3>
      <table class="data">
        <thead><tr>
          <th class="w8">#</th><th class="w16">Loại</th><th>Tên</th>
          <th class="w8 r">SL</th><th class="w16 r">Đơn giá</th><th class="w20 r">Thành tiền</th>
        </tr></thead>
        <tbody>
          ${billItems.map((b, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="small">${kindLabel(b.kind)}</td>
            <td>${esc(b.name)}</td>
            <td class="r">${b.qty || 1}</td>
            <td class="r mono small">${money(b.unitPrice)}</td>
            <td class="r mono"><strong>${money(b.totalPrice)}</strong></td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5" class="r">Tạm tính</td><td class="r mono">${money(subtotal)}</td></tr>
          ${discAmt > 0 ? `<tr><td colspan="5" class="r">Giảm giá${discPct > 0 ? ` (${discPct}%)` : ''}${enc.discountReason ? ` — ${esc(enc.discountReason)}` : ''}</td><td class="r mono" style="color:#dc2626">−${money(discAmt)}</td></tr>` : ''}
          <tr class="grand"><td colspan="5" class="r"><strong>Tổng cộng</strong></td><td class="r mono"><strong>${money(grand)} đ</strong></td></tr>
        </tfoot>
      </table>
    </div>`

  const paidBanner = enc.status === 'paid'
    ? `<div class="paid">Đã thanh toán · ${esc(enc.paidByName || '')} · ${enc.paidAt ? new Date(enc.paidAt).toLocaleString('vi-VN') : ''}</div>`
    : enc.status === 'cancelled'
      ? `<div class="cancelled">Đã hủy${enc.cancelReason ? ` — ${esc(enc.cancelReason)}` : ''}</div>`
      : ''

  const html = `
<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Phiếu khám ${esc(enc.patientName || '')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 14px; }
  .clinic { font-weight: 700; font-size: 17px; color: #1e3a5f; letter-spacing: -0.2px; }
  .clinic-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .meta { text-align: right; font-size: 11px; color: #444; }
  .meta .num { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 12px; font-weight: 700; color: #1e3a5f; }
  h1 { font-size: 20px; text-align: center; margin: 10px 0 4px; letter-spacing: 1px; color: #1e3a5f; }
  .subtitle { text-align: center; font-size: 11px; color: #666; margin-bottom: 14px; }
  .info { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .info td { padding: 4px 6px; vertical-align: top; font-size: 12px; }
  .info td.k { color: #666; width: 100px; font-size: 11px; }
  .info td.v { font-weight: 500; }
  .section { margin-top: 12px; page-break-inside: avoid; }
  .section h3 { font-size: 12px; color: #1e3a5f; margin: 0 0 6px; padding: 4px 8px; background: #eef2f7; border-left: 3px solid #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px; }
  .pkgs { margin: 0; padding-left: 20px; }
  .pkgs li { padding: 2px 0; }
  .conclusion { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; background: #fefce8; font-size: 12px; line-height: 1.5; min-height: 40px; white-space: pre-wrap; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th { background: #f3f4f6; color: #374151; font-size: 11px; font-weight: 600; padding: 5px 6px; border-bottom: 1.5px solid #1e3a5f; text-align: left; }
  table.data td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; font-size: 12px; vertical-align: top; }
  table.data td.c { text-align: center; }
  table.data td.r, table.data th.r { text-align: right; }
  table.data .mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; }
  table.data .small { font-size: 10px; }
  table.data .muted { color: #9ca3af; }
  table.data .w8  { width: 32px; }
  table.data .w16 { width: 80px; }
  table.data .w20 { width: 110px; }
  table.data tfoot td { padding: 4px 6px; font-size: 12px; }
  table.data tfoot tr.grand td { font-size: 13px; padding-top: 6px; border-top: 2px solid #1e3a5f; color: #1e3a5f; }
  .signs { display: flex; justify-content: space-around; margin-top: 36px; padding-top: 8px; }
  .signs > div { width: 45%; text-align: center; font-size: 12px; }
  .signs .role { color: #666; font-size: 11px; margin-bottom: 48px; }
  .signs .hint { font-size: 10px; color: #999; margin-top: 2px; font-style: italic; }
  .footer { margin-top: 14px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  .paid { margin: 0 0 10px; padding: 5px 10px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .cancelled { margin: 0 0 10px; padding: 5px 10px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 11px; font-weight: 600; }
  @media print { .no-print { display: none; } }
</style>
</head><body>

<div class="header">
  <div>
    <div class="clinic">PHÒNG KHÁM MẮT MINH ANH${enc.site ? ' — ' + esc(String(enc.site).toUpperCase()) : ''}</div>
    <div class="clinic-sub">Hệ thống quản lý lâm sàng MAEC</div>
  </div>
  <div class="meta">
    <div>Mã lượt khám: <span class="num">${esc(enc._id || '')}</span></div>
    <div>Ngày khám: ${esc(visitAt)}</div>
    <div>In ngày: ${esc(printedAt)}</div>
  </div>
</div>

<h1>PHIẾU KHÁM</h1>
<div class="subtitle">Bệnh nhân giữ phiếu này để theo dõi và đối chiếu lần sau</div>

${paidBanner}

<table class="info"><tbody>
  <tr>
    <td class="k">Họ và tên</td><td class="v"><strong>${esc(enc.patientName || '')}</strong></td>
    <td class="k">Mã BN</td><td class="v mono">${esc(enc.patientId || '')}</td>
  </tr>
  <tr>
    <td class="k">Ngày sinh</td>
    <td class="v">${enc.dob ? esc(enc.dob.slice(0, 10).split('-').reverse().join('/')) : '—'}${age != null ? ` · ${age} tuổi` : ''}</td>
    <td class="k">Giới tính</td><td class="v">${gender}</td>
  </tr>
  ${enc.clinicalInfo ? `<tr>
    <td class="k">Lâm sàng</td><td class="v" colspan="3">${esc(enc.clinicalInfo)}</td>
  </tr>` : ''}
</tbody></table>

${enc.conclusion ? `
<div class="section">
  <h3>Kết luận của bác sĩ</h3>
  <div class="conclusion">${esc(enc.conclusion).replace(/\n/g, '<br>')}</div>
</div>` : ''}
${packagesHtml}
${servicesHtml}
${billHtml}

<div class="signs">
  <div>
    <div class="role">Bệnh nhân / Người nhà</div>
    <div><strong>${esc(enc.patientName || '')}</strong></div>
    <div class="hint">(ký, ghi rõ họ tên)</div>
  </div>
  <div>
    <div class="role">Bác sĩ phụ trách</div>
    <div>&nbsp;</div>
    <div class="hint">(ký, ghi rõ họ tên)</div>
  </div>
</div>

<div class="footer">Minh Anh Eye Clinic · ${esc(printedAt)} · Lượt khám ${esc(enc._id || '')}</div>

<script>
  window.onload = () => {
    window.focus()
    window.print()
    setTimeout(() => window.close(), 400)
  }
</script>

</body></html>`

  w.document.write(html)
  w.document.close()
}

// Encounter lifecycle for the Khám list. "Đang khám" is the active work
// queue (anything not yet paid or cancelled — receptionist-checked-in,
// in-progress with KTV/BS, clinical-done waiting for payment). "Hoàn thành"
// is settled at Thu Ngân; "Đã hủy" is cancelled mid-flow. Statuses
// pending_read..verified are radiology-era leftovers — kept in "active"
// for safety in case any old encounter still uses them.
const STATUS_GROUPS = {
  active:    { label: 'Đang khám',  statuses: ['scheduled', 'in_progress', 'pending_read', 'reading', 'reported', 'verified', 'completed'] },
  paid:      { label: 'Hoàn thành', statuses: ['paid'] },
  cancelled: { label: 'Đã hủy',     statuses: ['cancelled'] },
  all:       { label: 'Tất cả',     statuses: null },
}
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
  // Status group — defaults to "Đang khám" so the Khám tab is the active
  // work queue, not a dump of every encounter ever. Switch to "Hoàn thành"
  // for paid history, "Đã hủy" for cancellations, "Tất cả" for everything.
  const [statusGroup, setStatusGroup] = useState(searchParams.get('status') || 'active')
  // Patient filter — when set, server returns full lifetime history for that
  // patient and ignores from/to. Cleared by clicking the "× BN" pill.
  const [patientFilter, setPatientFilter] = useState(() => {
    const pid = searchParams.get('patientId')
    return pid ? { patientId: pid, name: searchParams.get('patientName') || pid } : null
  })

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
      const params = {}
      if (patientFilter) {
        params.patientId = patientFilter.patientId
      } else {
        params.from = from
        params.to = to
      }
      if (site) params.site = site
      const statuses = STATUS_GROUPS[statusGroup]?.statuses
      if (statuses) params.status = statuses.join(',')
      const r = await api.get('/encounters', { params })
      setList(r.data || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [from, to, site, patientFilter, statusGroup])

  // Sync filter + open-drawer state to URL (deep-link survives refresh)
  useEffect(() => {
    const next = {}
    if (openId) next.id = openId
    if (patientFilter) {
      next.patientId = patientFilter.patientId
      if (patientFilter.name) next.patientName = patientFilter.name
    }
    if (period !== 'today') next.period = period
    if (period === 'custom') { next.from = from; next.to = to }
    if (site) next.site = site
    if (statusGroup !== 'active') next.status = statusGroup
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, period, from, to, site, patientFilter, statusGroup])

  // Idempotent check-in toast — Đăng ký redirects with ?existing=1 when the
  // server returned an already-open encounter instead of creating one.
  const [existingToast, setExistingToast] = useState(searchParams.get('existing') === '1')
  useEffect(() => {
    if (!existingToast) return
    const t = setTimeout(() => {
      setExistingToast(false)
      const next = Object.fromEntries(searchParams.entries())
      delete next.existing
      setSearchParams(next, { replace: true })
    }, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingToast])

  const selectCls = "border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white hover:border-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-2 sm:-m-4 bg-gray-50 p-2 sm:p-4 gap-2">
      {/* Single compact toolbar: title + filter dropdowns + patient search + actions */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800 mr-2"
          title="Hàng đợi lượt khám đang hoạt động — gán gói, thực hiện dịch vụ, thêm kính/thuốc vào bill.">
          Khám
        </h1>

        <select value={statusGroup} onChange={e => setStatusGroup(e.target.value)} className={selectCls}>
          {Object.entries(STATUS_GROUPS).map(([k, g]) => (
            <option key={k} value={k}>{g.label}</option>
          ))}
        </select>

        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className={`${selectCls} ${patientFilter ? 'opacity-40 pointer-events-none' : ''}`}>
          {Object.entries(PERIOD_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        {period === 'custom' && !patientFilter && (
          <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selectCls} />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selectCls} />
          </>
        )}
        {period !== 'custom' && !patientFilter && (
          <span className="text-xs text-gray-400 font-mono hidden xl:inline">{from === to ? from : `${from} → ${to}`}</span>
        )}

        <select value={site} onChange={e => setSite(e.target.value)} className={selectCls}>
          <option value="">Cơ sở: Tất cả</option>
          <option value="Trung Kính">Trung Kính</option>
          <option value="Kim Giang">Kim Giang</option>
        </select>

        {patientFilter ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm">
            <span className="font-semibold">{patientFilter.name}</span>
            <span className="text-xs font-mono opacity-70">{patientFilter.patientId}</span>
            <button onClick={() => setPatientFilter(null)} className="ml-1 text-blue-600 hover:text-blue-900 text-base leading-none" aria-label="Bỏ lọc bệnh nhân">×</button>
          </div>
        ) : (
          <PatientLookup onPick={(p) => setPatientFilter({ patientId: p.patientId || p._id, name: p.name })} />
        )}

        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">+ Tạo lượt khám</button>
          <button onClick={load} className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200" title="Làm mới">⟳</button>
        </div>
      </div>

      {existingToast && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-800 flex items-center gap-2 flex-shrink-0">
          <span>ℹ</span>
          <span>Bệnh nhân đã có lượt khám đang mở — đã chuyển sang lượt khám hiện tại.</span>
          <button onClick={() => setExistingToast(false)} className="ml-auto text-amber-600 hover:text-amber-900">×</button>
        </div>
      )}

      {/* Split layout: list rail (left) + encounter pane (right) on lg+;
          on smaller screens the rail is full-width and the encounter
          opens as a modal drawer (legacy behavior). */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 min-h-0">
        <EncounterListRail
          list={list}
          loading={loading}
          openId={openId}
          onPick={setOpenId}
        />
        <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
          {openId ? (
            <EncounterPane
              key={openId}
              id={openId}
              embedded
              onClose={() => { setOpenId(null); load() }}
              onOpenOther={(otherId) => setOpenId(otherId)}
              onMutated={load}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-2 p-8 text-center">
              <div className="text-4xl">👁️</div>
              <div>Chọn một lượt khám bên trái để mở</div>
              <div className="text-xs">Hoặc bấm "+ Tạo lượt khám" để tiếp đón bệnh nhân mới.</div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile/small-screen: drawer modal instead of split */}
      {openId && <div className="lg:hidden">
        <EncounterDrawer id={openId} onClose={() => { setOpenId(null); load() }} onOpenOther={(otherId) => setOpenId(otherId)} />
      </div>}
      {showCreate && <CreateEncounterModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setOpenId(id); load() }} />}
    </div>
  )
}

// ── Compressed list rail (left side of split layout) ──────
// Replaces the wide table when in split mode. 2-line card per encounter:
// name + status pill on top; gói + bill total + time on bottom.
function EncounterListRail({ list, loading, openId, onPick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Lượt khám</span>
        <span className="text-xs text-gray-400">{loading ? '…' : `${list.length}`}</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Chưa có lượt khám.</div>
        ) : list.map(e => {
          const services = e.assignedServices || []
          const done = services.filter(s => s.status === 'done').length
          const isActive = openId === e._id
          const statusPill = e.status === 'paid'
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Đã trả</span>
            : e.status === 'cancelled'
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Hủy</span>
              : null
          return (
            <button key={e._id} onClick={() => onPick(e._id)}
              className={`w-full text-left px-3 py-2.5 transition-colors border-l-4 ${isActive ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-900 truncate flex-1">{e.patientName || '—'}</span>
                {statusPill}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 min-w-0">
                <span className="truncate flex-1">
                  {(e.packages || []).length === 0
                    ? <span className="text-gray-400 italic">Chưa gán gói</span>
                    : (e.packages || []).length === 1
                      ? <>{e.packages[0].name}{e.packages[0].tier && ` · ${e.packages[0].tier}`}</>
                      : <>{e.packages.length} gói: {e.packages.map(p => p.name).join(' + ')}</>}
                  {services.length > 0 && <span className="ml-1 text-gray-400">· {done}/{services.length} DV</span>}
                </span>
                <span className="font-mono text-blue-700 flex-shrink-0">{fmtMoney(e.billTotal)}đ</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                {e.patientId} · {e.site || '—'} · {fmtTime(e.createdAt)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Patient lookup (filter row autocomplete) ──────────────
// Debounced search against /registration/patients. On pick, parent gets the
// patient object and sets the patientFilter (patientId + name) on the list.
function PatientLookup({ onPick }) {
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

  return (
    <div className="relative w-full sm:w-auto">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Tìm tên / SĐT / mã BN..."
        className="border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
      />
      {loading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          {results.map(p => (
            <button key={p._id} onMouseDown={() => { onPick(p); setQ(''); setResults([]); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0">
              <div className="text-sm font-medium text-gray-800">{p.name}</div>
              <div className="text-xs text-gray-500 font-mono">{p.patientId || p._id} · {p.phone || '—'}</div>
            </button>
          ))}
        </div>
      )}
      {open && q && !loading && results.length === 0 && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-10 px-3 py-2 text-xs text-gray-500">
          Không tìm thấy bệnh nhân khớp
        </div>
      )}
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

// ── Encounter detail pane ─────────────────────────────────
// Shared between the desktop split-view (embedded=true, no modal chrome,
// fills its container) and the mobile/legacy drawer (embedded=false, fixed
// modal with backdrop). All the encounter detail UI lives here.

function EncounterPane({ id, onClose, onOpenOther, onMutated, embedded = false }) {
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
      if (r.data.patientId) {
        api.get('/encounters', { params: { patientId: r.data.patientId, excludeId: id } })
          .then(h => setHistory(h.data || []))
          .catch(() => setHistory([]))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  // Notify parent when underlying data changes so the rail can refresh too
  const reload = async () => { await load(); if (onMutated) onMutated() }

  if (loading || !enc) {
    return <div className="h-full flex items-center justify-center text-gray-400">Đang tải...</div>
  }

  const isClosed = enc.status === 'paid' || enc.status === 'cancelled'

  return (
    <div className="h-full flex flex-col">
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
          {!isClosed && (enc.billItems || []).length > 0 && (
            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">Tổng bill: <b className="text-blue-700 font-mono">{fmtMoney(grandTotal(enc))} đ</b> · chuyển <b>Thu ngân</b></span>
          )}
          <button
            onClick={() => printVisitReport(enc)}
            className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
            title="In phiếu khám"><span>🖨</span> In phiếu</button>
          {!isClosed && (
            <button
              onClick={async () => {
                const reason = prompt(`Hủy lượt khám của ${enc.patientName}?\nLý do (tùy chọn):`)
                if (reason === null) return
                await api.post(`/encounters/${enc._id}/cancel`, { reason })
                reload()
              }}
              className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded hover:bg-red-50"
              title="Hủy lượt khám">Hủy</button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Đóng">×</button>
        </div>
      </div>

      {/* Sticky action toolbar — promotes the most-used actions */}
      {!isClosed && (
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-wrap flex-shrink-0">
          <button onClick={() => setShowAssignPackage(true)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1">
            <span>📦</span> Thêm gói
          </button>
          <div className="w-px h-6 bg-gray-300" />
          <button onClick={() => setShowAddItem('service')}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
            <span>+</span> Dịch vụ
          </button>
          <button onClick={() => setShowAddItem('kinh')}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1">
            <span>+</span> Kính
          </button>
          <button onClick={() => setShowAddItem('thuoc')}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-1">
            <span>+</span> Thuốc
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Doctor's conclusion (Kết luận) — editable, persists on blur */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <span>📝</span> Kết luận
          </h3>
          <ConclusionInput
            encounterId={enc._id}
            value={enc.conclusion || ''}
            disabled={isClosed}
            onSaved={reload}
          />
        </section>

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
                      {(h.packages || []).length === 0
                        ? <span className="text-gray-400">— chưa gán gói —</span>
                        : (h.packages || []).map(p => p.name).join(' + ')}
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

        {/* Packages — multiple allowed, each removable */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Gói khám ({(enc.packages || []).length})</h3>
          {(enc.packages || []).length === 0 ? (
            <div className="text-xs text-gray-400 italic">Chưa gán gói. Bấm "Thêm gói" để chọn.</div>
          ) : (
            <div className="space-y-1.5">
              {enc.packages.map(p => (
                <div key={p.code} className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-purple-900">
                      {p.name} {p.tier && <span className="text-xs font-normal text-purple-700">— {p.tier}</span>}
                    </div>
                    <div className="text-xs text-purple-700 mt-0.5 font-mono">{p.code}</div>
                  </div>
                  {!isClosed && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Bỏ gói "${p.name}"? Các dịch vụ thuộc gói này sẽ bị xóa.`)) return
                        await api.delete(`/encounters/${enc._id}/packages/${encodeURIComponent(p.code)}`)
                        reload()
                      }}
                      className="text-purple-600 hover:text-purple-900 text-base leading-none flex-shrink-0"
                      aria-label="Bỏ gói">×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Services list */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Dịch vụ ({(enc.assignedServices || []).length})</h3>
          {(enc.assignedServices || []).length === 0 ? (
            <div className="text-xs text-gray-400 italic">Chưa có dịch vụ nào. Thêm gói khám hoặc bấm "+ Dịch vụ" để thêm dịch vụ rời.</div>
          ) : (
            <div className="space-y-1.5">
              {enc.assignedServices.map(s => {
                const badge = STATUS_BADGE[s.status] || STATUS_BADGE.pending
                return (
                  <div key={s.serviceCode} className="border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.cls} flex-shrink-0`}>{badge.label}</span>
                    <button onClick={() => setOpenServiceCode(s.serviceCode)} className="text-sm flex-1 text-left truncate cursor-pointer hover:text-blue-700">
                      {s.serviceName}
                    </button>
                    <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{s.serviceCode}</span>
                    {s.addedByPackage && <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded flex-shrink-0" title={`Từ gói ${s.addedByPackage}`}>📦</span>}
                    <button onClick={() => setOpenServiceCode(s.serviceCode)} className="text-xs text-blue-600 flex-shrink-0">Mở →</button>
                    {!isClosed && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Xóa dịch vụ "${s.serviceName}"?`)) return
                          await api.delete(`/encounters/${enc._id}/services/${encodeURIComponent(s.serviceCode)}`)
                          reload()
                        }}
                        className="text-red-500 hover:text-red-700 text-base leading-none flex-shrink-0"
                        aria-label="Xóa dịch vụ">×</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Bill */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Bill ({(enc.billItems || []).length} mục)</h3>
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
                        {!isClosed && (
                          <button onClick={async () => {
                            if (!confirm(`Xóa "${b.name}" khỏi bill?`)) return
                            await api.delete(`/encounters/${enc._id}/bill-items/${i}`)
                            reload()
                          }} className="text-red-500 hover:text-red-700 text-xs">×</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={4} className="py-1.5 text-right text-gray-500">Tạm tính</td>
                  <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoney(enc.billTotal)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4} className="py-1.5 text-right text-gray-500">Giảm giá</td>
                  <td className="py-1.5 text-right">
                    <DiscountInput encounter={enc} disabled={isClosed} onSaved={reload} />
                  </td>
                  <td></td>
                </tr>
                <tr className="border-t border-gray-200 font-bold">
                  <td colSpan={4} className="py-2 text-right">Tổng cộng</td>
                  <td className="py-2 text-right font-mono text-blue-700 text-base">{fmtMoney(grandTotal(enc))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>

      {showAssignPackage && <AssignPackageModal encounterId={enc._id} onDone={async () => { setShowAssignPackage(false); await reload() }} onClose={() => setShowAssignPackage(false)} />}
      {openServiceCode && <ServiceFormModal encounterId={enc._id} serviceCode={openServiceCode} onDone={async () => { setOpenServiceCode(null); await reload() }} onClose={() => setOpenServiceCode(null)} />}
      {showAddItem && <AddItemModal encounterId={enc._id} kind={showAddItem} onDone={async () => { setShowAddItem(null); await reload() }} onClose={() => setShowAddItem(null)} />}
    </div>
  )
}

// Effective bill-level discount in VND. Mirrors server-side helper.
function effectiveDiscount(enc) {
  if (!enc) return 0
  const pct = enc.discountPercent || 0
  if (pct > 0) return Math.round((enc.billTotal || 0) * pct / 100)
  return enc.discountAmount || 0
}
function grandTotal(enc) {
  return Math.max(0, (enc?.billTotal || 0) - effectiveDiscount(enc))
}

// Inline discount input — toggles between absolute (đ) and percent (%) modes,
// commits on blur / Enter via PUT /encounters/:id/discount.
// Inline textarea for the doctor's conclusion. Persists on blur via PUT
// /encounters/:id/conclusion. No auto-save while typing — keeps it simple
// and avoids burst-PUTs.
function ConclusionInput({ encounterId, value, disabled, onSaved }) {
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  useEffect(() => { setText(value || ''); setSavedAt(null) }, [value])
  const commit = async () => {
    if (text === (value || '')) return
    setSaving(true)
    try {
      await api.put(`/encounters/${encounterId}/conclusion`, { conclusion: text })
      setSavedAt(new Date())
      onSaved && onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        disabled={disabled || saving}
        rows={3}
        placeholder="Kết luận lâm sàng, chẩn đoán, hướng xử trí, hẹn tái khám…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:bg-gray-50"
      />
      <div className="text-[10px] text-gray-400 mt-0.5 text-right">
        {saving ? 'Đang lưu…' : savedAt ? `✓ Đã lưu ${savedAt.toLocaleTimeString('vi-VN')}` : disabled ? '' : 'Lưu khi rời ô'}
      </div>
    </div>
  )
}

function DiscountInput({ encounter, disabled, onSaved }) {
  const initialMode = (encounter.discountPercent || 0) > 0 ? 'percent' : 'amount'
  const [mode, setMode] = useState(initialMode)
  const initialValue = initialMode === 'percent' ? (encounter.discountPercent || 0) : (encounter.discountAmount || 0)
  const [v, setV] = useState(String(initialValue))
  const [saving, setSaving] = useState(false)

  // Re-sync when the underlying encounter changes (e.g. parent reload)
  useEffect(() => {
    const m = (encounter.discountPercent || 0) > 0 ? 'percent' : 'amount'
    setMode(m)
    setV(String(m === 'percent' ? (encounter.discountPercent || 0) : (encounter.discountAmount || 0)))
  }, [encounter.discountPercent, encounter.discountAmount])

  const commit = async (nextMode = mode, nextV = v) => {
    const num = Number(String(nextV).replace(/[^\d.]/g, '')) || 0
    const currentEffective = nextMode === 'percent'
      ? (encounter.discountPercent || 0)
      : (encounter.discountAmount || 0)
    if (num === currentEffective) return
    setSaving(true)
    try {
      const body = nextMode === 'percent'
        ? { discountPercent: Math.min(100, num) }
        : { discountAmount: num }
      await api.put(`/encounters/${encounter._id}/discount`, body)
      onSaved && onSaved()
    } finally { setSaving(false) }
  }

  const switchMode = (m) => {
    if (m === mode) return
    setMode(m)
    // Reset value to existing field for that mode (or 0)
    const next = m === 'percent' ? (encounter.discountPercent || 0) : (encounter.discountAmount || 0)
    setV(String(next))
    // Persist the switch immediately (clears the other field on the server)
    commit(m, next)
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        disabled={disabled || saving}
        className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
      />
      <div className="inline-flex border border-gray-200 rounded overflow-hidden">
        <button type="button" disabled={disabled} onClick={() => switchMode('amount')}
          className={`px-2 py-1 text-xs ${mode === 'amount' ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>đ</button>
        <button type="button" disabled={disabled} onClick={() => switchMode('percent')}
          className={`px-2 py-1 text-xs ${mode === 'percent' ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>%</button>
      </div>
    </div>
  )
}

// Mobile / small-screen wrapper — renders EncounterPane in a fixed modal.
function EncounterDrawer({ id, onClose, onOpenOther }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <EncounterPane id={id} onClose={onClose} onOpenOther={onOpenOther} />
      </div>
    </div>
  )
}

// ── Assign Package modal ──────────────────────────────────

function AssignPackageModal({ encounterId, onClose, onDone }) {
  const [packages, setPackages] = useState([])
  const [alreadyAssigned, setAlreadyAssigned] = useState(new Set())
  const [pkgCode, setPkgCode] = useState('')
  const [tierCode, setTierCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/catalogs/packages').then(r => setPackages(r.data || []))
    api.get(`/encounters/${encounterId}`).then(r => {
      setAlreadyAssigned(new Set((r.data?.packages || []).map(p => p.code)))
    })
  }, [encounterId])

  const availablePackages = packages.filter(p => !alreadyAssigned.has(p.code))

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
    <Modal onClose={onClose} title="Thêm gói khám">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Gói {alreadyAssigned.size > 0 && <span className="text-gray-400 font-normal">({alreadyAssigned.size} đã gán — ẩn)</span>}
          </label>
          <select value={pkgCode} onChange={e => { setPkgCode(e.target.value); setTierCode('') }} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">— Chọn gói —</option>
            {availablePackages.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
          {availablePackages.length === 0 && <div className="text-xs text-gray-400 mt-1">Tất cả gói đã được gán cho lượt khám này.</div>}
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
