import React, { useEffect, useRef, useState } from 'react'
import api from '../api'

// Persistent OHIF iframe for the Ca đọc reading workspace.
// The iframe element is mounted once and src is swapped on case change so the
// OHIF bundle stays loaded across case switches (no cold-start per case).
// The `hidden` prop CSS-hides the iframe (without unmounting) when the user
// pops the viewer out to a separate window — OHIF's JS state survives so
// re-docking is instant.
export default function InlineViewer({ studyUID, onUndock, hidden = false, expanded = false, onToggleExpanded }) {
  const [src, setSrc] = useState('about:blank')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const loadedOnceRef = useRef(false)

  useEffect(() => {
    if (!studyUID) {
      setError('Ca này chưa có studyUID')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get(`/ris/orthanc/viewer-url/${encodeURIComponent(studyUID)}`)
      .then(r => {
        if (cancelled) return
        if (r.data?.found === false) {
          setError('Ca này chưa có ảnh DICOM trong PACS.')
          return
        }
        setSrc(r.data.url)
        loadedOnceRef.current = true
      })
      .catch(() => { if (!cancelled) setError('Không tải được URL viewer') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [studyUID])

  return (
    <div className={`${hidden ? 'hidden' : 'flex-1 flex'} min-w-0 bg-gray-900 relative`}>
      <iframe
        src={src}
        className="flex-1 w-full border-0 bg-gray-900"
        title="DICOM Viewer"
        allow="fullscreen; clipboard-read; clipboard-write"
      />

      {/* Viewer action buttons — top-right corner */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {onToggleExpanded && (
          <button onClick={onToggleExpanded}
            title={expanded ? 'Thu gọn ảnh' : 'Mở rộng ảnh (thu nhỏ kết quả)'}
            className="px-2.5 py-1 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs rounded-md border border-gray-700 backdrop-blur-sm transition-colors">
            {expanded ? '↔ Thu gọn' : '⇔ Mở rộng ảnh'}
          </button>
        )}
        <button onClick={onUndock}
          title="Mở viewer trong cửa sổ riêng"
          className="px-2.5 py-1 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs rounded-md border border-gray-700 backdrop-blur-sm transition-colors">
          ⇗ Cửa sổ riêng
        </button>
      </div>

      {/* Overlays: first-load spinner and error state. Subsequent loads swap
          src without an overlay so the previous study stays visible until the
          new one paints. */}
      {loading && !loadedOnceRef.current && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <div className="text-sm">Đang tải viewer…</div>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400">
          <div className="text-center max-w-xs px-4">
            <div className="text-3xl mb-2 opacity-50">⚠</div>
            <div className="text-sm">{error}</div>
          </div>
        </div>
      )}
    </div>
  )
}
