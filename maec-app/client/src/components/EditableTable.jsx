import React from 'react'
import EditableCell from './EditableCell'

export default function EditableTable({ title, columns, rows, onCellChange, showTotal = true, readOnly = false }) {
  const fmt = (v) => {
    if (v === null || v === undefined || v === '') return '-'
    const n = Number(v)
    if (isNaN(n)) return '-'
    return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  }

  const computeTotal = (row) => {
    if (Array.isArray(row.values)) {
      return row.values.reduce((sum, v) => sum + (Number(v) || 0), 0)
    }
    return columns.reduce((sum, col) => sum + (Number(row.values?.[col.key]) || 0), 0)
  }

  let lastGroup = null

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">{title}</h2>
        </div>
      )}
      <div className="table-container rounded-lg border border-gray-200 shadow-sm">
        <table className="financial-table">
          <thead>
            <tr>
              <th className="text-left">Chỉ tiêu</th>
              {columns.map(col => (
                <th key={col.key} className="text-right" style={{ minWidth: '90px' }}>
                  {col.label}
                </th>
              ))}
              {showTotal && (
                <th className="text-right bg-blue-900" style={{ minWidth: '90px' }}>Tổng</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const showGroupHeader = row.group && row.group !== lastGroup && row.group !== ''
              if (row.group) lastGroup = row.group

              const rowClass = row.isTotal
                ? 'row-total'
                : row.isSubtotal
                ? 'row-subtotal'
                : 'row-normal'

              const total = computeTotal(row)

              return (
                <React.Fragment key={row.id || rowIdx}>
                  {showGroupHeader && (
                    <tr className="row-group-header">
                      <td colSpan={columns.length + (showTotal ? 2 : 1)}>
                        {row.group}
                      </td>
                    </tr>
                  )}
                  <tr className={rowClass}>
                    <td className="px-2 py-1 text-sm" style={{ paddingLeft: row.group && !row.isTotal && !row.isSubtotal ? '24px' : '8px' }}>
                      {row.label}
                    </td>
                    {columns.map(col => {
                      const cellVal = Array.isArray(row.values)
                        ? row.values[col.key]
                        : (row.values?.[col.key] ?? 0)

                      if (row.isTotal || row.isSubtotal) {
                        const n = Number(cellVal)
                        const colorCls = n < 0 ? 'negative-value' : ''
                        return (
                          <td key={col.key} className={`px-2 py-1 text-right text-sm ${colorCls}`}>
                            {fmt(cellVal)}
                          </td>
                        )
                      }

                      return (
                        <EditableCell
                          key={col.key}
                          value={cellVal}
                          onChange={(newVal) => onCellChange(row.id, col.key, newVal)}
                          readOnly={readOnly}
                        />
                      )
                    })}
                    {showTotal && (
                      <td className={`px-2 py-1 text-right text-sm font-semibold ${total < 0 ? 'text-red-600' : 'text-blue-700'} bg-blue-50`}>
                        {fmt(total)}
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
