import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { getDashboardToday, getDashboardExtras } from '../api'

const fmt = (n) => (n == null ? '0' : Number(n).toLocaleString('vi-VN'))

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

export default function DashboardOps() {
  const [today, setToday] = useState(null)
  const [extras, setExtras] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const refresh = async () => {
    try {
      const [t, e] = await Promise.all([getDashboardToday(), getDashboardExtras()])
      setToday(t); setExtras(e)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 60_000)
    return () => clearInterval(iv)
  }, [])

  if (loading || !today || !extras) return <div className="text-gray-500 p-4">Đang tải bảng điều khiển vận hành...</div>

  const { summary, bySite, hourly } = today
  const completedToday = summary.todayCount - summary.pendingCount
  const unpaidCount = extras.unpaidInvoices?.count || 0
  const unpaidAmount = extras.unpaidInvoices?.amount || 0
  const expiring = extras.expiringLots || { count: 0, items: [] }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Dashboard — Vận Hành</h2>
          <div className="text-xs text-gray-500 mt-0.5">Cập nhật {new Date(today.ts).toLocaleTimeString('vi-VN')}</div>
        </div>
        <button onClick={refresh} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">↻ Làm mới</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ca hôm nay" value={fmt(summary.todayCount)} sub={`${fmt(completedToday)} hoàn thành`} color="text-blue-700" icon="🩻" onClick={() => navigate('/ris')} />
        <StatCard label="Doanh thu hôm nay" value={fmt(summary.revenueToday)} sub={`${summary.invoiceCountToday} hóa đơn`} color="text-emerald-700" icon="💰" onClick={() => navigate('/billing')} />
        <StatCard
          label="Công nợ chưa thu"
          value={fmt(unpaidAmount)}
          sub={`${unpaidCount} hóa đơn`}
          color={unpaidCount > 0 ? 'text-amber-700' : 'text-gray-500'}
          icon="🧾"
          onClick={() => navigate('/billing')}
        />
        <StatCard
          label="Cảnh báo kho"
          value={fmt(summary.lowStockCount + expiring.count)}
          sub={`${summary.lowStockCount} hết / ${expiring.count} sắp hết hạn`}
          color={(summary.lowStockCount + expiring.count) > 0 ? 'text-orange-700' : 'text-gray-500'}
          bg={(summary.lowStockCount + expiring.count) > 0 ? 'bg-orange-50' : 'bg-white'}
          icon="📦"
          onClick={() => navigate('/inventory')}
        />
      </div>

      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Phân bổ ca theo giờ (hôm nay vs hôm qua)</h3>
          <div className="flex gap-3 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 bg-blue-500 rounded mr-1"></span>Hôm nay</span>
            <span><span className="inline-block w-3 h-3 bg-gray-300 rounded mr-1"></span>Hôm qua</span>
          </div>
        </div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={hourly}>
              <XAxis dataKey="hour" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="yesterday" stroke="#cbd5e1" strokeWidth={2} dot={false} name="Hôm qua" />
              <Line type="monotone" dataKey="today" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} name="Hôm nay" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ca theo site (hôm nay)</h3>
          {(!bySite || bySite.length === 0) ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={bySite} layout="vertical" margin={{ left: 40 }}>
                  <XAxis type="number" stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="site" stroke="#9ca3af" fontSize={11} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="completed" stackId="a" fill="#10b981" name="Hoàn thành" />
                  <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Đang chờ" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Lô vật tư sắp hết hạn (30 ngày)</h3>
          {expiring.count === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Không có lô nào sắp hết hạn</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-left py-1">Vật tư</th>
                <th className="text-left">Site</th>
                <th className="text-right">SL còn</th>
                <th className="text-right">Hết hạn</th>
              </tr></thead>
              <tbody>
                {expiring.items.map(l => (
                  <tr key={l._id} className="border-t">
                    <td className="py-1.5 text-gray-700 truncate max-w-[160px]">{l.supplyId || '—'}</td>
                    <td className="py-1.5 text-gray-600">{l.site || '—'}</td>
                    <td className="py-1.5 text-right font-mono">{l.currentQuantity}</td>
                    <td className="py-1.5 text-right font-mono text-orange-700">{l.expiryDate?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
