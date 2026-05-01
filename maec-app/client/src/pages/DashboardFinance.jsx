import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getAnnualPL, getMonthlyPL } from '../api'

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']
const fmtM = (v) => (v == null || isNaN(Number(v))) ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr'
const fmtB = (v) => {
  const n = Number(v)
  if (isNaN(n)) return '—'
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + ' tỷ'
  return n.toFixed(0) + ' tr'
}

function StatCard({ label, value, sub, color = 'text-gray-800', bg = 'bg-white', icon, onClick }) {
  return (
    <div onClick={onClick} className={`${bg} rounded-lg border p-4 ${onClick ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
          <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        {icon && <div className="text-2xl opacity-60">{icon}</div>}
      </div>
    </div>
  )
}

export default function DashboardFinance() {
  const [annualPL, setAnnualPL] = useState(null)
  const [monthlyPL, setMonthlyPL] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([getAnnualPL(), getMonthlyPL()])
      .then(([a, m]) => { setAnnualPL(a); setMonthlyPL(m) })
      .finally(() => setLoading(false))
  }, [])

  const derived = useMemo(() => {
    if (!annualPL || !monthlyPL) return null

    const mainSites = (annualPL.sites || []).filter(s => s !== 'HO' && s !== 'Site LK')
    const getAnnualRow = (id) => (annualPL.rows || []).find(r => r.id === id)
    const getMonthlyRow = (id) => (monthlyPL.rows || []).find(r => r.id === id)

    const revRow = getMonthlyRow('rev_total')
    const ebitdaRow = getMonthlyRow('ebitda')
    const patRow = getMonthlyRow('pat')

    // MTD = current month; fallback to latest month with non-zero data if current month empty
    let mtdIdx = new Date().getMonth()
    const valAt = (row, i) => Number(row?.values?.[i]) || 0
    if (revRow && valAt(revRow, mtdIdx) === 0) {
      for (let i = 11; i >= 0; i--) { if (valAt(revRow, i) !== 0) { mtdIdx = i; break } }
    }

    const mtdRev = valAt(revRow, mtdIdx)
    const mtdEbitda = valAt(ebitdaRow, mtdIdx)
    const mtdPat = valAt(patRow, mtdIdx)
    const ytdRev = Array.from({ length: mtdIdx + 1 }, (_, i) => valAt(revRow, i)).reduce((a, b) => a + b, 0)

    // Monthly revenue trend (all 12 months, current year)
    const monthlyTrend = MONTH_LABELS.map((m, i) => ({
      month: m,
      revenue: valAt(revRow, i),
      ebitda: valAt(ebitdaRow, i),
    }))

    // Top 5 sites by annual revenue
    const annualRevRow = getAnnualRow('rev_total')
    const sitesRev = mainSites.map(site => ({
      site,
      revenue: Number(annualRevRow?.values?.[site]) || 0,
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    // Cost breakdown — find rows with id starting 'cost_' or common expense row ids
    const costRows = (monthlyPL.rows || []).filter(r =>
      typeof r.id === 'string' && (r.id.startsWith('cost_') || r.id.startsWith('opex_') || r.id === 'cogs')
    )
    const costBreakdown = costRows.map(r => ({
      name: r.label || r.id,
      value: Math.abs(valAt(r, mtdIdx)),
    })).filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)

    return { mtdIdx, mtdRev, mtdEbitda, mtdPat, ytdRev, monthlyTrend, sitesRev, costBreakdown }
  }, [annualPL, monthlyPL])

  if (loading) return <div className="text-gray-500 p-4">Đang tải bảng điều khiển tài chính...</div>
  if (!derived) return <div className="text-red-500 p-4">Lỗi tải dữ liệu tài chính</div>

  const monthLabel = MONTH_LABELS[derived.mtdIdx]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Dashboard — Tài Chính</h2>
          <div className="text-xs text-gray-500 mt-0.5">Số liệu tháng {monthLabel} · Đơn vị: triệu VND</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/pl')} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">KQ kinh doanh →</button>
          <button onClick={() => navigate('/cf')} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">Dòng tiền →</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={`Doanh thu ${monthLabel}`} value={fmtB(derived.mtdRev)} sub="Tháng hiện tại" color="text-emerald-700" icon="💰" onClick={() => navigate('/pl')} />
        <StatCard label={`EBITDA ${monthLabel}`} value={fmtB(derived.mtdEbitda)} sub="Lãi trước thuế / khấu hao" color={derived.mtdEbitda >= 0 ? 'text-blue-700' : 'text-red-700'} icon="📈" />
        <StatCard label={`LNST ${monthLabel}`} value={fmtB(derived.mtdPat)} sub="Lãi sau thuế" color={derived.mtdPat >= 0 ? 'text-indigo-700' : 'text-red-700'} icon="🏦" />
        <StatCard label="Doanh thu YTD" value={fmtB(derived.ytdRev)} sub={`Luỹ kế T1–${monthLabel}`} color="text-purple-700" icon="📊" />
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Doanh thu & EBITDA theo tháng</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={derived.monthlyTrend}>
              <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => v >= 1000 ? (v/1000).toFixed(1) + 'B' : v} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => fmtM(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Doanh thu" />
              <Line type="monotone" dataKey="ebitda" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="EBITDA" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Top 5 site theo doanh thu (năm)</h3>
          {derived.sitesRev.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={derived.sitesRev} layout="vertical" margin={{ left: 40 }}>
                  <XAxis type="number" stroke="#9ca3af" fontSize={11} tickFormatter={(v) => v >= 1000 ? (v/1000).toFixed(1) + 'B' : v} />
                  <YAxis type="category" dataKey="site" stroke="#9ca3af" fontSize={11} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => fmtM(v)} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cơ cấu chi phí ({monthLabel})</h3>
          {derived.costBreakdown.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu chi phí</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={derived.costBreakdown} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => fmtM(v)} />
                  <Bar dataKey="value" name="Chi phí" fill="#f59e0b">
                    {derived.costBreakdown.map((_, i) => <Cell key={i} fill={['#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#14b8a6','#64748b'][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
