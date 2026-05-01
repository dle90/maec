import React, { useEffect, useState, useMemo } from 'react'
import api from '../api'

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const calcWait = (iso) => {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 0) return '—'
  if (mins < 60) return `${mins}p`
  return `${Math.floor(mins / 60)}h${mins % 60}p`
}

export default function TeleradAdmin() {
  const [studies, setStudies] = useState([])
  const [radiologists, setRadiologists] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pool')
  const [reassigning, setReassigning] = useState(null) // study._id currently being reassigned
  const [reassignTarget, setReassignTarget] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const [studiesRes, radRes] = await Promise.all([
        api.get('/ris/studies'),
        api.get('/ris/radiologists'),
      ])
      setStudies(studiesRes.data || [])
      setRadiologists(radRes.data || [])
    } catch {} finally { setLoading(false) }
  }

  const pool = studies.filter(s => s.status === 'pending_read' && !s.radiologist)
  const reading = studies.filter(s => s.status === 'reading')
  const done = studies.filter(s => s.status === 'reported' || s.status === 'verified')

  const TABS = [
    { key: 'pool', label: 'Pool chưa nhận', list: pool, color: 'bg-yellow-400' },
    { key: 'reading', label: 'Đang đọc', list: reading, color: 'bg-orange-400' },
    { key: 'done', label: 'Hoàn thành', list: done, color: 'bg-green-500' },
  ]

  const currentList = TABS.find(t => t.key === tab)?.list || []

  // Radiologist workload
  const radWorkload = useMemo(() => {
    const map = {}
    radiologists.forEach(r => { map[r.username] = { ...r, active: 0, done: 0 } })
    studies.forEach(s => {
      if (!s.radiologist || !map[s.radiologist]) return
      if (s.status === 'reading') map[s.radiologist].active++
      if (s.status === 'reported' || s.status === 'verified') map[s.radiologist].done++
    })
    return Object.values(map)
  }, [studies, radiologists])

  const handleReassign = async (studyId) => {
    if (!reassignTarget) return
    const rad = radiologists.find(r => r.username === reassignTarget)
    try {
      await api.post(`/ris/studies/${studyId}/assign`, {
        radiologistId: reassignTarget,
        radiologistName: rad?.displayName || reassignTarget,
      })
      setReassigning(null)
      setReassignTarget('')
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi phân công')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Giám sát đọc phim</h1>
          <p className="text-xs text-gray-400 mt-0.5">Pool + tải việc theo bác sĩ. Admin có thể phân công lại.</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">⟳ Làm mới</button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {TABS.map(t => (
          <div key={t.key} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className={`h-1 ${t.color}`} />
            <div className="px-4 py-3">
              <div className="text-xs text-gray-500 font-medium">{t.label}</div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{t.list.length}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left: Radiologist workload */}
        <div className="w-[260px] flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Tải việc BS</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {radWorkload.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">Chưa có BS</div>}
            {radWorkload.map(r => (
              <div key={r.username} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.active > 0 ? 'bg-orange-400' : 'bg-green-400'}`} />
                  <span className="text-sm font-medium text-gray-800 truncate">{r.displayName}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>Đang đọc: <span className={`font-medium ${r.active > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{r.active}</span></span>
                  <span>Hoàn thành: <span className="font-medium text-green-600">{r.done}</span></span>
                </div>
                {r.department && <div className="text-xs text-gray-400 mt-0.5">{r.department}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Case list */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-0 border-b border-gray-200 mb-4">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setReassigning(null) }}
                className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.label}
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.list.length}</span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['STT', 'Mã BN', 'Bệnh nhân', 'Modality', 'Cơ sở', 'Thời gian', 'Chờ', 'BS', 'Tác vụ'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentList.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">Không có ca nào</td></tr>
                  ) : currentList.map((s, i) => (
                    <tr key={s._id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{s.patientId || '—'}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{s.patientName || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">{s.modality}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{s.site || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(s.assignedAt || s.createdAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{calcWait(s.createdAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{s.radiologistName || <span className="text-gray-300">Chưa nhận</span>}</td>
                      <td className="px-3 py-2.5">
                        {reassigning === s._id ? (
                          <div className="flex items-center gap-1">
                            <select value={reassignTarget} onChange={e => setReassignTarget(e.target.value)}
                              className="border border-gray-200 rounded px-2 py-1 text-xs outline-none">
                              <option value="">— BS —</option>
                              {radiologists.map(r => (
                                <option key={r.username} value={r.username}>{r.displayName}</option>
                              ))}
                            </select>
                            <button onClick={() => handleReassign(s._id)} disabled={!reassignTarget}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">OK</button>
                            <button onClick={() => { setReassigning(null); setReassignTarget('') }}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">Hủy</button>
                          </div>
                        ) : (
                          <button onClick={() => { setReassigning(s._id); setReassignTarget(s.radiologist || '') }}
                            className="text-xs text-blue-600 hover:text-blue-800">Phân công lại</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
