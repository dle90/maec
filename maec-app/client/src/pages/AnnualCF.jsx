import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getAnnualCF, updateAnnualCF } from '../api'
import EditableCell from '../components/EditableCell'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

export default function AnnualCF() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('financials.manage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getAnnualCF().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateAnnualCF(newData)
        .then(() => { setSaving(false); setLastSaved(new Date()) })
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

  // Exclude 'Tổng 2026' from editable columns, show it as computed
  const editableSites = sites.filter(s => s !== 'Tổng 2026')

  const computeTotal = (row) => {
    return editableSites.reduce((sum, s) => sum + (Number(row.values?.[s]) || 0), 0)
  }

  let lastGroup = null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Dự báo Dòng tiền - Năm 2026</h2>
          <p className="text-xs text-gray-500 mt-0.5">Đơn vị: VND triệu</p>
        </div>
        {saving && <span className="text-xs text-blue-600">Đang lưu...</span>}
        {!saving && lastSaved && <span className="text-xs text-green-600">Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}</span>}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '220px' }}>Chỉ tiêu</th>
                {editableSites.map(site => (
                  <th key={site} style={{ minWidth: '85px' }}>{site}</th>
                ))}
                <th style={{ minWidth: '100px', backgroundColor: '#1e3a8a' }}>Tổng 2026</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const showGroupHeader = row.group && row.group !== lastGroup && row.group !== ''
                if (row.group) lastGroup = row.group

                const computedTotal = computeTotal(row)
                const rowClass = row.isTotal ? 'row-total' : row.isSubtotal ? 'row-subtotal' : 'row-normal'

                const isSurplusRow = row.id === 'surplus'

                return (
                  <React.Fragment key={row.id || rowIdx}>
                    {showGroupHeader && (
                      <tr className="row-group-header">
                        <td colSpan={editableSites.length + 2}>{row.group}</td>
                      </tr>
                    )}
                    <tr className={rowClass}>
                      <td className="px-2 py-1 text-sm" style={{ paddingLeft: row.group && !row.isTotal && !row.isSubtotal ? '20px' : '8px' }}>
                        {row.label}
                      </td>
                      {editableSites.map(site => {
                        const cellVal = row.values?.[site] ?? 0
                        if (row.isTotal || row.isSubtotal) {
                          const n = Number(cellVal)
                          const colorCls = isSurplusRow ? (n >= 0 ? 'text-green-600' : 'text-red-600 font-bold') : (n < 0 ? 'text-red-600' : '')
                          return (
                            <td key={site} className={`px-2 py-1 text-right text-sm ${colorCls}`}>
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
                      <td className={`px-2 py-1 text-right text-sm font-semibold bg-blue-50 ${
                        isSurplusRow
                          ? (computedTotal >= 0 ? 'text-green-600' : 'text-red-700')
                          : (computedTotal < 0 ? 'text-red-600' : 'text-blue-700')
                      }`}>
                        {fmt(computedTotal)}
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
