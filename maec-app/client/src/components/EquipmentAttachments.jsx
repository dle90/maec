import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api'

// Tài liệu thiết bị panel — upload/view/delete contracts, quotes, manuals,
// service receipts attached to a piece of Equipment. Mirrors
// EncounterAttachments.jsx for the file half (same R2 flow), adds a `kind`
// chip so the doc type is visible at a glance.

const KIND_LABELS = {
  contract:    { label: 'Hợp đồng',   cls: 'bg-blue-100  text-blue-700'  },
  quote:       { label: 'Báo giá',    cls: 'bg-amber-100 text-amber-700' },
  manual:      { label: 'HDSD',       cls: 'bg-violet-100 text-violet-700' },
  service:     { label: 'Bảo trì',    cls: 'bg-emerald-100 text-emerald-700' },
  calibration: { label: 'Hiệu chuẩn', cls: 'bg-teal-100  text-teal-700'  },
  other:       { label: 'Khác',       cls: 'bg-gray-100  text-gray-700'  },
}

const fmtSize = (b) => {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const fmtWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

const iconFor = (mime) => {
  if ((mime || '').includes('pdf')) return '📄'
  if ((mime || '').includes('word') || (mime || '').includes('document')) return '📝'
  if ((mime || '').startsWith('image/')) return '🖼️'
  return '📎'
}

export default function EquipmentAttachments({ equipmentId, canEdit = true }) {
  const [items, setItems] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [kind, setKind] = useState('other')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!equipmentId) { setItems([]); return }
    try {
      const r = await api.get(`/equipment/${encodeURIComponent(equipmentId)}/attachments`)
      setItems(r.data || [])
    } catch {
      setItems([])
    }
  }, [equipmentId])

  useEffect(() => { setItems(null); load() }, [load])

  const onPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      await api.post(`/equipment/${encodeURIComponent(equipmentId)}/attachments?kind=${kind}`, fd)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Tải tệp lên thất bại')
    }
    setUploading(false)
  }

  const view = async (att) => {
    setBusyId(att._id)
    setError('')
    try {
      const r = await api.get(`/equipment-attachments/${encodeURIComponent(att._id)}/url`)
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.response?.data?.error || 'Không mở được tệp')
    }
    setBusyId('')
  }

  const remove = async (att) => {
    if (!confirm(`Xóa tệp "${att.filename}"?`)) return
    setBusyId(att._id)
    setError('')
    try {
      await api.delete(`/equipment-attachments/${encodeURIComponent(att._id)}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Xóa tệp thất bại')
    }
    setBusyId('')
  }

  const list = items || []

  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Tài liệu ({list.length})</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select
              value={kind} onChange={e => setKind(e.target.value)}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
              title="Loại tài liệu sắp tải lên"
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input ref={fileRef} type="file" multiple onChange={onPick} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
              {uploading ? 'Đang tải lên…' : '+ Tải tệp lên'}
            </button>
          </div>
        )}
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      {items === null ? (
        <div className="text-xs text-gray-400 italic">Đang tải…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-gray-400 italic">
          Chưa có tài liệu nào.{canEdit ? ' Chọn loại + bấm "Tải tệp lên".' : ''}
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map(att => {
            const k = KIND_LABELS[att.kind] || KIND_LABELS.other
            return (
              <div key={att._id}
                className="border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 flex items-center gap-2 flex-wrap">
                <span className="flex-shrink-0">{iconFor(att.mimeType)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${k.cls}`}>{k.label}</span>
                <button onClick={() => view(att)} disabled={busyId === att._id}
                  className="text-sm flex-1 min-w-0 text-left truncate hover:text-blue-700 disabled:opacity-50"
                  title={att.filename}>
                  {att.filename}
                </button>
                <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{fmtSize(att.size)}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                  {fmtWhen(att.uploadedAt)}
                </span>
                <button onClick={() => view(att)} disabled={busyId === att._id}
                  className="text-xs text-blue-600 flex-shrink-0 disabled:opacity-50">Xem →</button>
                {canEdit && (
                  <button onClick={() => remove(att)} disabled={busyId === att._id}
                    className="text-red-500 hover:text-red-700 text-base leading-none flex-shrink-0 disabled:opacity-50"
                    aria-label="Xóa tệp">×</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
