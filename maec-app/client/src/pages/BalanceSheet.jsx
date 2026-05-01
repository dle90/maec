import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getBS, updateBS } from '../api'
import EditableCell from '../components/EditableCell'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']

const COMPUTED_IDS = {
  current_assets: ['cash','receivable','advance','prepaid','vat'],
  non_current_assets: ['ppe','lt_prepaid'],
  total_assets: ['current_assets','non_current_assets'],
  current_liab: ['payable','tax_payable','other_payable','st_loan'],
  non_current_liab: ['lt_loan'],
  total_liab: ['current_liab','non_current_liab'],
  equity: null, // total_assets - total_liab
  total_liab_equity: ['total_liab','equity']
}

export default function BalanceSheet() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('financials.manage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getBS().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateBS(newData)
        .then(() => { setSaving(false); setLastSaved(new Date()) })
        .catch(() => setSaving(false))
    }, 1000)
  }, [])

  const handleCellChange = (rowId, colIdx, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        rows: prev.rows.map(row => {
          if (row.id !== rowId) return row
          const newValues = [...(row.values || Array(12).fill(0))]
          newValues[colIdx] = newVal
          return { ...row, values: newValues }
        })
      }
      scheduleSave(newData)
      return newData
    })
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>
  if (!data) return <div className="text-red-500 p-4">Lỗi tải dữ liệu</div>

  const rows = data.rows || []

  const getRowValues = (id) => rows.find(r => r.id === id)?.values || Array(12).fill(0)

  const computeValues = (id) => {
    if (id === 'current_assets') {
      return Array(12).fill(0).map((_, i) =>
        ['cash','receivable','advance','prepaid','vat'].reduce((s, rid) => s + (Number(getRowValues(rid)[i]) || 0), 0)
      )
    }
    if (id === 'non_current_assets') {
      return Array(12).fill(0).map((_, i) =>
        ['ppe','lt_prepaid'].reduce((s, rid) => s + (Number(getRowValues(rid)[i]) || 0), 0)
      )
    }
    if (id === 'total_assets') {
      return Array(12).fill(0).map((_, i) =>
        (Number(computeValues('current_assets')[i]) || 0) + (Number(computeValues('non_current_assets')[i]) || 0)
      )
    }
    if (id === 'current_liab') {
      return Array(12).fill(0).map((_, i) =>
        ['payable','tax_payable','other_payable','st_loan'].reduce((s, rid) => s + (Number(getRowValues(rid)[i]) || 0), 0)
      )
    }
    if (id === 'non_current_liab') {
      return Array(12).fill(0).map((_, i) => Number(getRowValues('lt_loan')[i]) || 0)
    }
    if (id === 'total_liab') {
      return Array(12).fill(0).map((_, i) =>
        (Number(computeValues('current_liab')[i]) || 0) + (Number(computeValues('non_current_liab')[i]) || 0)
      )
    }
    if (id === 'equity') {
      return Array(12).fill(0).map((_, i) =>
        (Number(computeValues('total_assets')[i]) || 0) - (Number(computeValues('total_liab')[i]) || 0)
      )
    }
    if (id === 'total_liab_equity') {
      return Array(12).fill(0).map((_, i) =>
        (Number(computeValues('total_liab')[i]) || 0) + (Number(computeValues('equity')[i]) || 0)
      )
    }
    return getRowValues(id)
  }

  const COMPUTED_ROW_IDS = ['current_assets','non_current_assets','total_assets','current_liab','non_current_liab','total_liab','equity','total_liab_equity']

  let lastGroup = null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Bảng cân đối kế toán Hợp nhất</h2>
          <p className="text-xs text-gray-500 mt-0.5">Đơn vị: VND triệu | Click vào ô để chỉnh sửa</p>
        </div>
        {saving && <span className="text-xs text-blue-600">Đang lưu...</span>}
        {!saving && lastSaved && <span className="text-xs text-green-600">Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}</span>}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '240px' }}>Chỉ tiêu</th>
                {MONTH_LABELS.map(m => (
                  <th key={m} style={{ minWidth: '80px' }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const showGroupHeader = row.group && row.group !== lastGroup && row.group !== ''
                if (row.group) lastGroup = row.group

                const isComputed = COMPUTED_ROW_IDS.includes(row.id)
                const displayValues = isComputed ? computeValues(row.id) : (row.values || Array(12).fill(0))
                const rowClass = row.isTotal ? 'row-total' : row.isSubtotal ? 'row-subtotal' : 'row-normal'

                return (
                  <React.Fragment key={row.id || rowIdx}>
                    {showGroupHeader && (
                      <tr className="row-group-header">
                        <td colSpan={13}>{row.group}</td>
                      </tr>
                    )}
                    <tr className={rowClass}>
                      <td className="px-2 py-1 text-sm" style={{ paddingLeft: row.group && !row.isTotal && !row.isSubtotal ? '20px' : '8px' }}>
                        {row.label}
                      </td>
                      {displayValues.map((val, i) => {
                        if (isComputed || row.isTotal || row.isSubtotal) {
                          const n = Number(val)
                          return (
                            <td key={i} className={`px-2 py-1 text-right text-sm ${n < 0 ? 'text-red-600' : ''}`}>
                              {fmt(val)}
                            </td>
                          )
                        }
                        return (
                          <EditableCell
                            key={i}
                            value={val}
                            readOnly={!canEdit}
                            onChange={(v) => handleCellChange(row.id, i, v)}
                          />
                        )
                      })}
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
