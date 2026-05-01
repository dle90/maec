import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import CaseTabBar from '../components/CaseTabBar'
import PatientDetailView from '../components/PatientDetailView'
import CompleteStudyModal from '../components/CompleteStudyModal'
import CriticalFindings from './CriticalFindings'

// System tab IDs (must not collide with study _ids)
const SYS_WORKLIST = '__worklist__'
const SYS_CRITICAL = '__critical__'

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <div className="font-bold mb-2">Lỗi RIS:</div>
          <pre className="text-xs whitespace-pre-wrap">{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const calcWaitTime = (iso) => {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '—'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} phút`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs} giờ ${remMins} phút`
}

// ─── Status Tab Config ────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: 'waiting',      label: 'CHỜ THỰC HIỆN',   statuses: ['scheduled'] },
  { key: 'in_progress',  label: 'ĐANG THỰC HIỆN',  statuses: ['in_progress'] },
  { key: 'pending_read', label: 'CHỜ KẾT QUẢ',     statuses: ['pending_read', 'reading'] },
  { key: 'completed',    label: 'HOÀN THÀNH',       statuses: ['reported', 'verified'] },
  { key: 'cancelled',    label: 'HUỶ',              statuses: ['cancelled'] },
]

// ─── Shared Badges ────────────────────────────────────────────────────────────

function ImageStatusBadge({ imageStatus, imageCount, studyUID }) {
  const CONFIG = {
    no_images:  { label: 'Chưa có ảnh', cls: 'bg-gray-100 text-gray-400' },
    receiving:  { label: 'Đang nhận…',  cls: 'bg-blue-100 text-blue-600 animate-pulse' },
    available:  { label: 'Có ảnh DICOM', cls: 'bg-emerald-100 text-emerald-700' },
  }
  const c = CONFIG[imageStatus] || CONFIG.no_images
  const [opening, setOpening] = React.useState(false)

  const openViewer = async (e) => {
    e.preventDefault()
    setOpening(true)
    try {
      const res = await api.get(`/ris/orthanc/viewer-url/${encodeURIComponent(studyUID)}`)
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${c.cls}`}>
        {c.label}{imageCount > 0 ? ` (${imageCount})` : ''}
      </span>
      {imageStatus === 'available' && (
        <button onClick={openViewer} disabled={opening}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap">
          {opening ? '...' : 'Xem ảnh'}
        </button>
      )}
    </div>
  )
}

// ─── ReportEditor Modal ────────────────────────────────────────────────────────

function ReportEditor({ study, onClose, onSaved }) {
  const [form, setForm] = useState({ technique: '', clinicalInfo: '', findings: '', impression: '', recommendation: '', criticalFinding: false, criticalNote: '' })
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
        criticalFinding: !!r.data.criticalFinding,
        criticalNote: r.data.criticalNote || '',
      }))
      .catch(() => setForm(f => ({ ...f, clinicalInfo: study.clinicalInfo || '' })))
      .finally(() => setLoading(false))
  }, [study._id])

  const save = async (status) => {
    setSaving(true)
    try {
      await api.post('/ris/reports', { studyId: study._id, studyUID: study.studyUID, ...form, status })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // ── Template picker + critical finding ─────────────────────────────
  const [templates, setTemplates] = useState([])
  useEffect(() => {
    api.get('/templates', { params: { modality: study.modality, bodyPart: study.bodyPart } })
      .then(r => setTemplates(r.data || []))
      .catch(() => {})
  }, [study.modality, study.bodyPart])

  const applyTemplate = async (t) => {
    if (!t) return
    if ((form.findings || form.impression) && !confirm('Áp dụng mẫu sẽ ghi đè nội dung đang có. Tiếp tục?')) return
    setForm(f => ({
      ...f,
      technique: t.technique || f.technique,
      clinicalInfo: t.clinicalInfo || f.clinicalInfo,
      findings: t.findings || f.findings,
      impression: t.impression || f.impression,
      recommendation: t.recommendation || f.recommendation,
    }))
    try { await api.post(`/templates/${t._id}/use`) } catch {}
  }

  const TextField = ({ label, name, rows = 3 }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <textarea rows={rows} value={form[name]}
        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-y" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Kết quả đọc phim</h2>
            <p className="text-xs text-gray-400 mt-0.5">{study.patientName} · {study.modality} · {study.bodyPart || '—'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Đang tải...</div>
          ) : (
            <>
              {/* Template picker */}
              {templates.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700">📋 Mẫu kết quả:</span>
                  <select onChange={e => { applyTemplate(templates.find(t => t._id === e.target.value)); e.target.value = '' }}
                    className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm bg-white" defaultValue="">
                    <option value="">Chọn mẫu để áp dụng nhanh ({templates.length} mẫu)</option>
                    {templates.map(t => (
                      <option key={t._id} value={t._id}>{t.name}{t.useCount ? ` · dùng ${t.useCount} lần` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <TextField label="Kỹ thuật chụp" name="technique" rows={2} />
              <TextField label="Thông tin lâm sàng" name="clinicalInfo" rows={2} />
              <TextField label="Mô tả hình ảnh (Findings)" name="findings" rows={5} />
              <TextField label="Kết luận (Impression)" name="impression" rows={3} />
              <TextField label="Đề nghị (Recommendation)" name="recommendation" rows={2} />

              {/* Critical finding toggle */}
              <div className={`rounded-lg p-3 border ${form.criticalFinding ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.criticalFinding}
                    onChange={e => setForm(f => ({ ...f, criticalFinding: e.target.checked }))} />
                  ⚠ Phát hiện nghiêm trọng — cần thông báo khẩn
                </label>
                {form.criticalFinding && (
                  <textarea rows={2} value={form.criticalNote || ''}
                    onChange={e => setForm(f => ({ ...f, criticalNote: e.target.value }))}
                    placeholder="Mô tả ngắn gọn (sẽ gửi tới admin/giám đốc/trưởng phòng)"
                    className="w-full mt-2 border border-red-200 rounded px-2 py-1 text-sm" />
                )}
              </div>

              <AnnotationPanel study={study} />
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => save('final')}
            disabled={saving || !form.findings.trim() || !form.impression.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
            {saving ? 'Đang lưu...' : 'Hoàn thành & Ký'}
          </button>
          <button onClick={() => save('preliminary')} disabled={saving}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm rounded-lg font-medium transition-colors">
            Lưu tạm
          </button>
          <button onClick={onClose} className="ml-auto px-4 py-2 text-gray-400 hover:text-gray-600 text-sm">Hủy</button>
        </div>
      </div>
    </div>
  )
}

// ─── Prior Study Comparison ───────────────────────────────────────────────────

function PriorComparisonModal({ study, onClose }) {
  const [priors, setPriors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    api.get(`/ris/priors/${study.patientId}`, {
      params: { modality: study.modality, excludeStudyId: study._id }
    }).then(r => setPriors(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [study])

  const openComparison = async () => {
    const uids = [study.studyUID, ...Array.from(selected)].filter(Boolean)
    if (uids.length < 2) return
    try {
      const res = await api.get('/ris/compare-url', { params: { studyUIDs: uids.join(',') } })
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {}
  }

  const toggle = (uid) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">So sánh với lần trước</h2>
            <p className="text-xs text-gray-400">{study.patientName} — {study.modality}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? <div className="text-center text-gray-400 py-8">Đang tải...</div> :
           priors.length === 0 ? <div className="text-center text-gray-400 py-8">Không có ca chụp trước để so sánh</div> : (
            <div className="space-y-2">
              {priors.map(p => (
                <label key={p._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected.has(p.studyUID) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={selected.has(p.studyUID)} onChange={() => toggle(p.studyUID)} className="w-4 h-4 accent-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.modality} — {p.bodyPart || '—'}</div>
                    <div className="text-xs text-gray-400">{fmtDate(p.studyDate || p.createdAt)} — {p.status}</div>
                    {p.reportText && <div className="text-xs text-gray-500 mt-1 truncate">{p.reportText.slice(0, 80)}...</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={openComparison} disabled={selected.size === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
            Mở so sánh ({selected.size + 1} ca)
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── Key Image Panel ─────────────────────────────────────────────────────────

function KeyImageModal({ study, onClose }) {
  const [keyImages, setKeyImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ seriesUID: '', instanceUID: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.get(`/ris/key-images/${study._id}`).then(r => setKeyImages(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [study._id])

  const addKeyImage = async () => {
    setSaving(true)
    try {
      await api.post('/ris/key-images', {
        studyId: study._id, studyUID: study.studyUID,
        ...form,
      })
      setForm({ seriesUID: '', instanceUID: '', description: '' })
      load()
    } catch {}
    setSaving(false)
  }

  const removeKeyImage = async (id) => {
    await api.delete(`/ris/key-images/${id}`)
    load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Key Images</h2>
            <p className="text-xs text-gray-400">{study.patientName} — {study.modality}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Add new */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-600">Đánh dấu ảnh quan trọng</div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Series UID" value={form.seriesUID} onChange={e => setForm(p => ({ ...p, seriesUID: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs outline-none" />
              <input placeholder="Instance UID" value={form.instanceUID} onChange={e => setForm(p => ({ ...p, instanceUID: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs outline-none" />
            </div>
            <input placeholder="Mô tả (vd: U phổi thùy trên phải)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none" />
            <button onClick={addKeyImage} disabled={saving || !form.description}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Thêm'}
            </button>
          </div>

          {/* List */}
          {loading ? <div className="text-center text-gray-400 py-4">Đang tải...</div> :
           keyImages.length === 0 ? <div className="text-center text-gray-400 py-4 text-sm">Chưa có key image</div> : (
            <div className="space-y-2">
              {keyImages.map(ki => (
                <div key={ki._id} className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg">
                  <div className="w-8 h-8 bg-yellow-100 rounded flex items-center justify-center text-yellow-600 text-lg flex-shrink-0">&#9733;</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{ki.description || '—'}</div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {ki.seriesUID && `Series: ${ki.seriesUID.slice(-12)}`}
                      {ki.instanceUID && ` / Instance: ${ki.instanceUID.slice(-12)}`}
                    </div>
                    <div className="text-[10px] text-gray-400">{ki.flaggedByName} — {fmtDateTime(ki.createdAt)}</div>
                  </div>
                  <button onClick={() => removeKeyImage(ki._id)} className="text-red-400 hover:text-red-600 text-sm" title="Xóa">&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── DICOM Upload Modal ──────────────────────────────────────────────────────

function DicomUploadModal({ onClose, onUploaded }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList).filter(f =>
      f.name.endsWith('.dcm') || f.name.endsWith('.DCM') || f.name.endsWith('.zip') || f.name.endsWith('.ZIP') || !f.name.includes('.')
    )
    setFiles(prev => [...prev, ...arr])
  }

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }
  const handleInput = (e) => handleFiles(e.target.files)

  const upload = async () => {
    setUploading(true)
    const newResults = []
    for (const file of files) {
      try {
        const isZip = file.name.endsWith('.zip') || file.name.endsWith('.ZIP')
        const endpoint = isZip ? '/ris/orthanc/upload-zip' : '/ris/orthanc/upload'
        const buf = await file.arrayBuffer()
        const res = await api.post(endpoint, buf, {
          headers: { 'Content-Type': isZip ? 'application/zip' : 'application/dicom' },
        })
        newResults.push({ name: file.name, ok: true, data: res.data })
      } catch (err) {
        newResults.push({ name: file.name, ok: false, error: err.response?.data?.error || err.message })
      }
    }
    setResults(newResults)
    setUploading(false)
    if (newResults.some(r => r.ok)) onUploaded?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">Upload DICOM</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('dicom-file-input').click()}
          >
            <div className="text-3xl text-gray-400 mb-2">&#128194;</div>
            <div className="text-sm text-gray-600">Kéo thả file DICOM (.dcm) hoặc ZIP vào đây</div>
            <div className="text-xs text-gray-400 mt-1">hoặc click để chọn file</div>
            <input id="dicom-file-input" type="file" multiple accept=".dcm,.DCM,.zip,.ZIP,*" onChange={handleInput} className="hidden" />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-600">{files.length} file</div>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <span className="text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-600">Kết quả:</div>
              {results.map((r, i) => (
                <div key={i} className={`text-xs px-2 py-1 rounded ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {r.name}: {r.ok ? 'OK' : r.error}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={upload} disabled={uploading || files.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
            {uploading ? 'Đang upload...' : `Upload ${files.length} file`}
          </button>
          <button onClick={() => { setFiles([]); setResults([]) }} disabled={files.length === 0}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Xóa danh sách</button>
          <button onClick={onClose} className="ml-auto px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  )
}

// ─── Annotation Save Button (used in ReportEditor) ───────────────────────────

function AnnotationPanel({ study }) {
  const [annotation, setAnnotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [measurementJson, setMeasurementJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get(`/ris/annotations/${study._id}`)
      .then(r => {
        if (r.data.measurements) {
          setAnnotation(r.data)
          setMeasurementJson(r.data.measurements)
        }
      }).catch(() => {}).finally(() => setLoading(false))
  }, [study._id])

  const save = async () => {
    setSaving(true)
    try {
      let parsed
      try { parsed = JSON.parse(measurementJson) } catch { parsed = measurementJson }
      const count = Array.isArray(parsed) ? parsed.length : (parsed?.measurements?.length || 0)
      await api.post('/ris/annotations', {
        studyId: study._id, studyUID: study.studyUID,
        measurements: measurementJson,
        measurementCount: count,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  if (loading) return null

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600">Measurements / Annotations</div>
        {annotation && <span className="text-[10px] text-gray-400">Lưu bởi {annotation.savedByName} — {fmtDateTime(annotation.updatedAt)}</span>}
      </div>
      <textarea
        value={measurementJson}
        onChange={e => setMeasurementJson(e.target.value)}
        placeholder='Paste JSON measurements từ OHIF (Export Measurements)...'
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-blue-400 resize-y"
        rows={3}
      />
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || !measurementJson.trim()}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu annotations'}
        </button>
        {saved && <span className="text-xs text-green-600">Đã lưu!</span>}
      </div>
    </div>
  )
}

// ─── Worklist Table (shared across all roles) ─────────────────────────────────

function WorklistView({ studies, updateStudy, onRefresh, auth, onOpenCase, onCompleteStudy }) {
  const [activeTab, setActiveTab] = useState('waiting')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [modalityFilter, setModalityFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [reportStudy, setReportStudy] = useState(null)
  const [priorStudy, setPriorStudy] = useState(null)
  const [keyImageStudy, setKeyImageStudy] = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  const tabConfig = STATUS_TABS.find(t => t.key === activeTab)

  // Site options derived from real data so dropdown stays in sync
  const siteOptions = useMemo(
    () => Array.from(new Set(studies.map(s => s.site).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [studies]
  )

  const filtered = studies.filter(s => {
    if (!tabConfig.statuses.includes(s.status)) return false
    const d = (s.appointmentTime || s.createdAt || '').slice(0, 10)
    if (dateFrom && d && d < dateFrom) return false
    if (dateTo && d && d > dateTo) return false
    if (modalityFilter && s.modality !== modalityFilter) return false
    if (siteFilter && s.site !== siteFilter) return false
    return true
  })

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  // Reset page on tab/filter change
  useEffect(() => { setPage(0) }, [activeTab, dateFrom, dateTo, modalityFilter, siteFilter])

  // Count per tab — respects modality/site filters so tab badges reflect what user is viewing
  const tabCounts = STATUS_TABS.map(t => ({
    ...t,
    count: studies.filter(s => {
      if (!t.statuses.includes(s.status)) return false
      const d = (s.appointmentTime || s.createdAt || '').slice(0, 10)
      if (dateFrom && d && d < dateFrom) return false
      if (dateTo && d && d > dateTo) return false
      if (modalityFilter && s.modality !== modalityFilter) return false
      if (siteFilter && s.site !== siteFilter) return false
      return true
    }).length,
  }))

  const handleCancel = async (study) => {
    if (!confirm(`Hủy ca chụp của ${study.patientName}?`)) return
    await updateStudy(study._id, { status: 'cancelled' })
  }

  const handleStartImaging = async (study) => {
    try {
      await updateStudy(study._id, { status: 'in_progress' })
    } catch (e) {
      alert(e.response?.data?.error || 'Không bắt đầu được ca chụp')
    }
  }

  const handleComplete = async (study) => {
    await updateStudy(study._id, { status: 'reported' })
  }

  const handlePushOne = async (study) => {
    try {
      const r = await api.post('/mwl/sync', { studyIds: [study._id] })
      alert(`✓ Đã đẩy ${r.data.syncedCount || 1} ca tới scanner.`)
    } catch (e) {
      alert('✗ Lỗi đẩy: ' + (e.response?.data?.error || e.message))
    }
  }

  const handlePushAll = async () => {
    if (!confirm('Đẩy TOÀN BỘ worklist (scheduled + in_progress) tới scanner?')) return
    try {
      const r = await api.post('/mwl/sync', { studyIds: null })
      alert(`✓ Đã đẩy ${r.data.syncedCount} ca.`)
      onRefresh()
    } catch (e) {
      alert('✗ Lỗi đẩy: ' + (e.response?.data?.error || e.message))
    }
  }

  const handlePick = async (study) => {
    if (!confirm(`Nhận ca của ${study.patientName}?`)) return
    try {
      await api.post(`/ris/studies/${study._id}/pick`)
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.error || 'Không nhận được ca')
      onRefresh()
    }
  }

  const iconBtn = 'p-1.5 rounded hover:bg-gray-100 transition-colors text-base leading-none'

  // Action icons per tab
  const renderActions = (study) => {
    switch (activeTab) {
      case 'waiting':
        return (
          <div className="flex items-center gap-1">
            <button onClick={() => handlePushOne(study)} className={`${iconBtn} text-blue-500 hover:text-blue-700`} title="Đẩy MWL tới máy chụp (không đổi trạng thái)">📡</button>
            <button onClick={() => handleStartImaging(study)}
              className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md whitespace-nowrap"
              title="Bắt đầu chụp — chuyển sang Đang thực hiện">
              ▶ Bắt đầu chụp
            </button>
            <button onClick={() => handleCancel(study)} className={`${iconBtn} text-red-400 hover:text-red-600`} title="Hủy">✕</button>
          </div>
        )
      case 'in_progress':
        return (
          <div className="flex items-center gap-1">
            <button onClick={() => handlePushOne(study)} className={`${iconBtn} text-blue-500 hover:text-blue-700`} title="Đẩy lại MWL">📡</button>
            <button onClick={() => onCompleteStudy?.(study)}
              className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md whitespace-nowrap"
              title="Ghi vật tư & chuyển sang Chờ đọc">
              ▶ Kết thúc chụp
            </button>
            <button onClick={() => handleCancel(study)} className={`${iconBtn} text-red-400 hover:text-red-600`} title="Hủy">✕</button>
          </div>
        )
      case 'pending_read': {
        const isBacsi = auth?.role === 'bacsi'
        const isUnclaimed = !study.radiologist
        const isMine = study.radiologist === auth?.username

        // Bác sĩ: either pick (pool) or continue reading (own case)
        if (isBacsi) {
          return (
            <div className="flex items-center gap-0.5">
              {isUnclaimed && (
                <button onClick={() => handlePick(study)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-medium transition-colors"
                  title="Nhận ca từ pool">
                  Nhận ca
                </button>
              )}
              {isMine && (
                <button onClick={() => setReportStudy(study)} className={`${iconBtn} text-blue-500 hover:text-blue-700`} title="Nhập kết quả">✎</button>
              )}
              <button onClick={() => setPriorStudy(study)} className={`${iconBtn} text-cyan-500 hover:text-cyan-700`} title="So sánh lần trước">⇔</button>
              <button onClick={() => setKeyImageStudy(study)} className={`${iconBtn} text-yellow-500 hover:text-yellow-700`} title="Key images">★</button>
            </div>
          )
        }

        // Admin/giamdoc/truongphong/nhanvien: can view + cancel, no pick
        return (
          <div className="flex items-center gap-0.5">
            <button onClick={() => setReportStudy(study)} className={`${iconBtn} text-gray-500 hover:text-gray-700`} title="Xem kết quả">👁</button>
            <button onClick={() => setPriorStudy(study)} className={`${iconBtn} text-cyan-500 hover:text-cyan-700`} title="So sánh lần trước">⇔</button>
            <button onClick={() => setKeyImageStudy(study)} className={`${iconBtn} text-yellow-500 hover:text-yellow-700`} title="Key images">★</button>
            <button onClick={() => handleCancel(study)} className={`${iconBtn} text-red-400 hover:text-red-600`} title="Hủy">✕</button>
          </div>
        )
      }
      case 'completed':
        return (
          <div className="flex items-center gap-0.5">
            <button onClick={() => setReportStudy(study)} className={`${iconBtn} text-blue-500 hover:text-blue-700`} title="Xem kết quả">👁</button>
            <button onClick={() => setPriorStudy(study)} className={`${iconBtn} text-cyan-500 hover:text-cyan-700`} title="So sánh lần trước">⇔</button>
            <button onClick={() => setKeyImageStudy(study)} className={`${iconBtn} text-yellow-500 hover:text-yellow-700`} title="Key images">★</button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {tabCounts.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>Ngày:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
        <span>-</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
        <select value={modalityFilter} onChange={e => setModalityFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400">
          <option value="">Loại máy: tất cả</option>
          <option value="CT">CT</option>
          <option value="MRI">MRI</option>
          <option value="XR">X-Ray</option>
          <option value="US">Siêu âm</option>
        </select>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400">
          <option value="">Cơ sở: tất cả</option>
          {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={onRefresh} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Làm mới">⟳</button>
        <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium text-gray-600" title="Upload DICOM">&#128194; Upload DICOM</button>
        <button onClick={handlePushAll} className="px-3 py-1.5 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium text-blue-700" title="Đẩy worklist DICOM tới máy chụp">📡 Đẩy worklist</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['STT', 'Thời gian đến', 'Thời gian chờ', 'Mã chỉ định', 'Mã phiếu', 'Bệnh nhân', 'Dịch vụ', 'Ảnh PACS', 'Ghi chú', 'Tác vụ'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">Không có dữ liệu</td></tr>
              ) : paged.map((s, i) => (
                <tr key={s._id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors cursor-pointer`}
                    onDoubleClick={() => onOpenCase?.(s)} title="Double-click để mở ca">
                  <td className="px-4 py-3 text-gray-500 text-xs">{page * pageSize + i + 1}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{fmtDateTime(s.appointmentTime || s.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{calcWaitTime(s.appointmentTime || s.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s._id?.slice(-8)?.toUpperCase()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{s.patientId || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); onOpenCase?.(s) }}>
                      {s.patientName || '—'}
                    </div>
                    {(s.status === 'pending_read' || s.status === 'reading') && (
                      s.radiologist ? (
                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 bg-blue-100 text-blue-700">
                          BS: {s.radiologistName || s.radiologist}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 bg-gray-100 text-gray-500">
                          Chưa nhận
                        </span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    <div>{s.modality} {s.bodyPart ? `- ${s.bodyPart}` : ''}</div>
                    {s.clinicalInfo && <div className="text-gray-400 truncate max-w-[200px]">{s.clinicalInfo}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <ImageStatusBadge imageStatus={s.imageStatus} imageCount={s.imageCount} studyUID={s.studyUID} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[150px] truncate">{s.notes || '—'}</td>
                  <td className="px-4 py-3">{renderActions(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            {[5, 10, 20].map(s => (
              <button key={s} onClick={() => { setPageSize(s); setPage(0) }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${pageSize === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span>Page {page + 1} of {totalPages} ({filtered.length} items)</span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className={`w-7 h-7 rounded-lg font-medium transition-all ${page === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {reportStudy && (
        <ReportEditor study={reportStudy} onClose={() => setReportStudy(null)} onSaved={onRefresh} />
      )}
      {priorStudy && (
        <PriorComparisonModal study={priorStudy} onClose={() => setPriorStudy(null)} />
      )}
      {keyImageStudy && (
        <KeyImageModal study={keyImageStudy} onClose={() => setKeyImageStudy(null)} />
      )}
      {showUpload && (
        <DicomUploadModal onClose={() => setShowUpload(false)} onUploaded={onRefresh} />
      )}
    </div>
  )
}

// ─── Main RIS Component ────────────────────────────────────────────────────────

export default function RIS() {
  const { auth } = useAuth()
  const [studies, setStudies] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // MINERVA-style multi-case workspace state
  const [openCases, setOpenCases] = useState([])      // [{study}, ...]
  const [activeCaseId, setActiveCaseId] = useState(SYS_WORKLIST)  // SYS_* or study._id
  const [criticalUnread, setCriticalUnread] = useState(0)

  // "Kết thúc chụp" modal — KTV logs vật tư + transitions to pending_read
  const [completeStudy, setCompleteStudy] = useState(null)

  // Pick up ?view=critical from old route redirects
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const v = searchParams.get('view')
    if (v === 'critical') setActiveCaseId(SYS_CRITICAL)
    if (v) {
      // Clear param so it doesn't override later tab clicks
      setSearchParams({}, { replace: true })
    }
  }, [])

  // Poll critical-finding count for tab badge
  useEffect(() => {
    const fetchCritical = () => {
      api.get('/notifications', { params: { severity: 'critical', unreadOnly: 1 } })
        .then(r => setCriticalUnread((r.data.items || []).filter(n => n.type === 'critical_finding' && !(n.ackedBy || []).length).length))
        .catch(() => {})
    }
    fetchCritical()
    const iv = setInterval(fetchCritical, 30_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const res = await api.get('/ris/studies')
      setStudies(res.data)
      // Refresh any open-case data with latest study state
      setOpenCases(prev => prev.map(c => {
        const updated = res.data.find(s => s._id === c._id)
        return updated || c
      }))
    } catch (e) {
      console.error('RIS load error:', e)
      if (e?.response?.status !== 401) setLoadError(String(e?.response?.data?.error || e?.message || e))
    } finally { setLoading(false) }
  }

  const updateStudy = async (id, data) => {
    const res = await api.put(`/ris/studies/${id}`, data)
    setStudies(prev => prev.map(s => s._id === id ? res.data : s))
    load()
  }

  // Tab management
  const openCase = (study) => {
    setOpenCases(prev => prev.find(c => c._id === study._id) ? prev : [...prev, study])
    setActiveCaseId(study._id)
  }
  const closeCase = (id) => {
    setOpenCases(prev => prev.filter(c => c._id !== id))
    if (activeCaseId === id) setActiveCaseId(SYS_WORKLIST)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm">Đang tải...</div>
        </div>
      </div>
    )
  }
  if (auth.role === 'guest') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <div className="text-red-500 font-medium">Không có quyền truy cập</div>
        </div>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-800">
        <div className="font-bold mb-2">Lỗi tải dữ liệu RIS:</div>
        <pre className="text-xs whitespace-pre-wrap">{loadError}</pre>
      </div>
    )
  }

  const activeCase = openCases.find(c => c._id === activeCaseId)
  const isSystemTab = activeCaseId === SYS_WORKLIST || activeCaseId === SYS_CRITICAL

  const systemTabs = [
    { id: SYS_WORKLIST, label: 'Danh sách ca',            icon: '📋' },
    { id: SYS_CRITICAL, label: 'Phát hiện nghiêm trọng',  icon: '⚠', badge: criticalUnread, badgeColor: 'bg-red-500 text-white' },
  ]

  return (
    <div className="flex" style={{ height: 'calc(100vh - 6rem)' }}>
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        <CaseTabBar
          systemTabs={systemTabs}
          openCases={openCases}
          activeId={activeCaseId}
          onSelect={setActiveCaseId}
          onClose={closeCase}
        />
        <ErrorBoundary>
          {activeCase ? (
            <PatientDetailView study={activeCase} onRefresh={load} onOpenCase={openCase} />
          ) : activeCaseId === SYS_CRITICAL ? (
            <div className="flex-1 overflow-y-auto p-4"><CriticalFindings /></div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-lg font-bold text-gray-800">Ca chụp</h1>
                  <p className="text-xs text-gray-400">Double-click hàng để mở ca trong tab mới · ⌘K để tìm</p>
                </div>
                <div className="text-xs text-gray-500">
                  {auth.displayName || auth.username}{auth.department ? ` — ${auth.department}` : ''}
                </div>
              </div>
              <WorklistView
                studies={studies}
                updateStudy={updateStudy}
                onRefresh={load}
                auth={auth}
                onOpenCase={openCase}
                onCompleteStudy={setCompleteStudy}
              />
            </div>
          )}
        </ErrorBoundary>
      </div>

      <CompleteStudyModal
        study={completeStudy}
        open={!!completeStudy}
        onClose={() => setCompleteStudy(null)}
        onConfirmed={() => { load() }}
      />
    </div>
  )
}
