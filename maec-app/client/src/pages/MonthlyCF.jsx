import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { getMonthlyCF, updateMonthlyCF } from '../api'
import EditableCell from '../components/EditableCell'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']

export default function MonthlyCF() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('financials.manage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getMonthlyCF().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateMonthlyCF(newData)
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
          const newValues = [...(row.values || [])]
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
  const ebitdaRow = rows.find(r => r.id === 'ebitda')
  const netCfRow = rows.find(r => r.id === 'net_cf')

  // Cumulative net CF
  let cumulative = 0
  const chartData = MONTH_LABELS.map((m, i) => {
    const cf = Number(netCfRow?.values?.[i]) || 0
    cumulative += cf
    return {
      month: m,
      ebitda: Number(ebitdaRow?.values?.[i]) || 0,
      netCF: cf,
      cumulativeCF: cumulative
    }
  })

  const computeYTD = (row) => (row.values || []).reduce((s, v) => s + (Number(v) || 0), 0)

  let lastGroup = null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Dự báo Dòng tiền - Theo tháng 2026</h2>
          <p className="text-xs text-gray-500 mt-0.5">Đơn vị: VND triệu</p>
        </div>
        {saving && <span className="text-xs text-blue-600">Đang lưu...</span>}
        {!saving && lastSaved && <span className="text-xs text-green-600">Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '200px' }}>Chỉ tiêu</th>
                {MONTH_LABELS.map(m => (
                  <th key={m} style={{ minWidth: '75px' }}>{m}</th>
                ))}
                <th style={{ minWidth: '85px', backgroundColor: '#1e3a8a' }}>Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const showGroupHeader = row.group && row.group !== '' && row.group !== lastGroup
                if (row.group) lastGroup = row.group

                const ytd = computeYTD(row)
                const rowClass = row.isTotal ? 'row-total' : row.isSubtotal ? 'row-subtotal' : 'row-normal'
                const isNetCF = row.id === 'net_cf'

                return (
                  <React.Fragment key={row.id || rowIdx}>
                    {showGroupHeader && (
                      <tr className="row-group-header">
                        <td colSpan={14}>{row.group}</td>
                      </tr>
                    )}
                    <tr className={rowClass}>
                      <td className="px-2 py-1 text-sm" style={{ paddingLeft: row.group && !row.isTotal && !row.isSubtotal ? '20px' : '8px' }}>
                        {row.label}
                      </td>
                      {(row.values || Array(12).fill(0)).map((val, i) => {
                        if (row.isTotal || row.isSubtotal) {
                          const n = Number(val)
                          const colorCls = isNetCF ? (n >= 0 ? 'text-green-600' : 'text-red-600') : (n < 0 ? 'text-red-600' : '')
                          return (
                            <td key={i} className={`px-2 py-1 text-right text-sm ${colorCls}`}>
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
                      <td className={`px-2 py-1 text-right text-sm font-semibold bg-blue-50 ${
                        isNetCF ? (ytd >= 0 ? 'text-green-600' : 'text-red-700') : (ytd < 0 ? 'text-red-600' : 'text-blue-700')
                      }`}>
                        {fmt(ytd)}
                      </td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">EBITDA & Dòng tiền tích lũy 2026</h3>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1) + 'k'} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1) + 'k'} />
            <Tooltip formatter={(v) => [fmt(v) + ' tr.']} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="ebitda" name="EBITDA" fill="#3b82f6" opacity={0.8} />
            <Line yAxisId="right" type="monotone" dataKey="cumulativeCF" name="CF Tích lũy" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="netCF" name="CF Thuần" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
