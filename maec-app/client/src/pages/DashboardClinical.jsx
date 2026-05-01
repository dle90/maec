import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { getDashboardToday, getDashboardExtras } from '../api'

const MODALITY_COLORS = { CT: '#3b82f6', MRI: '#8b5cf6', US: '#10b981', XR: '#f59e0b' }
const fmt = (n) => (n == null ? '0' : Number(n).toLocaleString('vi-VN'))
const fmtTAT = (min) => {
  if (!min) return '—'
  if (min < 60) return `${min} phút`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m ? ' ' + m + 'p' : ''}`
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

export default function DashboardClinical() {
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

  if (loading || !today || !extras) return <div className="text-gray-500 p-4">Đang tải bảng điều khiển lâm sàng...</div>

  const { summary, byModality, activeRadiologists } = today
  const topRads = (activeRadiologists || []).slice(0, 5)
  const modalityData = (byModality || []).map(m => ({ ...m, color: MODALITY_COLORS[m.modality] || '#64748b' }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Dashboard — Lâm Sàng</h2>
          <div className="text-xs text-gray-500 mt-0.5">Chẩn đoán hình ảnh · Cập nhật {new Date(today.ts).toLocaleTimeString('vi-VN')}</div>
        </div>
        <button onClick={refresh} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">↻ Làm mới</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ca chụp hôm nay" value={fmt(summary.todayCount)} sub={`${summary.weekCount} ca / 7 ngày`} color="text-blue-700" icon="🩻" onClick={() => navigate('/ris')} />
        <StatCard label="Đang chờ đọc" value={fmt(summary.pendingCount)} sub="Scheduled / reading" color="text-amber-700" icon="⏳" onClick={() => navigate('/ris')} />
        <StatCard
          label="TAT trung bình (hôm nay)"
          value={fmtTAT(extras.avgTATMinutes)}
          sub={`${extras.reportedTodayCount} ca đã có KQ`}
          color="text-indigo-700" icon="⏱"
        />
        <StatCard
          label="Phát hiện nghiêm trọng"
          value={fmt(summary.criticalCount)}
          sub={summary.criticalCount > 0 ? 'Chưa xác nhận' : '7 ngày gần đây'}
          color={summary.criticalCount > 0 ? 'text-red-700' : 'text-gray-500'}
          bg={summary.criticalCount > 0 ? 'bg-red-50' : 'bg-white'}
          icon="⚠"
          onClick={() => navigate('/ris?view=critical')}
        />
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Ca chụp 7 ngày qua</h3>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={extras.casesLast7Days}>
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickFormatter={(v) => v?.slice(5)} />
              <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Số ca" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Tỷ trọng modality (hôm nay)</h3>
          {modalityData.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</div>
          ) : (
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={modalityData}>
                  <XAxis dataKey="modality" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" name="Số ca">
                    {modalityData.map((m, i) => <Cell key={i} fill={m.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Top bác sĩ đọc (hôm nay)</h3>
          {topRads.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500"><th className="text-left py-1">BS.</th><th className="text-right">Số ca</th></tr></thead>
              <tbody>
                {topRads.map(r => (
                  <tr key={r.username} className="border-t">
                    <td className="py-1.5 text-gray-700">{r.name}</td>
                    <td className="py-1.5 text-right font-mono">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Phát hiện nghiêm trọng (7 ngày qua)</h3>
        {(extras.criticalFindings7d || []).length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">Không có phát hiện nghiêm trọng</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500">
              <th className="text-left py-1">Thời gian</th>
              <th className="text-left">BS.</th>
              <th className="text-left">Ghi chú</th>
              <th className="text-center">Xác nhận</th>
            </tr></thead>
            <tbody>
              {extras.criticalFindings7d.map(c => (
                <tr key={c._id} className="border-t">
                  <td className="py-1.5 text-gray-500">{c.finalizedAt ? new Date(c.finalizedAt).toLocaleString('vi-VN') : '—'}</td>
                  <td className="py-1.5 text-gray-700">{c.radiologistName || '—'}</td>
                  <td className="py-1.5 text-gray-600 truncate max-w-[320px]">{c.criticalNote || '—'}</td>
                  <td className="py-1.5 text-center">{c.ackedBy ? <span className="text-green-700">✓</span> : <span className="text-amber-600">○</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
