import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtMonthVi = (m) => {
  if (!m || m.length < 7) return m
  return `T${parseInt(m.slice(5, 7), 10)}/${m.slice(2, 4)}`
}
const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const SITE_COLORS = {
  'Trung Kính': '#2563eb',
  'Kim Giang':  '#10b981',
  'unknown':    '#9ca3af',
  'default':    '#9ca3af',
}

const STATUS_PILL = {
  scheduled:   { label: 'Chờ',    cls: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'Đang khám', cls: 'bg-yellow-100 text-yellow-700' },
  completed:   { label: 'Xong',   cls: 'bg-blue-100 text-blue-700' },
  paid:        { label: 'Đã trả', cls: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Hủy',    cls: 'bg-red-100 text-red-700' },
}

export default function Dashboard() {
  const { auth } = useAuth()
  const name = auth?.displayName || auth?.username || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get('/reports/maec-overview')
      .then(r => { if (!cancelled) { setData(r.data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Sites that appear anywhere in the response — drives chart series + KPI splits
  const sites = data ? deriveSites(data) : []
  const monthlyChartData = (data?.monthly || []).map(m => ({
    month: fmtMonthVi(m.month),
    ...sites.reduce((acc, s) => ({ ...acc, [s]: m.bySite?.[s] || 0 }), {}),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tổng quan</h1>
          <p className="text-xs text-gray-500 mt-0.5">{name && `Xin chào, ${name} · `}Doanh thu lượt khám đã thanh toán + hàng đợi tiếp đón hôm nay.</p>
        </div>
        <div className="text-xs text-gray-400 font-mono">{new Date().toLocaleString('vi-VN')}</div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Hôm nay" data={data?.today} loading={loading} sites={sites} accent="blue" />
        <KpiCard label="Tuần này (WTD)" data={data?.wtd} loading={loading} sites={sites} accent="indigo" />
        <KpiCard label="Tháng này (MTD)" data={data?.mtd} loading={loading} sites={sites} accent="violet" />
        <KpiCard label="Năm này (YTD)" data={data?.ytd} loading={loading} sites={sites} accent="emerald" />
      </div>

      {/* Chart + today's check-ins */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Doanh thu 12 tháng gần đây — theo cơ sở</h2>
          {loading ? (
            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Đang tải…</div>
          ) : monthlyChartData.length === 0 || sites.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu doanh thu.</div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip
                  formatter={(v) => `${fmtMoney(v)} đ`}
                  labelFormatter={(l) => `Tháng ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sites.map(s => (
                  <Bar key={s} dataKey={s} stackId="a" fill={SITE_COLORS[s] || SITE_COLORS.default} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Lượt khám hôm nay</h2>
            <span className="text-xs text-gray-400">{(data?.todayCheckIns || []).length}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-96">
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Đang tải…</div>
            ) : (data?.todayCheckIns || []).length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Chưa có lượt khám hôm nay.</div>
            ) : data.todayCheckIns.map(e => {
              const pill = STATUS_PILL[e.status] || STATUS_PILL.scheduled
              return (
                <Link key={e._id} to={`/kham?id=${encodeURIComponent(e._id)}`}
                  className="block px-3 py-2 hover:bg-blue-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 truncate flex-1">{e.patientName || '—'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${pill.cls} flex-shrink-0`}>{pill.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{e.patientId}</span>
                    <span>·</span>
                    <span className="truncate">{e.site || '—'}</span>
                    <span className="ml-auto font-mono text-blue-700">{fmtMoney(e.billTotal)}đ</span>
                    <span className="font-mono text-gray-400 text-[10px]">{fmtTime(e.createdAt)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, data, loading, sites, accent }) {
  const accentMap = {
    blue:    'border-l-blue-500',
    indigo:  'border-l-indigo-500',
    violet:  'border-l-violet-500',
    emerald: 'border-l-emerald-500',
  }
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${accentMap[accent] || 'border-l-gray-400'} p-4`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-2xl font-bold text-gray-900 font-mono mt-1">
        {loading ? <span className="text-gray-300">—</span> : `${fmtMoney(data?.total || 0)}đ`}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">
        {data?.encounters || 0} lượt thanh toán
      </div>
      {!loading && sites.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs">
          {sites.map(s => (
            <div key={s} className="flex items-center gap-2 text-gray-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SITE_COLORS[s] || SITE_COLORS.default }} />
              <span className="truncate flex-1">{s}</span>
              <span className="font-mono">{fmtMoney(data?.bySite?.[s] || 0)}đ</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function deriveSites(d) {
  const set = new Set()
  for (const k of ['today', 'wtd', 'mtd', 'ytd']) {
    Object.keys(d[k]?.bySite || {}).forEach(s => set.add(s))
  }
  for (const m of d.monthly || []) Object.keys(m.bySite || {}).forEach(s => set.add(s))
  // Stable order: known sites first, then alphabetical for others
  const known = ['Trung Kính', 'Kim Giang']
  const other = [...set].filter(s => !known.includes(s)).sort()
  return [...known.filter(s => set.has(s)), ...other]
}
