import React, { useState, useEffect, useRef, useMemo } from 'react'
import api from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────

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
const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Normalize a consumable row to the shape persisted on Study.consumables.
const toSavePayload = (rows) => rows
  .filter(r => !r._deleted)
  .map(r => ({
    supplyId: r.supplyId,
    supplyCode: r.supplyCode,
    supplyName: r.supplyName,
    unit: r.unit,
    standardQty: r.standardQty ?? null,
    actualQty: Number(r.actualQty) || 0,
    notes: r.notes || '',
  }))

// ── Supply picker (autocomplete) ─────────────────────────────────────────────

function SupplyPicker({ site, existingIds, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = { status: 'active' }
        if (q.trim()) params.q = q.trim()
        if (site) params.site = site
        const r = await api.get('/inventory/supplies', { params })
        setResults((r.data || []).filter(s => !existingIds.has(s._id)).slice(0, 30))
      } catch { setResults([]) }
      setLoading(false)
    }, 200)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [q, site, existingIds])

  return (
    <div className="mt-4 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
        <span className="text-gray-400">🔎</span>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Tìm vật tư theo mã hoặc tên…"
          className="flex-1 text-sm outline-none bg-transparent" />
        <span className="text-[11px] text-gray-400">{loading ? 'đang tìm…' : `${results.length} kết quả`}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm ml-1">✕</button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {results.length === 0 && !loading && (
          <div className="text-center text-xs text-gray-400 py-4">Không tìm thấy vật tư</div>
        )}
        {results.map(s => (
          <button key={s._id} onClick={() => onPick(s)}
            className="w-full text-left px-3 py-2 flex items-center gap-3 text-sm border-b border-gray-100 last:border-0 hover:bg-blue-50">
            <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{s.code}</span>
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">ĐV: {s.unit}</span>
            <span className="font-mono text-xs text-gray-400 flex-shrink-0">Tồn: {s.currentStock ?? '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Qty stepper ──────────────────────────────────────────────────────────────

function QtyStepper({ value, onChange, variant = 'normal' }) {
  const borderCls = variant === 'diff' ? 'border-amber-400 bg-amber-50'
    : variant === 'added' ? 'border-emerald-400 bg-emerald-50'
    : 'border-gray-300 bg-white'
  const textCls = variant === 'diff' ? 'text-amber-800 font-semibold'
    : variant === 'added' ? 'text-emerald-800 font-semibold'
    : 'text-gray-900'
  return (
    <div className={`inline-flex items-center rounded-md border ${borderCls}`}>
      <button onClick={() => onChange(Math.max(0, Number(value) - 1))}
        className="px-2 py-1 text-gray-400 hover:text-gray-700 text-sm">−</button>
      <input type="number" value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`w-14 px-1 py-1 text-sm text-right font-mono bg-transparent outline-none ${textCls}`} />
      <button onClick={() => onChange(Number(value) + 1)}
        className="px-2 py-1 text-gray-400 hover:text-gray-700 text-sm">+</button>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function CompleteStudyModal({ study, open, onClose, onConfirmed }) {
  const [phase, setPhase] = useState('edit') // 'edit' | 'success'
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { transactionId, items }

  // Load standard + any previously-saved rows when opening
  useEffect(() => {
    if (!open || !study?._id) return
    let cancelled = false
    setPhase('edit')
    setLoading(true)
    setError('')
    setShowPicker(false)
    setResult(null)
    ;(async () => {
      try {
        // Existing rows on the study take precedence (user opened, edited, closed, reopened)
        const existing = Array.isArray(study.consumables) && study.consumables.length
          ? study.consumables
          : null
        if (existing) {
          if (!cancelled) setRows(existing.map(r => ({
            ...r,
            actualQty: Number(r.actualQty) || 0,
            _origStd: r.standardQty,
          })))
        } else {
          const r = await api.get(`/ris/studies/${study._id}/consumables-standard`)
          if (!cancelled) {
            setRows((r.data || []).map(x => ({
              ...x,
              actualQty: Number(x.standardQty) || 0,
              _origStd: x.standardQty,
              notes: '',
            })))
          }
        }
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, study?._id])

  const active = rows.filter(r => !r._deleted)
  const diffCount = active.filter(r => !r._added && Number(r.actualQty) !== Number(r._origStd || 0)).length
  const deletedCount = rows.filter(r => r._deleted && !r._added).length
  const addedCount = rows.filter(r => r._added && !r._deleted).length
  const hasAnyRow = active.length > 0
  const existingIds = useMemo(() => new Set(rows.filter(r => !r._deleted).map(r => r.supplyId)), [rows])

  const setQty = (idx, qty) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, actualQty: qty } : r))
  }
  const setNote = (idx, note) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, notes: note } : r))
  }
  const removeRow = (idx) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, _deleted: true } : r))
  }
  const undoRemove = (idx) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, _deleted: false } : r))
  }
  const addPicked = (supply) => {
    setRows(rs => [...rs, {
      supplyId: supply._id,
      supplyCode: supply.code,
      supplyName: supply.name,
      unit: supply.unit,
      standardQty: null,
      actualQty: 1,
      notes: '',
      _added: true,
    }])
    setShowPicker(false)
  }
  const restoreStandard = async () => {
    if (!confirm('Khôi phục về định mức chuẩn? Tất cả chỉnh sửa, xoá, thêm mới sẽ mất.')) return
    try {
      const r = await api.get(`/ris/studies/${study._id}/consumables-standard`)
      setRows((r.data || []).map(x => ({
        ...x,
        actualQty: Number(x.standardQty) || 0,
        _origStd: x.standardQty,
        notes: '',
      })))
    } catch { /* silent */ }
  }

  const confirm = async (saveDraft = false) => {
    setSaving(true)
    setError('')
    try {
      // Save consumables first so the auto-deduct reads the KTV's values
      await api.put(`/ris/studies/${study._id}/consumables`, {
        consumables: toSavePayload(rows),
      })
      if (saveDraft) {
        setSaving(false)
        onConfirmed?.({ draft: true })
        onClose()
        return
      }
      // Flip status → backend auto-deducts and returns the updated study
      const r = await api.put(`/ris/studies/${study._id}`, { status: 'pending_read' })
      setResult({
        transactionId: r.data.consumablesTransactionId || '',
        items: toSavePayload(rows),
      })
      setPhase('success')
    } catch (e) {
      setError(e.response?.data?.error || 'Không xác nhận được ca chụp')
    }
    setSaving(false)
  }

  if (!open) return null

  // ── Success phase (State D) ────────────────────────────────────────────────
  if (phase === 'success') {
    const age = calcAge(study.dob)
    const shortTxId = result?.transactionId ? result.transactionId.split('-').slice(-2).join('-') : '—'
    return (
      <Backdrop onClose={() => { onConfirmed?.(); onClose() }}>
        <div className="bg-white rounded-xl shadow-xl flex flex-col overflow-hidden" style={{ width: 560, maxHeight: '80vh' }}>
          <div className="px-6 pt-6 pb-2 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div className="text-lg font-semibold text-gray-900">Đã hoàn tất ca chụp</div>
            <div className="text-sm text-gray-500 mt-1 font-mono">
              {study.patientName} · {study.patientId}
              {age !== '' && ` · ${age}t`}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {study.modality} {study.bodyPart || ''}
            </div>
            <div className="mt-2 inline-flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Đang thực hiện</span>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Chờ đọc</span>
            </div>
          </div>

          {result?.items?.length > 0 && (
            <div className="px-6 py-4 overflow-y-auto">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-2">Đã trừ kho (FIFO theo lô)</div>
              <div className="border border-gray-200 rounded-lg bg-gray-50 divide-y divide-gray-200">
                {result.items.map((it, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                    <span className="font-mono text-[11px] text-gray-500 w-20 flex-shrink-0">{it.supplyCode}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{it.supplyName}</div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-gray-900">
                      {it.actualQty} {it.unit}
                    </div>
                  </div>
                ))}
                <div className="px-3 py-2 flex items-center justify-between bg-white">
                  <span className="text-xs text-gray-500">Tổng dòng</span>
                  <span className="font-mono text-sm font-semibold text-gray-900">{result.items.length} vật tư</span>
                </div>
              </div>
              {result.transactionId && (
                <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Mã phiếu xuất kho: <span className="font-mono text-gray-700">{shortTxId}</span></span>
                </div>
              )}
            </div>
          )}
          {result?.items?.length === 0 && (
            <div className="px-6 py-4 text-center text-sm text-gray-500">
              Không có vật tư nào được ghi cho ca này.
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div />
            <button onClick={() => { onConfirmed?.(); onClose() }}
              className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
              Đóng
            </button>
          </div>
        </div>
      </Backdrop>
    )
  }

  // ── Edit phase (States A / B / C) ──────────────────────────────────────────
  const age = calcAge(study.dob)
  const anyEdit = diffCount + deletedCount + addedCount > 0

  return (
    <Backdrop onClose={!saving ? onClose : undefined}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col overflow-hidden"
        style={{ width: 720, maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-gray-900">Kết thúc chụp — ghi vật tư tiêu hao</div>
              <div className="text-xs text-gray-500 mt-0.5">
                KTV xác nhận vật tư thực tế đã dùng trước khi chuyển ca sang "Chờ đọc"
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
              Đang thực hiện
            </span>
          </div>

          {/* Patient summary card */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-semibold">
              {initials(study.patientName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-sm truncate">{study.patientName}</div>
                <span className="font-mono text-xs text-gray-500">{study.patientId}</span>
                {study.gender && <span className="text-xs text-gray-400">·</span>}
                {study.gender && (
                  <span className="text-xs text-gray-600">
                    {study.gender === 'M' ? 'Nam' : study.gender === 'F' ? 'Nữ' : study.gender}
                    {age !== '' && ` · ${age}t`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700">{study.modality}</span>
                {study.bodyPart && <span className="text-xs text-gray-700">{study.bodyPart}</span>}
                {study.site && <><span className="text-xs text-gray-400">·</span><span className="text-xs text-gray-500">{study.site}</span></>}
                {study.scheduledAt && <><span className="text-xs text-gray-400">·</span><span className="text-xs text-gray-500 font-mono">{fmtTime(study.scheduledAt)}</span></>}
              </div>
            </div>
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-10">Đang tải định mức…</div>
          ) : !hasAnyRow && !showPicker ? (
            /* Empty state — C */
            <div>
              <div className="mb-3">
                <div className="text-sm font-semibold text-gray-900">Vật tư tiêu hao</div>
              </div>
              <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 px-6 py-8 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-white border border-gray-200 flex items-center justify-center mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7 9 18l-5-5" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">Chưa có định mức cho dịch vụ này</div>
                <div className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Admin chưa thiết lập danh sách vật tư chuẩn cho "{study.bodyPart || study.modality}". KTV có thể thêm vật tư thủ công bên dưới.
                </div>
                <button onClick={() => setShowPicker(true)}
                  className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                  <span className="text-base leading-none">＋</span> Thêm vật tư khác
                </button>
                <div className="mt-4 text-[11px] text-gray-400">
                  Cũng có thể xác nhận không dùng vật tư và chuyển ca sang "Chờ đọc" ngay.
                </div>
              </div>
            </div>
          ) : (
            /* Populated — A / B */
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Vật tư tiêu hao</div>
                  {anyEdit ? (
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      {diffCount > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium border border-amber-200">{diffCount} điều chỉnh</span>}
                      {deletedCount > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-medium border border-rose-200">{deletedCount} đã xoá</span>}
                      {addedCount > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-200">{addedCount} thêm mới</span>}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Định mức chuẩn cho {study.bodyPart || study.modality} — chỉnh sửa nếu thực tế khác.
                    </div>
                  )}
                </div>
                {anyEdit ? (
                  <button onClick={restoreStandard} className="text-[11px] text-gray-500 hover:text-gray-700 underline">Khôi phục định mức</button>
                ) : (
                  <span className="text-[11px] text-gray-500 font-mono">{active.length} dòng · theo định mức</span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col style={{ width: '80px' }} />
                    <col />
                    <col style={{ width: '48px' }} />
                    <col style={{ width: '64px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '28px' }} />
                  </colgroup>
                  <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Mã VT</th>
                      <th className="text-left font-medium px-3 py-2">Tên vật tư</th>
                      <th className="text-left font-medium px-3 py-2">ĐV</th>
                      <th className="text-right font-medium px-3 py-2">Định mức</th>
                      <th className="text-right font-medium px-3 py-2">Thực tế</th>
                      <th className="text-left font-medium px-3 py-2">Ghi chú</th>
                      <th className="px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {rows.map((r, i) => {
                      if (r._deleted) {
                        return (
                          <tr key={i} className="border-t border-gray-100 bg-rose-50/30">
                            <td className="px-3 py-2 font-mono text-xs text-rose-400 line-through truncate">{r.supplyCode}</td>
                            <td className="px-3 py-2 text-sm text-rose-400 line-through break-words">{r.supplyName}</td>
                            <td className="px-3 py-2 text-xs text-rose-300 line-through">{r.unit}</td>
                            <td className="px-3 py-2 text-right font-mono text-sm text-rose-300 line-through">{r.standardQty ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-rose-500 text-right italic">đã xoá</td>
                            <td colSpan="2" className="px-3 py-2 text-right">
                              <button onClick={() => undoRemove(i)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">↶ Hoàn tác</button>
                            </td>
                          </tr>
                        )
                      }
                      const isDiff = !r._added && Number(r.actualQty) !== Number(r._origStd || 0)
                      const variant = r._added ? 'added' : isDiff ? 'diff' : 'normal'
                      return (
                        <tr key={i} className={`border-t border-gray-100 align-top ${r._added ? 'bg-emerald-50/40' : ''}`}>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500 truncate">
                            {r.supplyCode}
                            {r._added && <div className="text-[9px] font-semibold text-emerald-600 mt-0.5">MỚI</div>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-sm text-gray-900 leading-snug break-words">{r.supplyName}</div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{r.unit}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-500">{r.standardQty ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col items-end gap-0.5">
                              <QtyStepper value={r.actualQty} onChange={(v) => setQty(i, v)} variant={variant} />
                              {isDiff && <span className="text-[10px] text-amber-700 font-medium whitespace-nowrap">⚠ Có điều chỉnh</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <input value={r.notes || ''} onChange={(e) => setNote(i, e.target.value)} placeholder="ghi chú…"
                              className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white placeholder-gray-400 outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-1 py-2.5 text-right">
                            <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-rose-500 text-sm">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!showPicker && (
                <button onClick={() => setShowPicker(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  <span className="text-base leading-none">＋</span> Thêm vật tư khác
                </button>
              )}
            </div>
          )}

          {showPicker && (
            <SupplyPicker
              site={study.site}
              existingIds={existingIds}
              onPick={addPicked}
              onClose={() => setShowPicker(false)}
            />
          )}

          {error && (
            <div className="mt-3 px-3 py-2 text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-[11px] text-gray-500 mb-2.5 flex items-center gap-1.5">
            <span>ℹ</span> Sau khi xác nhận, số lượng thực tế sẽ được trừ tự động khỏi kho (FIFO theo lô).
          </div>
          <div className="flex items-center justify-between">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40">
              Huỷ
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => confirm(true)} disabled={saving || loading}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40">
                Lưu tạm
              </button>
              <button onClick={() => confirm(false)} disabled={saving || loading}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-2">
                {saving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="white" strokeOpacity="0.3" strokeWidth="3"/>
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Đang xử lý…
                  </>
                ) : (
                  <>
                    {hasAnyRow ? 'Xác nhận & chuyển sang Chờ đọc' : 'Xác nhận (0 vật tư) & chuyển sang Chờ đọc'}
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-900/40 flex items-start justify-center pt-14 px-4 overflow-y-auto"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}
