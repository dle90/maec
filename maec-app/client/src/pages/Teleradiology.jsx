import React, { useEffect, useRef, useState, useMemo } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { useTeleradTabs, SYS_WORKLIST } from '../context/TeleradTabsContext'
import CaseTabBar from '../components/CaseTabBar'
import PatientDetailView from '../components/PatientDetailView'
import InlineViewer from '../components/InlineViewer'

const VIEWER_DOCKED_KEY = 'linkrad.reader.viewerDocked'
const REPORT_WIDTH_KEY = 'linkrad.reader.reportWidth'
const REPORT_WIDTH_MIN = 360
const REPORT_WIDTH_MAX = 900
const REPORT_WIDTH_DEFAULT = 576
// "Expand viewer" preset: narrow the report to ~20% of a typical 1920 screen.
// Below the divider min but still usable for the editor.
const REPORT_WIDTH_EXPANDED = 380

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = (s) => s ? s.slice(0, 10) : ''
const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const initials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
const calcAge = (dob) => {
  if (!dob) return ''
  const diff = Date.now() - new Date(dob).getTime()
  if (!Number.isFinite(diff) || diff < 0) return ''
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

const STATUS_PILL = {
  scheduled:    { label: 'Chờ thực hiện', cls: 'bg-gray-100 text-gray-700' },
  in_progress:  { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
  pending_read: { label: 'Chờ đọc',        cls: 'bg-amber-100 text-amber-700' },
  reading:      { label: 'Đang đọc',       cls: 'bg-orange-100 text-orange-700' },
  reported:     { label: 'Hoàn thành',     cls: 'bg-emerald-100 text-emerald-700' },
  verified:     { label: 'Đã xác nhận',    cls: 'bg-emerald-100 text-emerald-800' },
  cancelled:    { label: 'Đã hủy',         cls: 'bg-gray-200 text-gray-600' },
}

// Pill-tab groups align the Ca đọc filter with Đăng ký/Billing vocabulary.
const STATUS_GROUPS = [
  { key: 'all',      label: 'Tất cả',      statuses: null },
  { key: 'pending',  label: 'Chờ đọc',     statuses: ['pending_read'] },
  { key: 'reading',  label: 'Đang đọc',    statuses: ['reading'] },
  { key: 'done',     label: 'Hoàn thành',  statuses: ['reported', 'verified'] },
  { key: 'imaging',  label: 'Đang chụp',   statuses: ['scheduled', 'in_progress'] },
]

// ── Page header ──────────────────────────────────────────────────────────────

function PageHeader({ userName, date, counts }) {
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b bg-white">
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold text-gray-800">Ca đọc</div>
        <div className="text-xs text-gray-400 font-mono">/teleradiology</div>
      </div>
      <div className="flex-1 text-xs text-gray-500">
        {counts && (
          <span>
            <b className="text-gray-700">{counts.pending_read || 0}</b> chờ đọc ·
            <b className="text-gray-700 ml-1">{counts.reading || 0}</b> đang đọc ·
            <b className="text-gray-700 ml-1">{counts.reported || 0}</b> đã xong
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {userName && <span className="px-2 py-1 bg-gray-100 rounded-md">👤 {userName}</span>}
        <span className="px-2 py-1 bg-gray-100 rounded-md">{fmtDate(date)}</span>
      </div>
    </div>
  )
}

// ── Draggable divider between viewer and report. The iframe swallows pointer
//    events, so the divider lives as a thin strip between them. We widen the
//    hit target with ::before (via Tailwind before:) and guard the drag with
//    an invisible full-viewport overlay so the cursor stays "col-resize" and
//    text doesn't select while dragging.
function ViewerDivider({ reportWidth, onChange }) {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      // Report width = distance from pointer X to the right edge of the window.
      onChange(window.innerWidth - e.clientX)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, onChange])

  return (
    <>
      <div
        onPointerDown={(e) => { e.preventDefault(); setDragging(true) }}
        className="relative w-1 flex-shrink-0 bg-gray-300 hover:bg-blue-400 cursor-col-resize transition-colors
                   before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-['']"
        title="Kéo để thay đổi kích thước"
      />
      {dragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize" style={{ userSelect: 'none' }} />
      )}
    </>
  )
}

// ── Undocked viewer banner — shown above the report when the viewer is in
//    a separate window. Click "Kéo viewer về" to re-dock.
function UndockedBanner({ onRedock }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex-none">
      <div className="flex items-center gap-2 text-xs text-indigo-800">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-indigo-300 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium">Viewer đang mở trong cửa sổ riêng</span>
        </span>
      </div>
      <button onClick={onRedock}
        className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md transition-colors">
        ⇦ Kéo viewer về
      </button>
    </div>
  )
}

// ── Image viewer button (unchanged behavior, cleaner style) ──────────────────

function ViewImagesButton({ studyUID, imageStatus, imageCount, compact = false }) {
  const [opening, setOpening] = useState(false)
  if (imageStatus !== 'available' || !studyUID) {
    return <span className="text-xs text-gray-400">{compact ? '—' : 'Chưa có ảnh'}</span>
  }
  const open = async (e) => {
    e.stopPropagation()
    setOpening(true)
    try {
      const res = await api.get(`/ris/orthanc/viewer-url/${encodeURIComponent(studyUID)}`)
      if (res.data?.found === false) {
        alert('Ca này chưa có ảnh DICOM trong PACS.')
        return
      }
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Không mở được trình xem ảnh')
    } finally { setOpening(false) }
  }
  return (
    <button onClick={open} disabled={opening}
      className={`inline-flex items-center gap-1 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap
        ${compact ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
      {opening ? '…' : `Xem ảnh${imageCount ? ` (${imageCount})` : ''}`}
    </button>
  )
}

// ── Study list (left) ────────────────────────────────────────────────────────

function StudyList({ studies, selectedId, onSelect, onOpen, groupKey, onGroupKey, filterBar }) {
  return (
    <div className="w-[520px] flex-shrink-0 flex flex-col bg-white border-r border-gray-200">
      {/* Pill group tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-200 flex items-center gap-1.5 flex-wrap">
        {STATUS_GROUPS.map(g => (
          <button key={g.key} onClick={() => onGroupKey(g.key)}
            className={`px-3 py-1 text-xs rounded-full transition-colors
              ${groupKey === g.key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {g.label}
          </button>
        ))}
        <div className="flex-1" />
        {filterBar}
      </div>

      {/* Card-style rows */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {studies.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-10">Không có ca nào</div>
        )}
        {studies.map(s => {
          const pill = STATUS_PILL[s.status] || { label: s.status, cls: 'bg-gray-100 text-gray-700' }
          const on = selectedId === s._id
          return (
            <button key={s._id} onClick={() => onSelect(s)}
              onDoubleClick={() => onOpen(s)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors
                ${on ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {initials(s.patientName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-semibold text-sm text-gray-800 truncate">{s.patientName || '—'}</div>
                    <div className="text-[10px] font-mono text-gray-400 flex-shrink-0">{s.patientId || ''}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span className="px-1.5 py-0 rounded bg-gray-100 text-gray-700 text-[10px] font-mono">{s.modality}</span>
                    <span className="truncate">{s.bodyPart || s.clinicalInfo || '—'}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${pill.cls}`}>{pill.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{fmtDateTime(s.studyDate || s.appointmentTime || s.createdAt)}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Preview / detail panel (right) — shown when a row is selected on worklist

function StudyPreview({ study, onOpen }) {
  const age = calcAge(study.dob)
  const pill = STATUS_PILL[study.status] || { label: study.status, cls: 'bg-gray-100 text-gray-700' }

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">Chi tiết ca</div>
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${pill.cls}`}>{pill.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center">
            {initials(study.patientName)}
          </div>
          <div>
            <div className="font-semibold text-gray-800">{study.patientName || '—'}</div>
            <div className="text-xs text-gray-500 font-mono">
              {study.patientId || '—'}
              {' · '}{study.gender === 'M' ? 'Nam' : study.gender === 'F' ? 'Nữ' : '—'}
              {age !== '' && ` · ${age}t`}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
          <Row label="Modality" value={study.modality} mono />
          <Row label="Bộ phận" value={study.bodyPart} />
          <Row label="Site" value={study.site} />
          <Row label="Ngày chụp" value={fmtDateTime(study.studyDate)} />
          <Row label="BS chỉ định" value={study.referringDoctor} />
          <Row label="BS đọc" value={study.radiologistName} />
          <Row label="Ưu tiên" value={study.priority} />
        </div>

        <div>
          <div className="text-[10px] uppercase text-gray-400 tracking-wide mb-1">Chỉ định lâm sàng</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{study.clinicalInfo || '—'}</div>
        </div>
      </div>

      <div className="p-3 border-t border-gray-200 space-y-2">
        <ViewImagesButton studyUID={study.studyUID} imageStatus={study.imageStatus} imageCount={study.imageCount} />
        <button onClick={() => onOpen(study)}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
          Mở ca →
        </button>
        <div className="text-[10px] text-gray-400 text-center">Tip: double-click hàng để mở nhanh</div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-gray-800 text-right truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

// ── Queue rail — shown on the left of the reading view so the bacsi sees
//    what's coming next without bouncing back to the full worklist ────────────

function QueueRail({ studies, currentId, onJumpTo, onOpenNext }) {
  const queue = useMemo(() => {
    return studies
      .filter(s => s.status === 'pending_read' || s.status === 'reading')
      .sort((a, b) => {
        // reading (claimed) below pending_read; within each, oldest first (FIFO)
        const sa = a.status === 'pending_read' ? 0 : 1
        const sb = b.status === 'pending_read' ? 0 : 1
        if (sa !== sb) return sa - sb
        const ta = a.studyDate || a.createdAt || ''
        const tb = b.studyDate || b.createdAt || ''
        return ta.localeCompare(tb)
      })
  }, [studies])
  const nextUnclaimed = queue.find(s => s.status === 'pending_read' && !s.radiologist)

  return (
    <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">
      <div className="px-3 py-2.5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Hàng chờ đọc</div>
          <span className="text-[10px] text-gray-500 font-mono">{queue.length} ca</span>
        </div>
        {nextUnclaimed && nextUnclaimed._id !== currentId && (
          <button onClick={() => onOpenNext?.(nextUnclaimed)}
            className="mt-2 w-full text-left px-2 py-1 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-800 hover:bg-blue-100">
            <span className="font-semibold">Ca kế tiếp:</span> {nextUnclaimed.patientName}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {queue.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-8">Không có ca nào chờ đọc</div>
        )}
        {queue.map(s => {
          const isCurrent = s._id === currentId
          const pill = STATUS_PILL[s.status] || { label: s.status, cls: 'bg-gray-100 text-gray-700' }
          return (
            <button key={s._id} onClick={() => onJumpTo?.(s)}
              className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors
                ${isCurrent ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {initials(s.patientName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <div className="font-semibold text-sm text-gray-800 truncate">{s.patientName || '—'}</div>
                    <div className="text-[10px] font-mono text-gray-400 flex-shrink-0">{fmtTime(s.studyDate)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500">
                    <span className="px-1 py-0 rounded bg-gray-100 text-gray-700 text-[9px] font-mono">{s.modality}</span>
                    <span className="truncate flex-1">{s.bodyPart || s.clinicalInfo || '—'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 pl-10">
                <span className="text-[10px] font-mono text-gray-400 truncate">{s.patientId}</span>
                <span className={`px-1.5 py-0.5 text-[9px] rounded-full flex-shrink-0 ml-2 ${pill.cls}`}>{pill.label}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


// ── Filter bar (used inside StudyList pill row) ──────────────────────────────

function FilterBar({ modalityFilter, onModalityFilter, siteFilter, onSiteFilter, siteOptions, dateFrom, onDateFrom, dateTo, onDateTo, onRefresh }) {
  const cls = 'border border-gray-200 rounded-md px-2 py-0.5 text-xs outline-none focus:border-blue-400'
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-600">
      <select value={modalityFilter} onChange={e => onModalityFilter(e.target.value)} className={cls}>
        <option value="">Loại máy: tất cả</option>
        <option value="CT">CT</option>
        <option value="MRI">MRI</option>
        <option value="XR">X-Ray</option>
        <option value="US">Siêu âm</option>
      </select>
      <select value={siteFilter} onChange={e => onSiteFilter(e.target.value)} className={cls}>
        <option value="">Cơ sở: tất cả</option>
        {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)} className={cls} />
      <span className="text-gray-400">→</span>
      <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)} className={cls} />
      <button onClick={onRefresh} className="p-1 border border-gray-200 rounded-md hover:bg-gray-100" title="Làm mới">⟳</button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Teleradiology() {
  const { auth } = useAuth()
  const { openCases, activeCaseId, setActiveCaseId, openCase, closeCase, syncWithStudies } = useTeleradTabs()

  const [studies, setStudies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [groupKey, setGroupKey] = useState('pending')
  const [modalityFilter, setModalityFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [viewerDocked, setViewerDocked] = useState(() => {
    try { return localStorage.getItem(VIEWER_DOCKED_KEY) !== 'false' } catch { return true }
  })
  const [reportWidth, setReportWidth] = useState(() => {
    try {
      const n = parseInt(localStorage.getItem(REPORT_WIDTH_KEY) || '', 10)
      if (Number.isFinite(n) && n >= REPORT_WIDTH_MIN && n <= REPORT_WIDTH_MAX) return n
    } catch {}
    return REPORT_WIDTH_DEFAULT
  })

  const persistViewerDocked = (docked) => {
    setViewerDocked(docked)
    try { localStorage.setItem(VIEWER_DOCKED_KEY, String(docked)) } catch {}
  }

  const persistReportWidth = (w) => {
    const clamped = Math.max(REPORT_WIDTH_MIN, Math.min(REPORT_WIDTH_MAX, w))
    setReportWidth(clamped)
    try { localStorage.setItem(REPORT_WIDTH_KEY, String(clamped)) } catch {}
  }

  // Toggle between the "viewer-expanded" preset and the user's previous width.
  // Considered expanded when current width is at (or below) the preset.
  const prevReportWidthRef = useRef(null)
  const isViewerExpanded = reportWidth <= REPORT_WIDTH_EXPANDED
  const toggleViewerExpanded = () => {
    if (isViewerExpanded) {
      persistReportWidth(prevReportWidthRef.current || REPORT_WIDTH_DEFAULT)
    } else {
      prevReportWidthRef.current = reportWidth
      persistReportWidth(REPORT_WIDTH_EXPANDED)
    }
  }

  // Popup-reuse: if the popup is still alive AND already showing the same
  // study, focusing it skips the OHIF cold-start. First undock per study is
  // unavoidable — popup has its own browsing context and must boot OHIF.
  const popupRef = useRef(null)
  const popupStudyRef = useRef(null)

  const undockViewer = async (study) => {
    if (!study?.studyUID) return
    const existing = popupRef.current
    if (existing && !existing.closed && popupStudyRef.current === study.studyUID) {
      try { existing.focus() } catch {}
      persistViewerDocked(false)
      return
    }
    try {
      const r = await api.get(`/ris/orthanc/viewer-url/${encodeURIComponent(study.studyUID)}`)
      if (r.data?.found === false) {
        alert('Ca này chưa có ảnh DICOM trong PACS.')
        return
      }
      // Named window so any existing popup is reused (navigated) rather than
      // opened as a second window.
      popupRef.current = window.open(r.data.url, 'linkrad-viewer')
      popupStudyRef.current = study.studyUID
      persistViewerDocked(false)
    } catch {
      alert('Không mở được viewer')
    }
  }

  const load = async () => {
    try {
      const r = await api.get('/ris/studies')
      setStudies(r.data || [])
      syncWithStudies(r.data || [])
    } catch (e) {
      console.error('Teleradiology load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const siteOptions = useMemo(
    () => Array.from(new Set(studies.map(s => s.site).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [studies]
  )

  const counts = useMemo(() => {
    const c = {}
    for (const s of studies) c[s.status] = (c[s.status] || 0) + 1
    return c
  }, [studies])

  const filtered = useMemo(() => {
    const group = STATUS_GROUPS.find(g => g.key === groupKey)
    return studies.filter(s => {
      if (group?.statuses && !group.statuses.includes(s.status)) return false
      if (modalityFilter && s.modality !== modalityFilter) return false
      if (siteFilter && s.site !== siteFilter) return false
      const d = (s.appointmentTime || s.studyDate || s.createdAt || '').slice(0, 10)
      if (dateFrom && d && d < dateFrom) return false
      if (dateTo && d && d > dateTo) return false
      return true
    })
  }, [studies, groupKey, modalityFilter, siteFilter, dateFrom, dateTo])

  useEffect(() => {
    if (selectedId && !filtered.find(s => s._id === selectedId)) setSelectedId(null)
  }, [filtered, selectedId])

  const selected = useMemo(() => filtered.find(s => s._id === selectedId), [filtered, selectedId])
  const activeCase = openCases.find(c => c._id === activeCaseId)


  // Jump to another case from the queue rail — opens as a tab if it isn't
  // already one. Doesn't auto-claim (the "Ca kế tiếp" button handles claiming).
  const jumpToCase = (s) => openCase(s)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm">Đang tải…</div>
        </div>
      </div>
    )
  }

  const systemTabs = [{ id: SYS_WORKLIST, label: 'Danh sách ca đọc', icon: '📋' }]
  const filterBar = (
    <FilterBar
      modalityFilter={modalityFilter} onModalityFilter={setModalityFilter}
      siteFilter={siteFilter} onSiteFilter={setSiteFilter} siteOptions={siteOptions}
      dateFrom={dateFrom} onDateFrom={setDateFrom}
      dateTo={dateTo} onDateTo={setDateTo}
      onRefresh={load}
    />
  )

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-4 bg-gray-50">
      <PageHeader
        userName={auth?.displayName || auth?.username}
        date={todayISO()}
        counts={counts}
      />
      <CaseTabBar
        systemTabs={systemTabs}
        openCases={openCases}
        activeId={activeCaseId}
        onSelect={setActiveCaseId}
        onClose={closeCase}
      />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {activeCase ? (
          // Wrapper is always present so React keeps the InlineViewer mounted
          // across expanded toggles. Only the className changes: normal flow
          // vs fixed-fullscreen overlay that covers the Layout sidebar + header.
          <div className={(isViewerExpanded && viewerDocked) ? 'fixed inset-0 z-50 flex bg-gray-50' : 'flex-1 flex'}>
            <InlineViewer
              studyUID={activeCase.studyUID}
              onUndock={() => undockViewer(activeCase)}
              hidden={!viewerDocked}
              expanded={isViewerExpanded}
              onToggleExpanded={toggleViewerExpanded}
            />
            {viewerDocked && (
              <ViewerDivider reportWidth={reportWidth} onChange={persistReportWidth} />
            )}
            <div
              className={viewerDocked ? 'flex-shrink-0 flex flex-col border-l border-gray-200 bg-gray-50' : 'flex-1 flex flex-col'}
              style={viewerDocked ? { width: `${reportWidth}px` } : undefined}>
              {!viewerDocked && (
                <UndockedBanner onRedock={() => persistViewerDocked(true)} />
              )}
              <PatientDetailView
                study={activeCase}
                onRefresh={load}
                onOpenCase={openCase}
                showConsumables={false}
                showHistoryRail={false}
              />
            </div>
          </div>
        ) : (
          <>
            <StudyList
              studies={filtered}
              selectedId={selectedId}
              onSelect={(s) => setSelectedId(s._id)}
              onOpen={openCase}
              groupKey={groupKey}
              onGroupKey={setGroupKey}
              filterBar={filterBar}
            />
            {selected ? (
              <StudyPreview study={selected} onOpen={openCase} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 text-sm p-8">
                <div className="max-w-xs">
                  <div className="text-3xl mb-3 opacity-50">👈</div>
                  <div className="text-gray-500 mb-1">Chọn một ca từ danh sách bên trái</div>
                  <div className="text-xs text-gray-400">
                    Click để xem chi tiết · double-click hoặc bấm "Mở ca" để bắt đầu đọc
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
