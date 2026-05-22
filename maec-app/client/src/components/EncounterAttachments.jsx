import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api'

// Tài liệu / Hồ sơ panel for an encounter — upload, view, delete PDF/image
// attachments. Files live in Cloudflare R2; viewing goes through a short-lived
// presigned URL (a new tab can't carry our Bearer token). Self-contained:
// drop <EncounterAttachments encounterId=... /> into any encounter view.

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
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const iconFor = (mime) => {
  if ((mime || '').includes('pdf')) return '📄'
  if ((mime || '').startsWith('image/')) return '🖼️'
  return '📎'
}

export default function EncounterAttachments({ encounterId, canEdit = true }) {
  const [items, setItems] = useState(null)   // null = loading
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!encounterId) { setItems([]); return }
    try {
      const r = await api.get(`/encounters/${encodeURIComponent(encounterId)}/attachments`)
      setItems(r.data || [])
    } catch {
      setItems([])
    }
  }, [encounterId])

  useEffect(() => { setItems(null); load() }, [load])

  const onPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''  // allow re-picking the same file
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      // Let axios set the multipart Content-Type (with boundary) itself.
      await api.post(`/encounters/${encodeURIComponent(encounterId)}/attachments`, fd)
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
      const r = await api.get(`/attachments/${encodeURIComponent(att._id)}/url`)
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
      await api.delete(`/attachments/${encodeURIComponent(att._id)}`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Xóa tệp thất bại')
    }
    setBusyId('')
  }

  const list = items || []

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Tài liệu / Hồ sơ ({list.length})</h3>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" multiple accept=".pdf,image/*"
              onChange={onPick} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
              {uploading ? 'Đang tải lên…' : '+ Tải tệp lên'}
            </button>
          </>
        )}
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      {items === null ? (
        <div className="text-xs text-gray-400 italic">Đang tải…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-gray-400 italic">
          Chưa có tệp nào.{canEdit ? ' Bấm "Tải tệp lên" để đính kèm PDF/ảnh.' : ''}
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map(att => (
            <div key={att._id}
              className="border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
              <span className="flex-shrink-0">{iconFor(att.mimeType)}</span>
              <button onClick={() => view(att)} disabled={busyId === att._id}
                className="text-sm flex-1 text-left truncate hover:text-blue-700 disabled:opacity-50"
                title={att.filename}>
                {att.filename}
              </button>
              <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{fmtSize(att.size)}</span>
              <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                {att.uploadedByName} · {fmtWhen(att.uploadedAt)}
              </span>
              <button onClick={() => view(att)} disabled={busyId === att._id}
                className="text-xs text-blue-600 flex-shrink-0 disabled:opacity-50">Xem →</button>
              {canEdit && (
                <button onClick={() => remove(att)} disabled={busyId === att._id}
                  className="text-red-500 hover:text-red-700 text-base leading-none flex-shrink-0 disabled:opacity-50"
                  aria-label="Xóa tệp">×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
