import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Report Editor (inline, not modal) ────────────────────────────────────────

function InlineReportEditor({ study, onSaved }) {
  const [form, setForm] = useState({ technique: '', clinicalInfo: '', findings: '', impression: '', recommendation: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/ris/reports/${study._id}`)
      .then(r => setForm({
        technique: r.data.technique || '',
        clinicalInfo: r.data.clinicalInfo || study.clinicalInfo || '',
        findings: r.data.findings || '',
        impression: r.data.impression || '',
        recommendation: r.data.recommendation || '',
      }))
      .catch(() => setForm(f => ({ ...f, clinicalInfo: study.clinicalInfo || '' })))
      .finally(() => setLoading(false))
  }, [study._id])

  const save = async (status) => {
    setSaving(true)
    try {
      await api.post('/ris/reports', { studyId: study._id, studyUID: study.studyUID, ...form, status })
      onSaved()
    } finally { setSaving(false) }
  }

  const openViewer = async () => {
    if (!study.studyUID) return
    try {
      const res = await api.get(`/ris/orthanc/viewer-url/${encodeURIComponent(study.studyUID)}`)
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {}
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-y'

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Đang tải...</div>

  return (
    <div className="space-y-4">
      {/* Patient info bar */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-semibold text-gray-800">{study.patientName}</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-sm text-gray-500">{study.patientId}</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-sm text-gray-500">{study.gender === 'M' ? 'Nam' : 'Nữ'}</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">{study.modality}</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-sm text-gray-500">{study.site}</span>
          </div>
          <button onClick={openViewer}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium transition-colors">
            Xem ảnh DICOM
          </button>
        </div>
        {study.clinicalInfo && (
          <div className="mt-2 text-sm text-gray-600">
            <span className="text-gray-400">Chỉ định:</span> {study.clinicalInfo}
          </div>
        )}
      </div>

      {/* Report form */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Kỹ thuật chụp</label>
          <textarea rows={2} value={form.technique} onChange={e => setForm(f => ({ ...f, technique: e.target.value }))} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả hình ảnh (Findings)</label>
          <textarea rows={6} value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} className={inputCls}
            placeholder="Mô tả chi tiết các bất thường phát hiện trên hình ảnh..." />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Kết luận (Impression)</label>
          <textarea rows={3} value={form.impression} onChange={e => setForm(f => ({ ...f, impression: e.target.value }))} className={inputCls}
            placeholder="Kết luận chẩn đoán..." />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Đề nghị (Recommendation)</label>
          <textarea rows={2} value={form.recommendation} onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))} className={inputCls} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => save('final')}
          disabled={saving || !form.findings.trim() || !form.impression.trim()}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
          {saving ? 'Đang lưu...' : 'Hoàn thành & Ký'}
        </button>
        <button onClick={() => save('preliminary')} disabled={saving}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 font-medium transition-colors">
          Lưu tạm
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeleradReading() {
  const { auth } = useAuth()
  const [studies, setStudies] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('reading')
  const [activeStudy, setActiveStudy] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const res = await api.get('/ris/studies')
      // BS chỉ thấy case mình đã nhận (đã pick)
      const myStudies = (res.data || []).filter(s => s.radiologist === auth.username)
      setStudies(myStudies)
    } catch {} finally { setLoading(false) }
  }

  const reading = studies.filter(s => s.status === 'reading')
  const done = studies.filter(s => s.status === 'reported' || s.status === 'verified')

  const TABS = [
    { key: 'reading', label: 'Đang đọc', list: reading },
    { key: 'done', label: 'Hoàn thành', list: done },
  ]

  const currentList = TABS.find(t => t.key === tab)?.list || []

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
          <h1 className="text-xl font-bold text-gray-800">Ca đọc — Của tôi</h1>
          <p className="text-xs text-gray-400 mt-0.5">BS. {auth.displayName || auth.username} {auth.department ? `— ${auth.department}` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">{reading.length} đang đọc</span>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">{done.length} hoàn thành</span>
          <button onClick={load} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">⟳</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setActiveStudy(null) }}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.list.length}</span>
          </button>
        ))}
      </div>

      {/* Active study editor */}
      {activeStudy && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Đang đọc phim</h3>
            <button onClick={() => setActiveStudy(null)} className="text-xs text-gray-400 hover:text-gray-600">Đóng</button>
          </div>
          <InlineReportEditor study={activeStudy} onSaved={() => { setActiveStudy(null); load() }} />
        </div>
      )}

      {/* Table */}
      {!activeStudy && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['STT', 'Mã BN', 'Bệnh nhân', 'Modality', 'Cơ sở', 'Chỉ định', 'Thời gian gửi', 'Ưu tiên', 'Thao tác'].map(h => (
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
                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{s.clinicalInfo || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(s.assignedAt)}</td>
                    <td className="px-3 py-2.5">
                      {s.priority === 'urgent' && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Khẩn</span>}
                      {s.priority === 'stat' && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Cấp cứu</span>}
                      {(!s.priority || s.priority === 'routine') && <span className="text-xs text-gray-400">Thường</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {tab === 'reading' && (
                        <button onClick={() => setActiveStudy(s)}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium transition-colors">
                          Đọc phim
                        </button>
                      )}
                      {tab === 'done' && (
                        <button onClick={() => setActiveStudy(s)}
                          className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 font-medium transition-colors">
                          Xem KQ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
