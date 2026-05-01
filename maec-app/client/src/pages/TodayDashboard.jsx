import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const MODALITY_COLORS = { CT: '#3b82f6', MRI: '#8b5cf6', US: '#10b981', XR: '#f59e0b' }

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

export default function TodayDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const refresh = async () => {
    try {
      const r = await api.get('/dashboard/today')
      setData(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30_000)
    return () => clearInterval(iv)
  }, [])

  if (loading || !data) return <div className="text-gray-500 p-4">Đang tải bảng điều khiển...</div>

  const { summary, bySite, byModality, hourly, activeRadiologists, criticalFindings } = data
  const dod = summary.todayCount - summary.yesterdayCount
  const dodPct = summary.yesterdayCount ? ((dod / summary.yesterdayCount) * 100).toFixed(0) : 0
  const completedPct = summary.todayCount ? Math.round(((summary.todayCount - summary.pendingCount) / summary.todayCount) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Bảng điều khiển hôm nay</h2>
          <div className="text-xs text-gray-500 mt-0.5">Cập nhật mỗi 30 giây · {new Date(data.ts).toLocaleTimeString('vi-VN')}</div>
        </div>
        <button onClick={refresh} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">↻ Làm mới</button>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          label="Ca chụp hôm nay" value={summary.todayCount}
          sub={dod >= 0 ? `▲ +${dod} (+${dodPct}%) so với hôm qua` : `▼ ${dod} (${dodPct}%) so với hôm qua`}
          color={dod >= 0 ? 'text-green-700' : 'text-red-700'} icon="🩻"
        />
        <StatCard label="Đang chờ xử lý" value={summary.pendingCount} sub={`${completedPct}% hoàn thành`} color="text-amber-700" icon="⏳" onClick={() => navigate('/ris')} />
        <StatCard label="Ca tuần qua" value={summary.weekCount} sub="7 ngày gần nhất" color="text-blue-700" icon="📅" />
        <StatCard
          label="Phát hiện nghiêm trọng" value={summary.criticalCount}
          sub={summary.criticalCount > 0 ? 'Cần xác nhận' : 'Không có'}
          color={summary.criticalCount > 0 ? 'text-red-700' : 'text-gray-500'} bg={summary.criticalCount > 0 ? 'bg-red-50' : 'bg-white'} icon="⚠"
          onClick={() => navigate('/ris?view=critical')}
        />
        <StatCard label="Doanh thu hôm nay" value={fmtMoney(summary.revenueToday)} sub={`${summary.invoiceCountToday} hóa đơn`} color="text-emerald-700" icon="💰" onClick={() => navigate('/billing')} />
        <StatCard label="Vật tư cảnh báo" value={summary.lowStockCount} sub="Dưới định mức" color={summary.lowStockCount > 0 ? 'text-orange-700' : 'text-gray-500'} icon="📦" onClick={() => navigate('/inventory')} />
      </div>

      {/* Hourly trend chart */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Phân bổ ca chụp theo giờ</h3>
          <div className="flex gap-3 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 bg-blue-500 rounded mr-1"></span>Hôm nay</span>
            <span><span className="inline-block w-3 h-3 bg-gray-300 rounded mr-1"></span>Hôm qua</span>
          </div>
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={hourly}>
              <XAxis dataKey="hour" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="yesterday" stroke="#cbd5e1" strokeWidth={2} dot={false} name="Hôm qua" />
              <Line type="monotone" dataKey="today" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} name="Hôm nay" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* By site */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Hiệu suất theo site (hôm nay)</h3>
          {bySite.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500"><th className="text-left py-1">Site</th><th className="text-right">Tổng</th><th className="text-right">Done</th><th className="text-right">Pending</th></tr></thead>
              <tbody>
                {bySite.map(s => (
                  <tr key={s.site} className="border-t">
                    <td className="py-1.5 text-gray-700">{s.site}</td>
                    <td className="py-1.5 text-right font-mono">{s.total}</td>
                    <td className="py-1.5 text-right font-mono text-green-700">{s.completed}</td>
                    <td className="py-1.5 text-right font-mono text-amber-600">{s.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By modality */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Theo modality (hôm nay)</h3>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={byModality}>
                <XAxis dataKey="modality" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {byModality.map((r, i) => <Cell key={i} fill={MODALITY_COLORS[r.modality] || '#94a3b8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active radiologists */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">BS đọc đang hoạt động</h3>
          {activeRadiologists.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có ca</div>
          ) : (
            <ul className="space-y-1.5">
              {activeRadiologists.slice(0, 8).map(r => (
                <li key={r.username} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{r.name}</span>
                  <span className="bg-blue-100 text-blue-700 text-xs font-mono px-2 py-0.5 rounded">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Critical findings inline */}
      {criticalFindings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
            ⚠ Phát hiện nghiêm trọng chưa xác nhận
            <button onClick={() => navigate('/ris?view=critical')} className="text-xs text-red-600 hover:underline ml-auto">Mở trang →</button>
          </h3>
          <ul className="space-y-1 text-sm">
            {criticalFindings.slice(0, 5).map(c => (
              <li key={c._id} className="flex items-center gap-3 py-1">
                <span className="text-red-500">●</span>
                <span className="text-gray-700 flex-1">{c.criticalNote || '(không có ghi chú)'}</span>
                <span className="text-xs text-gray-500">{c.radiologistName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
