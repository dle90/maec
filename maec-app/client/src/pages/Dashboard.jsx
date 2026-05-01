import React, { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, ReferenceLine, ComposedChart, Area
} from 'recharts'
import { getAnnualPL, getMonthlyPL, getActuals, getBreakeven } from '../api'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  return Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}
const fmtB = (v) => {
  const n = Number(v)
  if (isNaN(n)) return '-'
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'B'
  return n.toFixed(0) + 'M'
}

function getSiteStatus(ebitda, margin) {
  if (ebitda < 0) return { label: 'Lỗ', color: '#ef4444', bg: '#fef2f2' }
  if (margin >= 0.35) return { label: 'Xuất sắc', color: '#059669', bg: '#ecfdf5' }
  if (margin >= 0.20) return { label: 'Tốt', color: '#16a34a', bg: '#f0fdf4' }
  if (margin >= 0.08) return { label: 'Trung bình', color: '#d97706', bg: '#fffbeb' }
  return { label: 'Cần cải thiện', color: '#ea580c', bg: '#fff7ed' }
}

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']
const QUICK_PERIODS = [
  { key: 'year', label: 'Cả năm', months: [0,1,2,3,4,5,6,7,8,9,10,11] },
  { key: 'q1',   label: 'Q1',     months: [0,1,2] },
  { key: 'q2',   label: 'Q2',     months: [3,4,5] },
  { key: 'q3',   label: 'Q3',     months: [6,7,8] },
  { key: 'q4',   label: 'Q4',     months: [9,10,11] },
  ...MONTH_LABELS.map((m, i) => ({ key: `m${i+1}`, label: m, months: [i] }))
]

const NAVY = '#0f2c6b'
const NAVY2 = '#1e3a8a'
const BLUE  = '#2563eb'
const GREEN = '#059669'
const RED   = '#ef4444'
const GOLD  = '#d97706'

// Custom tooltip
const CustomTooltip = ({ active, payload, label, labelMap }) => {
  if (!active || !payload?.length) return null
  const displayLabel = labelMap?.[label] || label
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{displayLabel}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)} tr.
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [annualPL, setAnnualPL] = useState(null)
  const [monthlyPL, setMonthlyPL] = useState(null)
  const [actuals, setActuals] = useState({})
  const [breakeven, setBreakeven] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeMode, setTimeMode] = useState('preset')
  const [period, setPeriod] = useState('year')
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(12)
  const [selectedSites, setSelectedSites] = useState(null)

  useEffect(() => {
    Promise.all([getAnnualPL(), getMonthlyPL(), getActuals(), getBreakeven()])
      .then(([apl, mpl, acts, be]) => {
        setAnnualPL(apl)
        setMonthlyPL(mpl)
        setActuals(acts)
        setBreakeven(be)
        const main = (apl.sites || []).filter(s => s !== 'HO' && s !== 'Site LK')
        setSelectedSites(main)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectedMonthIndices = useMemo(() => {
    if (timeMode === 'range') {
      const start = Math.min(rangeStart, rangeEnd) - 1
      const end   = Math.max(rangeStart, rangeEnd) - 1
      return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }
    return QUICK_PERIODS.find(p => p.key === period)?.months ?? [0,1,2,3,4,5,6,7,8,9,10,11]
  }, [timeMode, period, rangeStart, rangeEnd])

  const periodLabel = useMemo(() => {
    if (timeMode === 'range') {
      const s = Math.min(rangeStart, rangeEnd)
      const e = Math.max(rangeStart, rangeEnd)
      return s === e ? `T${s}/2025` : `T${s}–T${e}/2025`
    }
    const p = QUICK_PERIODS.find(p => p.key === period)
    return p?.label === 'Cả năm' ? 'Cả năm 2025' : `${p?.label} 2025`
  }, [timeMode, period, rangeStart, rangeEnd])

  const isFullYear = timeMode === 'preset' && period === 'year'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Đang tải dữ liệu...</p>
      </div>
    </div>
  )
  if (!annualPL || !monthlyPL) return <div className="text-red-500 p-4">Lỗi tải dữ liệu</div>

  const allSites = annualPL.sites || []
  const rows = annualPL.rows || []
  const mainSites = allSites.filter(s => s !== 'HO' && s !== 'Site LK')
  const activeSel = selectedSites || mainSites

  const getRow = (id) => rows.find(r => r.id === id)
  const revTotalRow  = getRow('rev_total')
  const ebitdaRow    = getRow('ebitda_site')
  const patRow       = getRow('pat')
  const monthlyRevRow    = monthlyPL.rows?.find(r => r.id === 'rev_total')
  const monthlyEbitdaRow = monthlyPL.rows?.find(r => r.id === 'ebitda')

  const sumAnnual    = (row) => row ? activeSel.reduce((s, site) => s + (Number(row.values?.[site]) || 0), 0) : 0
  const sumAnnualAll = (row) => row ? mainSites.reduce((s, site) => s + (Number(row.values?.[site]) || 0), 0) : 0
  const sumMonthly   = (row) => row ? selectedMonthIndices.reduce((s, i) => s + (Number(row.values?.[i]) || 0), 0) : 0

  const allSitesAnnualRev = sumAnnualAll(revTotalRow)
  const selSitesAnnualRev = sumAnnual(revTotalRow)
  const siteRatio = allSitesAnnualRev > 0 ? selSitesAnnualRev / allSitesAnnualRev : 1
  const siteFilterActive = activeSel.length !== mainSites.length

  let totalRev, totalEbitda, totalPat
  if (isFullYear) {
    totalRev    = sumAnnual(revTotalRow)
    totalEbitda = sumAnnual(ebitdaRow)
    totalPat    = sumAnnual(patRow)
  } else {
    totalRev    = sumMonthly(monthlyRevRow) * siteRatio
    totalEbitda = sumMonthly(monthlyEbitdaRow) * siteRatio
    totalPat    = totalEbitda
  }

  const ebitdaMargin = totalRev > 0 ? (totalEbitda / totalRev * 100) : 0
  const patMargin    = totalRev > 0 ? (totalPat / totalRev * 100) : 0

  const fullYearRev    = MONTH_LABELS.reduce((s, _, i) => s + (Number(monthlyRevRow?.values?.[i]) || 0), 0)
  const fullYearEbitda = MONTH_LABELS.reduce((s, _, i) => s + (Number(monthlyEbitdaRow?.values?.[i]) || 0), 0)
  const timeRatioRev    = !isFullYear && fullYearRev    !== 0 ? sumMonthly(monthlyRevRow)    / fullYearRev    : 1
  const timeRatioEbitda = !isFullYear && fullYearEbitda !== 0 ? sumMonthly(monthlyEbitdaRow) / fullYearEbitda : 1

  const siteBarsData = mainSites
    .filter(site => activeSel.includes(site))
    .map(site => ({
      name: site.length > 7 ? site.slice(0, 6) + '..' : site,
      fullName: site,
      revenue: (Number(revTotalRow?.values?.[site]) || 0) * timeRatioRev,
      ebitda:  (Number(ebitdaRow?.values?.[site])   || 0) * timeRatioEbitda,
      pat:     (Number(patRow?.values?.[site])       || 0) * timeRatioEbitda,
    }))
  const labelMap = Object.fromEntries(siteBarsData.map(d => [d.name, d.fullName]))

  const actuals2026ByMonth = {}
  Object.entries(actuals).forEach(([key, d]) => {
    if (!key.startsWith('2026-')) return
    const parts = key.split('-')
    const mo = parseInt(parts[1])
    const site = parts.slice(2).join('-') || d.site
    if (siteFilterActive && !activeSel.includes(site)) return
    if (!actuals2026ByMonth[mo]) actuals2026ByMonth[mo] = { revenue: 0, ebitda: 0 }
    actuals2026ByMonth[mo].revenue += d.rev_total || 0
    actuals2026ByMonth[mo].ebitda  += d.ebitda    || 0
  })

  const monthlyData = [
    ...MONTH_LABELS.map((m, i) => ({
      month: `${m}`,
      revenue: (Number(monthlyRevRow?.values?.[i])    || 0) * siteRatio,
      ebitda:  (Number(monthlyEbitdaRow?.values?.[i]) || 0) * siteRatio,
      selected: selectedMonthIndices.includes(i),
    })),
  ]

  const siteSummary = mainSites
    .filter(site => activeSel.includes(site))
    .map(site => {
      const rev    = Number(revTotalRow?.values?.[site]) || 0
      const ebitda = Number(ebitdaRow?.values?.[site]) || 0
      const pat    = Number(patRow?.values?.[site]) || 0
      return { site, rev, ebitda, pat, margin: rev > 0 ? ebitda / rev : 0 }
    })
    .sort((a, b) => b.rev - a.rev)

  const totalRevAll = siteSummary.reduce((s, r) => s + r.rev, 0)

  // ── Breakeven chart data
  const breakevenChartData = mainSites
    .filter(site => activeSel.includes(site))
    .map(site => {
      const annualRev   = Number(revTotalRow?.values?.[site]) || 0
      const monthlyAvg  = annualRev / 12
      const beRev       = Number(breakeven?.breakevenRevenue?.values?.[site]) || 0
      const fixedTotal  = (breakeven?.fixedCosts?.rows || [])
        .reduce((s, r) => s + (Number(r.values?.[site]) || 0), 0)
      const gap         = monthlyAvg - beRev
      const gapPct      = beRev > 0 ? (gap / beRev * 100) : 0
      const shortName   = site.length > 7 ? site.slice(0, 6) + '..' : site
      return { name: shortName, fullName: site, monthlyAvg, beRev, fixedTotal, gap, gapPct }
    })
    .sort((a, b) => b.gapPct - a.gapPct)

  const toggleSite = (site) => {
    setSelectedSites(prev => {
      const cur = prev || mainSites
      if (cur.includes(site)) {
        const next = cur.filter(s => s !== site)
        return next.length === 0 ? cur : next
      }
      return [...cur, site]
    })
  }

  const handlePresetClick = (key) => { setTimeMode('preset'); setPeriod(key) }
  const handleRangeStart  = (v) => {
    setTimeMode('range'); const n = Number(v); setRangeStart(n)
    if (n > rangeEnd) setRangeEnd(n)
  }
  const handleRangeEnd = (v) => {
    setTimeMode('range'); const n = Number(v); setRangeEnd(n)
    if (n < rangeStart) setRangeStart(n)
  }

  return (
    <div className="space-y-0 -mx-4 -mt-4">

      {/* ── TOP FILTER BAR ── */}
      <div style={{ background: NAVY }} className="px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Period presets */}
          <div className="flex items-center gap-1">
            {QUICK_PERIODS.slice(0, 5).map(p => (
              <button key={p.key} onClick={() => handlePresetClick(p.key)}
                className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                style={{
                  background: timeMode === 'preset' && period === p.key ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: timeMode === 'preset' && period === p.key ? NAVY : '#cbd5e1',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

          {/* Month shortcuts */}
          <div className="flex items-center gap-1">
            {QUICK_PERIODS.slice(5).map(p => (
              <button key={p.key} onClick={() => handlePresetClick(p.key)}
                className="px-2 py-1 rounded text-xs font-medium transition-all"
                style={{
                  background: timeMode === 'preset' && period === p.key ? '#fff' : 'transparent',
                  color: timeMode === 'preset' && period === p.key ? NAVY : '#94a3b8',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

          {/* Range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Từ</span>
            <select value={timeMode === 'range' ? rangeStart : ''} onChange={e => handleRangeStart(e.target.value)}
              className="text-xs rounded px-2 py-1 outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.12)', color: timeMode === 'range' ? '#fff' : '#94a3b8', border: 'none' }}>
              <option value="">--</option>
              {MONTH_LABELS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <span className="text-slate-400 text-xs">→</span>
            <select value={timeMode === 'range' ? rangeEnd : ''} onChange={e => handleRangeEnd(e.target.value)}
              className="text-xs rounded px-2 py-1 outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.12)', color: timeMode === 'range' ? '#fff' : '#94a3b8', border: 'none' }}>
              <option value="">--</option>
              {MONTH_LABELS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button onClick={() => setSelectedSites([...mainSites])}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={{
                background: !siteFilterActive ? '#fff' : 'rgba(255,255,255,0.12)',
                color: !siteFilterActive ? NAVY : '#cbd5e1',
              }}>
              Tất cả
            </button>
            {mainSites.map(site => (
              <button key={site} onClick={() => toggleSite(site)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={{
                  background: activeSel.includes(site) ? 'rgba(99,179,237,0.25)' : 'transparent',
                  color: activeSel.includes(site) ? '#93c5fd' : '#64748b',
                  border: activeSel.includes(site) ? '1px solid rgba(147,197,253,0.4)' : '1px solid transparent',
                }}>
                {site}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="px-4 pt-4 pb-4 space-y-4">

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-4 gap-3">

          {/* Revenue */}
          <div className="rounded-xl overflow-hidden shadow-md" style={{ background: NAVY2 }}>
            <div className="px-5 pt-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#93c5fd' }}>Doanh Thu</p>
              <p className="text-3xl font-bold text-white mt-1">{fmtB(totalRev)}</p>
              <p className="text-xs mt-1" style={{ color: '#93c5fd' }}>{periodLabel}</p>
              <div className="mt-3 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div className="h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.abs(ebitdaMargin))}%`, background: '#60a5fa' }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: '#7dd3fc' }}>
                EBITDA margin: {ebitdaMargin.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* EBITDA */}
          <div className="rounded-xl overflow-hidden shadow-md"
            style={{ background: totalEbitda >= 0 ? '#065f46' : '#7f1d1d' }}>
            <div className="px-5 pt-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6ee7b7' }}>EBITDA</p>
              <p className="text-3xl font-bold text-white mt-1">
                {totalEbitda >= 0 ? '+' : ''}{fmtB(totalEbitda)}
              </p>
              <p className="text-xs mt-1" style={{ color: '#6ee7b7' }}>{periodLabel}</p>
              <div className="mt-3 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, ebitdaMargin * 2))}%`,
                    background: totalEbitda >= 0 ? '#34d399' : '#f87171'
                  }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: '#6ee7b7' }}>
                Margin: {ebitdaMargin.toFixed(1)}% / Doanh thu
              </p>
            </div>
          </div>

          {/* Net Profit (PAT) */}
          <div className="rounded-xl overflow-hidden shadow-md"
            style={{ background: isFullYear && totalPat >= 0 ? '#1e1b4b' : '#3b1515' }}>
            <div className="px-5 pt-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#a5b4fc' }}>Net Profit (PAT)</p>
              <p className="text-3xl font-bold text-white mt-1">
                {totalPat >= 0 ? '+' : ''}{fmtB(totalPat)}
              </p>
              <p className="text-xs mt-1" style={{ color: '#a5b4fc' }}>
                {isFullYear ? periodLabel : 'Ước tính'}
              </p>
              <div className="mt-3 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, patMargin * 2.5))}%`,
                    background: totalPat >= 0 ? '#818cf8' : '#f87171'
                  }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: '#a5b4fc' }}>
                Margin: {patMargin.toFixed(1)}% / Doanh thu
              </p>
            </div>
          </div>

          {/* Sites summary mini-card */}
          <div className="rounded-xl shadow-md bg-white border border-gray-100">
            <div className="px-4 pt-3 pb-1" style={{ borderBottom: `3px solid ${NAVY2}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Hiệu Suất Chi Nhánh</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-3xl font-bold" style={{ color: NAVY2 }}>{activeSel.length}</span>
                <span className="text-sm text-gray-400 mb-1">/ {mainSites.length} sites</span>
              </div>
            </div>
            <div className="px-4 py-2 space-y-1">
              {[
                { label: 'Xuất sắc / Tốt', count: siteSummary.filter(s => s.margin >= 0.2).length, color: GREEN },
                { label: 'Trung bình',     count: siteSummary.filter(s => s.ebitda >= 0 && s.margin < 0.2).length, color: GOLD },
                { label: 'Lỗ EBITDA',      count: siteSummary.filter(s => s.ebitda < 0).length, color: RED },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CHARTS ROW 1: Revenue Trend + Site Revenue ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Monthly Revenue Trend — 2 cols */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `2px solid ${NAVY2}` }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Xu Hướng Doanh Thu & EBITDA</h3>
                <p className="text-xs text-gray-400">Theo tháng 2025 — VND triệu</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full text-white" style={{ background: NAVY2 }}>
                {periodLabel}
              </span>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => (v/1000).toFixed(0)+'k'}
                    axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="revenue" name="Doanh thu" fill="url(#revGrad)"
                    stroke="#3b82f6" strokeWidth={2.5}
                    dot={({ cx, cy, index }) => {
                      const d = monthlyData[index]
                      return <circle key={index} cx={cx} cy={cy} r={d?.selected ? 5 : 3}
                        fill={d?.selected ? NAVY2 : '#3b82f6'} stroke="white" strokeWidth={1.5} />
                    }} />
                  <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={GREEN} strokeWidth={2}
                    dot={({ cx, cy, index }) => {
                      const d = monthlyData[index]
                      const color = (d?.ebitda || 0) >= 0 ? GREEN : RED
                      return <circle key={index} cx={cx} cy={cy} r={3} fill={color} stroke="white" strokeWidth={1} />
                    }} />
                  <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue by site — 1 col */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3" style={{ borderBottom: `2px solid ${NAVY2}` }}>
              <h3 className="text-sm font-bold" style={{ color: NAVY }}>Doanh Thu / Chi Nhánh</h3>
              <p className="text-xs text-gray-400">{periodLabel} — triệu VND</p>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={siteBarsData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => (v/1000).toFixed(0)+'k'}
                    axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }}
                    axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<CustomTooltip labelMap={labelMap} />} />
                  <Bar dataKey="revenue" name="Doanh thu" radius={[0,4,4,0]} fill={BLUE} barSize={12}>
                    {siteBarsData.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? BLUE : '#60a5fa'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── CHARTS ROW 2: EBITDA + PAT by site ── */}
        <div className="grid grid-cols-2 gap-4">

          {/* EBITDA by site */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `2px solid #059669` }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: '#065f46' }}>EBITDA theo Chi Nhánh</h3>
                <p className="text-xs text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={siteBarsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => (v/1000).toFixed(1)+'k'}
                    axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
                  <Tooltip content={<CustomTooltip labelMap={labelMap} />} />
                  <Bar dataKey="ebitda" name="EBITDA" radius={[4,4,0,0]} barSize={28}>
                    {siteBarsData.map((entry, i) => (
                      <Cell key={i} fill={entry.ebitda >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Net Profit by site */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `2px solid #6366f1` }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: '#312e81' }}>Net Profit (PAT) theo Chi Nhánh</h3>
                <p className="text-xs text-gray-400">{isFullYear ? periodLabel : 'Ước tính — ' + periodLabel}</p>
              </div>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={siteBarsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => (v/1000).toFixed(1)+'k'}
                    axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
                  <Tooltip content={<CustomTooltip labelMap={labelMap} />} />
                  <Bar dataKey="pat" name="Net Profit" radius={[4,4,0,0]} barSize={28}>
                    {siteBarsData.map((entry, i) => (
                      <Cell key={i} fill={entry.pat >= 0 ? '#6366f1' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── BREAKEVEN ANALYSIS ── */}
        {breakeven && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)' }}>
              <div>
                <h3 className="text-sm font-bold text-white">Phân Tích Điểm Hòa Vốn — Doanh Thu Thực Tế vs Ngưỡng Hòa Vốn</h3>
                <p className="text-xs mt-0.5" style={{ color: '#fde68a' }}>
                  DT bình quân tháng (từ số liệu năm 2025) so với ngưỡng hòa vốn từ tháng 13
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: '#10b981' }} />
                  <span style={{ color: '#fde68a' }}>Đã vượt hòa vốn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />
                  <span style={{ color: '#fde68a' }}>Chưa đạt hòa vốn</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
              {/* Bar chart */}
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                  DT bình quân tháng vs Ngưỡng hòa vốn (triệu VND)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={breakevenChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v.toFixed(0)} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const d = breakevenChartData.find(x => x.name === label)
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                            <p className="font-bold text-gray-700 mb-1">{d?.fullName || label}</p>
                            {payload.map((p, i) => (
                              <p key={i} style={{ color: p.color }} className="font-medium">
                                {p.name}: {fmt(p.value)} tr.
                              </p>
                            ))}
                            {d && (
                              <p className={`font-bold mt-1 ${d.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {d.gap >= 0 ? '▲' : '▼'} Gap: {fmt(Math.abs(d.gap))} tr. ({d.gapPct.toFixed(1)}%)
                              </p>
                            )}
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="monthlyAvg" name="DT bình quân/tháng" radius={[4,4,0,0]} barSize={24}>
                      {breakevenChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.gap >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="beRev" name="Ngưỡng hòa vốn"
                      stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3"
                      dot={{ fill: '#f59e0b', r: 4, stroke: 'white', strokeWidth: 1.5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Gap table */}
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                  Chi tiết khoảng cách hòa vốn
                </p>
                <div className="space-y-2.5">
                  {breakevenChartData.map((d) => {
                    const pct = Math.min(100, Math.max(0, d.beRev > 0 ? (d.monthlyAvg / d.beRev * 100) : 0))
                    const over = d.gap >= 0
                    return (
                      <div key={d.fullName}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700">{d.fullName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              {fmt(d.monthlyAvg)} / {fmt(d.beRev)} tr.
                            </span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${over ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                              {over ? '+' : ''}{d.gapPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 relative">
                          {/* Breakeven target marker */}
                          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                            style={{ left: '100%', transform: 'translateX(-50%)' }} />
                          <div className="h-2 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: over
                                ? 'linear-gradient(90deg, #34d399, #10b981)'
                                : 'linear-gradient(90deg, #fca5a5, #ef4444)'
                            }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Summary */}
                <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Đã vượt hòa vốn',
                      count: breakevenChartData.filter(d => d.gap >= 0).length,
                      color: '#059669', bg: '#ecfdf5'
                    },
                    {
                      label: 'Chưa đạt hòa vốn',
                      count: breakevenChartData.filter(d => d.gap < 0).length,
                      color: '#dc2626', bg: '#fef2f2'
                    },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className="rounded-lg px-3 py-2 text-center" style={{ background: bg }}>
                      <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SITE PERFORMANCE TABLE ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: NAVY2 }}>
            <div>
              <h3 className="text-sm font-bold text-white">Hiệu Suất Chi Nhánh</h3>
              <p className="text-xs" style={{ color: '#93c5fd' }}>
                {activeSel.length} chi nhánh — {periodLabel}
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>
              Đơn vị: VND triệu
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Chi nhánh</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Doanh thu</th>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Tỷ trọng</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">EBITDA</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">PAT</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Margin</th>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {siteSummary.map((row, i) => {
                  const st = getSiteStatus(row.ebitda, row.margin)
                  const revPct = totalRevAll > 0 ? (row.rev / totalRevAll * 100) : 0
                  return (
                    <tr key={row.site}
                      className="border-b border-gray-50 hover:bg-blue-50 transition-colors"
                      style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-sm" style={{ color: NAVY }}>{row.site}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-gray-700">
                        {fmt(row.rev)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${revPct}%`, background: BLUE }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{revPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono text-sm font-semibold`}
                        style={{ color: row.ebitda >= 0 ? GREEN : RED }}>
                        {row.ebitda >= 0 ? '+' : ''}{fmt(row.ebitda)}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono text-sm font-semibold`}
                        style={{ color: row.pat >= 0 ? '#6366f1' : RED }}>
                        {row.pat >= 0 ? '+' : ''}{fmt(row.pat)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, Math.max(0, row.margin * 200))}%`,
                                background: row.ebitda >= 0 ? GREEN : RED
                              }} />
                          </div>
                          <span className="text-xs font-semibold w-10 text-right"
                            style={{ color: row.ebitda >= 0 ? GREEN : RED }}>
                            {(row.margin * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {/* Total row */}
                {siteSummary.length > 1 && (() => {
                  const totRev  = siteSummary.reduce((s, r) => s + r.rev, 0)
                  const totEbt  = siteSummary.reduce((s, r) => s + r.ebitda, 0)
                  const totPat  = siteSummary.reduce((s, r) => s + r.pat, 0)
                  const totMgn  = totRev > 0 ? totEbt / totRev : 0
                  return (
                    <tr style={{ background: NAVY2 }}>
                      <td className="py-3 px-4 font-bold text-white text-sm">Tổng cộng</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white text-sm">{fmt(totRev)}</td>
                      <td className="py-3 px-4">
                        <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: '100%', background: '#60a5fa' }} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm"
                        style={{ color: totEbt >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                        {totEbt >= 0 ? '+' : ''}{fmt(totEbt)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm"
                        style={{ color: totPat >= 0 ? '#a5b4fc' : '#fca5a5' }}>
                        {totPat >= 0 ? '+' : ''}{fmt(totPat)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-bold" style={{ color: totEbt >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                          {(totMgn * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4" />
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
