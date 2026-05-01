import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getKPI, saveKPI, getSites } from '../api'

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtB  = n => { if (!n) return '0'; const b = n / 1e9; return b >= 1 ? b.toFixed(2) + ' tỷ' : (n / 1e6).toFixed(0) + 'M' }
const num   = v => Number(v) || 0
const pct   = (a, b) => b > 0 ? Math.round(a / b * 100) : 0
const clamp = v => Math.min(100, Math.max(0, v))

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: `2026-${String(i + 1).padStart(2, '0')}`,
  label: `T${i + 1}/2026`,
})).concat(Array.from({ length: 12 }, (_, i) => ({
  value: `2025-${String(i + 1).padStart(2, '0')}`,
  label: `T${i + 1}/2025`,
})))

const DEFAULT_TARGETS = {
  revenue: 2500000000, costs: 2000000000, avgPrice: 2000000,
  channelSplit: { doctor: 70, hospital: 20, direct: 10 },
  doctorActive: 70, doctorNew: 20, salesVisits: 160, salesConversion: 20,
}
const DEFAULT_MONTH = {
  cases: { doctor: 0, hospital: 0, direct: 0, internal: 0 },
  revenue: { doctor: 0, hospital: 0, direct: 0, internal: 0 },
  doctors: { active: 0, new: 0, churn: 0 },
  hospitalDeals: 0, sales: [],
}

// ─── Gauge circle ─────────────────────────────────────────────────────────────
function Gauge({ value, max, label, sub, color = '#3b82f6' }) {
  const p = clamp(pct(value, max))
  const r = 36, c = 2 * Math.PI * r
  const dash = (p / 100) * c
  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="text-center -mt-[78px] mb-[18px]">
        <p className="text-xl font-extrabold text-gray-800">{p}%</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, title, value, sub, target, barColor = 'bg-blue-500', accent = 'text-blue-700' }) {
  const p = target > 0 ? pct(num(value), target) : null
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-1.5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{icon} {title}</p>
      <p className={`text-2xl font-extrabold ${accent}`}>{typeof value === 'number' ? value.toLocaleString('vi-VN') : value}</p>
      {p !== null && (
        <div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${clamp(p)}%` }} />
          </div>
          <p className="text-xs text-gray-400">{p}% mục tiêu ({target.toLocaleString('vi-VN')})</p>
        </div>
      )}
      {p === null && sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ─── Channel row ──────────────────────────────────────────────────────────────
const CH_CFG = {
  doctor:   { label: 'Doctor Referral',   icon: '👨‍⚕️', color: 'bg-blue-500',    light: 'bg-blue-50',   txt: 'text-blue-700',   note: 'CORE – 70~80% doanh thu' },
  hospital: { label: 'Hospital Partner',  icon: '🏥',   color: 'bg-emerald-500', light: 'bg-emerald-50', txt: 'text-emerald-700', note: 'Outsource MRI/CT' },
  direct:   { label: 'Direct / Walk-in',  icon: '🚶',   color: 'bg-orange-400',  light: 'bg-orange-50',  txt: 'text-orange-700',  note: 'SEO / Ads / thương hiệu' },
  internal: { label: 'Nội bộ',            icon: '🔄',   color: 'bg-purple-400',  light: 'bg-purple-50',  txt: 'text-purple-700',  note: 'Chuyển từ site khác' },
}

function ChannelCard({ ch, actual, targetCases, targetRev }) {
  const cfg = CH_CFG[ch]
  const cPct = pct(actual.cases, targetCases)
  const rPct = pct(actual.revenue, targetRev)
  return (
    <div className={`rounded-xl border border-gray-100 shadow-sm p-4 ${cfg.light}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-800">{cfg.icon} {cfg.label}</p>
          <p className="text-xs text-gray-400">{cfg.note}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Số ca</p>
          <p className={`text-xl font-extrabold ${cfg.txt}`}>{actual.cases.toLocaleString('vi-VN')}</p>
          {targetCases > 0 && <p className="text-xs text-gray-400">mục tiêu {targetCases.toLocaleString('vi-VN')}</p>}
          {targetCases > 0 && (
            <div className="h-1 bg-white/70 rounded-full mt-1 overflow-hidden">
              <div className={`h-full ${cfg.color} rounded-full`} style={{ width: `${clamp(cPct)}%` }} />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Doanh thu</p>
          <p className={`text-xl font-extrabold ${cfg.txt}`}>{fmtB(actual.revenue)}</p>
          {targetRev > 0 && <p className="text-xs text-gray-400">mục tiêu {fmtB(targetRev)}</p>}
          {targetRev > 0 && (
            <div className="h-1 bg-white/70 rounded-full mt-1 overflow-hidden">
              <div className={`h-full ${cfg.color} rounded-full`} style={{ width: `${clamp(rPct)}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gradient-to-l from-gray-200 to-transparent" />
      {action}
    </div>
  )
}

// ─── Edit modals ──────────────────────────────────────────────────────────────
function TargetModal({ targets, onClose, onSave }) {
  const [f, setF] = useState({
    revenue: targets.revenue || 2500000000,
    costs:   targets.costs   || 2000000000,
    avgPrice: targets.avgPrice || 2000000,
    doctorActive: targets.doctorActive || 70,
    doctorNew:    targets.doctorNew    || 20,
    salesVisits:  targets.salesVisits  || 160,
    salesConversion: targets.salesConversion || 20,
    splitDoctor:   targets.channelSplit?.doctor   || 70,
    splitHospital: targets.channelSplit?.hospital || 20,
    splitDirect:   targets.channelSplit?.direct   || 10,
  })
  const upd = (k, v) => setF(p => ({ ...p, [k]: Number(v) || 0 }))
  const be = f.avgPrice > 0 ? Math.round(f.costs / f.avgPrice) : 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-gray-800">⚙ Cài đặt mục tiêu</h3>
            <p className="text-xs text-gray-400 mt-0.5">Áp dụng cho chi nhánh & tháng đang chọn</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-6">
          {[
            { title: 'Tài chính', fields: [
              { k: 'revenue',  l: 'Doanh thu mục tiêu (VND)' },
              { k: 'costs',    l: 'Chi phí / tháng (VND)' },
              { k: 'avgPrice', l: 'Giá trung bình / ca (VND)', full: true },
            ]},
            { title: 'Phân bổ kênh (%)', fields: [
              { k: 'splitDoctor',   l: 'Doctor Referral %' },
              { k: 'splitHospital', l: 'Hospital %' },
              { k: 'splitDirect',   l: 'Direct %' },
            ]},
            { title: 'Doctor funnel', fields: [
              { k: 'doctorActive', l: 'Bác sĩ active mục tiêu' },
              { k: 'doctorNew',    l: 'Bác sĩ mới / tháng' },
            ]},
            { title: 'KPI nhân viên Sale', fields: [
              { k: 'salesVisits',     l: 'Visit / sale / tháng' },
              { k: 'salesConversion', l: 'Conversion rate mục tiêu (%)' },
            ]},
          ].map(sec => (
            <div key={sec.title}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">{sec.title}</p>
              <div className="grid grid-cols-2 gap-3">
                {sec.fields.map(({ k, l, full }) => (
                  <div key={k} className={full ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                    <input type="number" value={f[k]} onChange={e => upd(k, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                ))}
              </div>
              {sec.title === 'Tài chính' && be > 0 && (
                <p className="mt-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                  Break-even: <strong>{be.toLocaleString('vi-VN')} ca/tháng</strong> (~{Math.ceil(be/26)} ca/ngày)
                </p>
              )}
              {sec.title === 'Phân bổ kênh (%)' && (
                <p className="mt-1 text-xs text-gray-400">Tổng: {f.splitDoctor + f.splitHospital + f.splitDirect}%</p>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={() => {
              onSave({
                revenue: f.revenue, costs: f.costs, avgPrice: f.avgPrice,
                doctorActive: f.doctorActive, doctorNew: f.doctorNew,
                salesVisits: f.salesVisits, salesConversion: f.salesConversion,
                channelSplit: { doctor: f.splitDoctor, hospital: f.splitHospital, direct: f.splitDirect },
              }); onClose()
            }} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Lưu mục tiêu</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActualsModal({ month, onClose, onSave }) {
  const [f, setF] = useState({
    cD: month.cases?.doctor || 0,    cH: month.cases?.hospital || 0,
    cDi: month.cases?.direct || 0,   cI: month.cases?.internal || 0,
    rD: month.revenue?.doctor || 0,  rH: month.revenue?.hospital || 0,
    rDi: month.revenue?.direct || 0, rI: month.revenue?.internal || 0,
    dA: month.doctors?.active || 0,  dN: month.doctors?.new || 0,
    dC: month.doctors?.churn || 0,   hD: month.hospitalDeals || 0,
  })
  const upd = (k, v) => setF(p => ({ ...p, [k]: Number(v) || 0 }))
  const rows = [
    { title: 'Số ca thực tế', fields: [
      { k: 'cD', l: '👨‍⚕️ Doctor' }, { k: 'cH', l: '🏥 Hospital' },
      { k: 'cDi', l: '🚶 Direct' }, { k: 'cI', l: '🔄 Nội bộ' },
    ]},
    { title: 'Doanh thu thực tế (VND)', fields: [
      { k: 'rD', l: '👨‍⚕️ Doctor' }, { k: 'rH', l: '🏥 Hospital' },
      { k: 'rDi', l: '🚶 Direct' }, { k: 'rI', l: '🔄 Nội bộ' },
    ]},
    { title: 'Doctor funnel', fields: [
      { k: 'dA', l: 'Bác sĩ active' }, { k: 'dN', l: 'Bác sĩ mới' },
      { k: 'dC', l: 'Bác sĩ churn' }, { k: 'hD', l: 'Hợp đồng Hospital' },
    ]},
  ]
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-bold text-gray-800">📊 Nhập số liệu thực tế</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-5">
          {rows.map(sec => (
            <div key={sec.title}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100">{sec.title}</p>
              <div className="grid grid-cols-2 gap-3">
                {sec.fields.map(({ k, l }) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                    <input type="number" value={f[k]} onChange={e => upd(k, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={() => {
              onSave({
                cases:   { doctor: f.cD,  hospital: f.cH,  direct: f.cDi, internal: f.cI  },
                revenue: { doctor: f.rD,  hospital: f.rH,  direct: f.rDi, internal: f.rI  },
                doctors: { active: f.dA,  new: f.dN,       churn:  f.dC  },
                hospitalDeals: f.hD,
              }); onClose()
            }} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Lưu</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditRepModal({ rep, onClose, onSave }) {
  const [f, setF] = useState({ ...rep })
  const upd = (k, v) => setF(p => ({ ...p, [k]: Number(v) || 0 }))
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Cập nhật KPI — {rep.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { k: 'visits',     l: '🚗 Số lượt visit' },
            { k: 'calls',      l: '📞 Số cuộc gọi' },
            { k: 'followups',  l: '🔔 Follow-up' },
            { k: 'newDocs',    l: '👨‍⚕️ Bác sĩ mới' },
            { k: 'activeDocs', l: '🤝 BS active duy trì' },
            { k: 'revenue',    l: '💰 Doanh thu generate (VND)' },
          ].map(({ k, l }) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
              <input type="number" value={f[k] || 0} onChange={e => upd(k, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={() => { onSave(f); onClose() }}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Lưu</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddRepModal({ onClose, onSave }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Thêm nhân viên Sale</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nguyễn Văn A..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button disabled={!name.trim()} onClick={() => { onSave(name.trim()); onClose() }}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">Thêm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Quản lý ─────────────────────────────────────────────────────────────
function ManagerView({ targets, monthData, breakeven, dailyBE, channelDefs, onOpenActuals, isManager }) {
  const totalRev   = Object.values(monthData.revenue).reduce((s, v) => s + num(v), 0)
  const totalCases = Object.values(monthData.cases).reduce((s, v) => s + num(v), 0)
  const revPct     = pct(totalRev, targets.revenue)
  const bePct      = pct(totalCases, breakeven)
  const netDoc     = num(monthData.doctors.new) - num(monthData.doctors.churn)
  const teamRev    = (monthData.sales || []).reduce((s, r) => s + num(r.revenue), 0)
  const teamVisits = (monthData.sales || []).reduce((s, r) => s + num(r.visits), 0)
  const teamNew    = (monthData.sales || []).reduce((s, r) => s + num(r.newDocs), 0)

  return (
    <div className="space-y-8">

      {/* ── A. Doanh thu tổng quan ── */}
      <div>
        <SectionHeader title="A · Doanh thu tổng quan"
          action={isManager && (
            <button onClick={onOpenActuals}
              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
              📊 Nhập thực tế
            </button>
          )} />

        <div className="grid grid-cols-5 gap-4 items-center">
          {/* Gauges */}
          <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex justify-around">
            <Gauge value={totalRev} max={targets.revenue} label="Doanh thu"
              sub={`${fmtB(totalRev)} / ${fmtB(targets.revenue)}`}
              color={revPct >= 90 ? '#22c55e' : revPct >= 70 ? '#f59e0b' : '#ef4444'} />
            <Gauge value={totalCases} max={breakeven} label="Ca / Break-even"
              sub={`${totalCases.toLocaleString('vi-VN')} / ${breakeven.toLocaleString('vi-VN')}`}
              color={bePct >= 100 ? '#22c55e' : bePct >= 80 ? '#f59e0b' : '#3b82f6'} />
          </div>

          {/* Key numbers */}
          <div className="col-span-3 grid grid-cols-3 gap-3">
            <StatCard icon="💰" title="Doanh thu" value={fmtB(totalRev)}
              sub={`Mục tiêu: ${fmtB(targets.revenue)}`} accent="text-blue-700" />
            <StatCard icon="📸" title="Tổng số ca" value={totalCases}
              target={breakeven} barColor="bg-indigo-500" accent="text-indigo-700" />
            <StatCard icon="📅" title="Ca / ngày cần đạt" value={dailyBE}
              sub="= Chi phí ÷ Giá/ca ÷ 26 ngày" accent="text-gray-700" />
            <StatCard icon="🏥" title="Hợp đồng Hospital" value={num(monthData.hospitalDeals)}
              sub="Kênh Hospital Partnership" accent="text-emerald-700" />
            <StatCard icon="🎯" title="% Doanh thu" value={`${revPct}%`}
              sub={revPct >= 90 ? '✅ Đạt mục tiêu' : revPct >= 70 ? '⚠ Cần đẩy thêm' : '❌ Chưa đạt'}
              accent={revPct >= 90 ? 'text-green-600' : revPct >= 70 ? 'text-yellow-600' : 'text-red-600'} />
            <StatCard icon="⚖️" title="% Break-even" value={`${bePct}%`}
              sub={`${totalCases.toLocaleString('vi-VN')} / ${breakeven.toLocaleString('vi-VN')} ca`}
              accent={bePct >= 100 ? 'text-green-600' : 'text-blue-700'} />
          </div>
        </div>
      </div>

      {/* ── B. Kênh ── */}
      <div>
        <SectionHeader title="B · Phân tích kênh" />
        <div className="grid grid-cols-4 gap-3">
          {channelDefs.map(ch => (
            <ChannelCard key={ch.key} ch={ch.key} actual={ch.actual}
              targetCases={ch.target.cases} targetRev={ch.target.revenue} />
          ))}
        </div>
      </div>

      {/* ── C. Doctor funnel ── */}
      <div>
        <SectionHeader title="C · Doctor Funnel" />
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon="👨‍⚕️" title="Bác sĩ Active" value={num(monthData.doctors.active)}
            target={targets.doctorActive} barColor="bg-blue-500" accent="text-blue-700" />
          <StatCard icon="✨" title="Bác sĩ mới" value={num(monthData.doctors.new)}
            target={targets.doctorNew} barColor="bg-emerald-500" accent="text-emerald-700" />
          <StatCard icon="📉" title="Bác sĩ churn" value={num(monthData.doctors.churn)}
            sub={num(monthData.doctors.churn) > 5 ? '⚠ Cần chú ý giữ chân' : 'Trong ngưỡng kiểm soát'}
            accent={num(monthData.doctors.churn) > 5 ? 'text-red-600' : 'text-gray-700'} />
          <div className={`rounded-xl border shadow-sm p-4 ${netDoc >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">🔢 Tăng trưởng net</p>
            <p className={`text-3xl font-extrabold ${netDoc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netDoc >= 0 ? '+' : ''}{netDoc}
            </p>
            <p className="text-xs text-gray-400 mt-1">{num(monthData.doctors.new)} mới − {num(monthData.doctors.churn)} churn</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">= (Visit × Conv%) − Churn</p>
          </div>
        </div>
      </div>

      {/* ── D. Manager control ── */}
      <div>
        <SectionHeader title="D · Tổng hợp Team Sales" />
        <div className="grid grid-cols-3 gap-4">

          {/* Team summary */}
          <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-indigo-700 flex items-center gap-3">
              <p className="text-sm font-bold text-white">Hiệu suất Team</p>
              <span className="text-xs text-indigo-300">{(monthData.sales || []).length} nhân viên</span>
            </div>
            <div className="p-4 space-y-3">
              {(monthData.sales || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Chưa có dữ liệu nhân viên</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 pb-3 border-b border-gray-100">
                    <div className="text-center">
                      <p className="text-2xl font-extrabold text-indigo-700">{teamVisits}</p>
                      <p className="text-xs text-gray-400">Tổng visit</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-extrabold text-emerald-600">{teamNew}</p>
                      <p className="text-xs text-gray-400">Bác sĩ mới</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-extrabold text-blue-700">{fmtB(teamRev)}</p>
                      <p className="text-xs text-gray-400">DT generate</p>
                    </div>
                  </div>
                  {(monthData.sales || []).map(rep => {
                    const maxRev = Math.max(...(monthData.sales || []).map(r => num(r.revenue)), 1)
                    return (
                      <div key={rep.id} className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {rep.name.charAt(0)}
                        </span>
                        <span className="text-sm font-medium text-gray-700 w-32 truncate">{rep.name}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct(num(rep.revenue), maxRev)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-emerald-700 w-16 text-right">{fmtB(num(rep.revenue))}</span>
                        <span className="text-xs text-gray-400 w-16 text-right">{num(rep.visits)} visits</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* Benchmark */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Benchmark chuẩn</p>
            <div className="space-y-3">
              {[
                { label: 'Visit / sale / tháng', value: '150–200', icon: '🚗' },
                { label: 'Cuộc gọi / tháng',    value: '300–400', icon: '📞' },
                { label: 'Bác sĩ mới',           value: '20–40',  icon: '✨' },
                { label: 'BS active maintain',   value: '50–80',  icon: '🤝' },
                { label: 'Conversion rate',      value: '≥ 20%',  icon: '🎯' },
                { label: 'Doanh thu / sale',     value: '300–600M', icon: '💰' },
                { label: 'Visit / ngày',         value: '8–10',   icon: '📅' },
              ].map(b => (
                <div key={b.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{b.icon} {b.label}</span>
                  <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded">{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Nhân viên Sale ──────────────────────────────────────────────────────
function SalesView({ targets, monthData, isManager, onAdd, onEdit, onDelete }) {
  const sales = monthData.sales || []

  return (
    <div className="space-y-6">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700">Danh sách nhân viên Sale</p>
          <p className="text-xs text-gray-400 mt-0.5">Theo dõi KPI hoạt động từng người theo tháng</p>
        </div>
        {isManager && (
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Thêm nhân viên
          </button>
        )}
      </div>

      {sales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm font-medium text-gray-500">Chưa có nhân viên sale</p>
          {isManager && (
            <button onClick={onAdd} className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium">
              + Thêm nhân viên
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sales.map((rep) => {
            const convRate = rep.visits > 0 ? Math.round(num(rep.newDocs) / num(rep.visits) * 100) : 0

            const kpis = [
              {
                label: 'Visit', actual: num(rep.visits), target: targets.salesVisits,
                bar: 'bg-blue-500', note: 'chuẩn 150–200/tháng',
              },
              {
                label: 'Cuộc gọi', actual: num(rep.calls), target: 0,
                bar: 'bg-sky-400', note: 'chuẩn 300–400/tháng',
              },
              {
                label: 'Bác sĩ mới', actual: num(rep.newDocs), target: targets.doctorNew,
                bar: 'bg-emerald-500', note: 'chuẩn 20–40/tháng',
              },
              {
                label: 'BS Active', actual: num(rep.activeDocs), target: targets.doctorActive,
                bar: 'bg-indigo-500', note: 'chuẩn 50–80',
              },
            ]

            return (
              <div key={rep.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Rep header */}
                <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-indigo-600 text-white text-base font-extrabold flex items-center justify-center shadow">
                      {rep.name.charAt(0)}
                    </span>
                    <div>
                      <p className="font-bold text-gray-800">{rep.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${convRate >= 20 ? 'bg-green-100 text-green-700' : convRate >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                          Conversion {convRate}%
                        </span>
                        <span className="text-xs text-gray-400">(chuẩn ≥ 20%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xl font-extrabold text-emerald-700">{fmtB(num(rep.revenue))}</p>
                      <p className="text-xs text-gray-400">Doanh thu generate</p>
                    </div>
                    {isManager && (
                      <div className="flex gap-1.5">
                        <button onClick={() => onEdit(rep)}
                          className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-medium">
                          Sửa
                        </button>
                        <button onClick={() => onDelete(rep.id)}
                          className="text-xs px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium">
                          Xóa
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* KPI bars */}
                <div className="px-5 py-4 grid grid-cols-4 gap-5">
                  {kpis.map(k => {
                    const p = k.target > 0 ? pct(k.actual, k.target) : null
                    return (
                      <div key={k.label}>
                        <div className="flex items-end justify-between mb-1.5">
                          <span className="text-xs font-semibold text-gray-500">{k.label}</span>
                          <span className="text-lg font-extrabold text-gray-800">{k.actual}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${k.bar} rounded-full transition-all`}
                            style={{ width: `${p !== null ? clamp(p) : 60}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-400">{k.note}</span>
                          {p !== null && <span className={`text-xs font-bold ${p >= 100 ? 'text-green-600' : p >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>{p}%</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Daily task guide */}
                <div className="px-5 pb-4">
                  <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-4 gap-2">
                    {[
                      { icon: '🚗', label: 'Visit / ngày', target: '8–10', actual: rep.visits > 0 ? Math.round(num(rep.visits) / 26) : '—' },
                      { icon: '📞', label: 'Call / ngày',  target: '15–20', actual: rep.calls  > 0 ? Math.round(num(rep.calls)  / 26) : '—' },
                      { icon: '🔔', label: 'Follow-up',   target: '10/ngày', actual: num(rep.followups) },
                      { icon: '📝', label: 'CRM update',  target: 'bắt buộc', actual: '—' },
                    ].map(d => (
                      <div key={d.label} className="text-center">
                        <p className="text-lg">{d.icon}</p>
                        <p className="text-sm font-bold text-gray-700">{d.actual}</p>
                        <p className="text-xs text-gray-500">{d.label}</p>
                        <p className="text-xs text-gray-400">{d.target}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Team footer */}
          {sales.length > 1 && (() => {
            const tot = sales.reduce((a, r) => ({
              visits: a.visits + num(r.visits), calls: a.calls + num(r.calls),
              newDocs: a.newDocs + num(r.newDocs), activeDocs: a.activeDocs + num(r.activeDocs),
              revenue: a.revenue + num(r.revenue),
            }), { visits: 0, calls: 0, newDocs: 0, activeDocs: 0, revenue: 0 })
            const teamConv = tot.visits > 0 ? Math.round(tot.newDocs / tot.visits * 100) : 0
            return (
              <div className="bg-indigo-700 rounded-2xl px-5 py-4">
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-3">Tổng team ({sales.length} người)</p>
                <div className="grid grid-cols-5 gap-4 text-center">
                  {[
                    { label: 'Tổng visit',    value: tot.visits,    accent: 'text-white' },
                    { label: 'Tổng cuộc gọi', value: tot.calls,     accent: 'text-white' },
                    { label: 'BS mới',         value: tot.newDocs,   accent: 'text-emerald-300' },
                    { label: 'Conversion',     value: `${teamConv}%`, accent: teamConv >= 20 ? 'text-green-300' : 'text-yellow-300' },
                    { label: 'Doanh thu',      value: fmtB(tot.revenue), accent: 'text-emerald-300' },
                  ].map(s => (
                    <div key={s.label}>
                      <p className={`text-xl font-extrabold ${s.accent}`}>{typeof s.value === 'number' ? s.value.toLocaleString('vi-VN') : s.value}</p>
                      <p className="text-xs text-indigo-300">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function KPISales() {
  const { auth } = useAuth()
  const isManager = auth?.role === 'admin' || auth?.role === 'giamdoc' || auth?.role === 'truongphong'
  const todayM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const [kpiData, setKpiData] = useState({})
  const [sites,   setSites]   = useState([])
  const [site,    setSite]    = useState('')
  const [month,   setMonth]   = useState(todayM)
  const [tab,     setTab]     = useState('manager')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [modal,   setModal]   = useState(null)
  const [editRep, setEditRep] = useState(null)

  const siteData  = kpiData?.sites?.[site] || {}
  const targets   = useMemo(() => ({ ...DEFAULT_TARGETS, ...(siteData.targets || {}) }), [siteData])
  const monthData = useMemo(() => ({ ...DEFAULT_MONTH, ...(siteData.monthly?.[month] || {}) }), [siteData, month])
  const breakeven = targets.avgPrice > 0 ? Math.round(targets.costs / targets.avgPrice) : 0
  const dailyBE   = breakeven > 0 ? Math.ceil(breakeven / 26) : 0

  const channelDefs = useMemo(() => {
    const sp = targets.channelSplit
    return ['doctor', 'hospital', 'direct', 'internal'].map(k => ({
      key: k,
      actual: { cases: num(monthData.cases[k]), revenue: num(monthData.revenue[k]) },
      target: {
        cases:   k !== 'internal' ? Math.round(breakeven * (sp[k] || 0) / 100) : 0,
        revenue: k !== 'internal' ? Math.round(targets.revenue * (sp[k] || 0) / 100) : 0,
      },
    }))
  }, [monthData, targets, breakeven])

  const load = useCallback(async () => {
    try {
      const [kd, sd] = await Promise.all([getKPI(), getSites()])
      setKpiData(kd || {})
      const names = (sd || []).map(s => s.name).filter(Boolean)
      setSites(names)
      if (!site && names.length) setSite(names[0])
    } finally { setLoading(false) }
  }, [site])

  useEffect(() => { load() }, []) // eslint-disable-line

  const persist = useCallback(async (updated) => {
    setSaving(true)
    try { await saveKPI(updated); setKpiData(updated) }
    finally { setSaving(false) }
  }, [])

  const updateTargets = (t) => persist({ ...kpiData, sites: { ...(kpiData.sites || {}), [site]: { ...siteData, targets: t } } })

  const patchMonth = useCallback((patch) => {
    persist({
      ...kpiData,
      sites: { ...(kpiData.sites || {}), [site]: {
        ...siteData,
        monthly: { ...(siteData.monthly || {}), [month]: { ...monthData, ...patch } },
      }},
    })
  }, [kpiData, site, siteData, month, monthData, persist])

  const updateSalesRep = (rep) => {
    const sales = (monthData.sales || []).map(s => s.id === rep.id ? rep : s)
    if (!sales.find(s => s.id === rep.id)) sales.push({ ...rep, id: Date.now().toString() })
    patchMonth({ sales })
  }
  const addRep   = (name) => patchMonth({ sales: [...(monthData.sales || []), { id: Date.now().toString(), name, visits: 0, calls: 0, followups: 0, newDocs: 0, activeDocs: 0, revenue: 0 }] })
  const deleteRep = (id)  => patchMonth({ sales: (monthData.sales || []).filter(r => r.id !== id) })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>

  return (
    <div className="space-y-5">

      {/* ── Top bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-800">KPI Sales & Manager</h2>
          <p className="text-xs text-gray-400 mt-0.5">B2B2C · Doctor-Driven → Chỉ định → Ca chụp → Doanh thu</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={site} onChange={e => setSite(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-blue-400 bg-white">
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-blue-400 bg-white">
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {isManager && (
            <button onClick={() => setModal('target')}
              className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              ⚙ Mục tiêu
            </button>
          )}
          {saving && <span className="text-xs text-gray-400 animate-pulse">Đang lưu...</span>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'manager', label: '🏢 Quản lý',        sub: 'Doanh thu · Kênh · Doctor funnel · Team' },
          { key: 'sales',   label: '👤 Nhân viên Sale',  sub: 'KPI hoạt động · Visit · Conversion' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{t.label}</span>
            <span className={`block text-xs font-normal mt-0.5 ${tab === t.key ? 'text-gray-400' : 'text-gray-400/60'}`}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'manager' && (
        <ManagerView
          targets={targets} monthData={monthData}
          breakeven={breakeven} dailyBE={dailyBE}
          channelDefs={channelDefs} isManager={isManager}
          onOpenActuals={() => setModal('actuals')}
        />
      )}
      {tab === 'sales' && (
        <SalesView
          targets={targets} monthData={monthData} isManager={isManager}
          onAdd={() => setModal('sales-add')}
          onEdit={rep => { setEditRep(rep); setModal('sales-edit') }}
          onDelete={deleteRep}
        />
      )}

      {/* ── Modals ── */}
      {modal === 'target'    && <TargetModal  targets={targets}   onClose={() => setModal(null)} onSave={updateTargets} />}
      {modal === 'actuals'   && <ActualsModal month={monthData}   onClose={() => setModal(null)} onSave={patchMonth} />}
      {modal === 'sales-add' && <AddRepModal                      onClose={() => setModal(null)} onSave={addRep} />}
      {modal === 'sales-edit' && editRep && (
        <EditRepModal rep={editRep} onClose={() => { setModal(null); setEditRep(null) }} onSave={updateSalesRep} />
      )}
    </div>
  )
}
