import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getAnnualPL, updateAnnualPL } from '../api'
import EditableCell from '../components/EditableCell'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

export default function AnnualPL() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('financials.manage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getAnnualPL().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateAnnualPL(newData)
        .then(() => {
          setSaving(false)
          setLastSaved(new Date())
        })
        .catch(() => setSaving(false))
    }, 1000)
  }, [])

  const handleCellChange = (rowId, siteKey, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        rows: prev.rows.map(row =>
          row.id === rowId
            ? { ...row, values: { ...row.values, [siteKey]: newVal } }
            : row
        )
      }
      scheduleSave(newData)
      return newData
    })
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>
  if (!data) return <div className="text-red-500 p-4">Lỗi tải dữ liệu</div>

  const sites = data.sites || []
  const rows = data.rows || []

  const computeTotal = (row) => {
    return sites.reduce((sum, s) => sum + (Number(row.values?.[s]) || 0), 0)
  }

  let lastGroup = null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Báo cáo KQKD Hợp nhất - Năm 2025</h2>
          <p className="text-xs text-gray-500 mt-0.5">Đơn vị: VND triệu | Click vào ô để chỉnh sửa</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Đang lưu...
            </span>
          )}
          {!saving && lastSaved && (
            <span className="text-xs text-green-600">
              Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '220px' }}>Chỉ tiêu</th>
                {sites.map(site => (
                  <th key={site} style={{ minWidth: '90px' }}>{site}</th>
                ))}
                <th style={{ minWidth: '100px', backgroundColor: '#1e3a8a' }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const showGroupHeader = row.group && row.group !== lastGroup && row.group !== ''
                if (row.group) lastGroup = row.group

                const total = computeTotal(row)
                const rowClass = row.isTotal ? 'row-total' : row.isSubtotal ? 'row-subtotal' : 'row-normal'

                return (
                  <React.Fragment key={row.id || rowIdx}>
                    {showGroupHeader && (
                      <tr className="row-group-header">
                        <td colSpan={sites.length + 2}>{row.group}</td>
                      </tr>
                    )}
                    <tr className={rowClass}>
                      <td className="px-2 py-1 text-sm" style={{ paddingLeft: row.group && !row.isTotal && !row.isSubtotal ? '20px' : '8px' }}>
                        {row.label}
                      </td>
                      {sites.map(site => {
                        const cellVal = row.values?.[site] ?? 0
                        if (row.isTotal || row.isSubtotal) {
                          const n = Number(cellVal)
                          return (
                            <td key={site} className={`px-2 py-1 text-right text-sm ${n < 0 ? 'text-red-600' : ''}`}>
                              {fmt(cellVal)}
                            </td>
                          )
                        }
                        return (
                          <EditableCell
                            key={site}
                            value={cellVal}
                            readOnly={!canEdit}
                            onChange={(v) => handleCellChange(row.id, site, v)}
                          />
                        )
                      })}
                      <td className={`px-2 py-1 text-right text-sm font-semibold bg-blue-50 ${total < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {fmt(total)}
                      </td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
