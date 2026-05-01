import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getBreakeven, updateBreakeven } from '../api'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

function EditableNumberCell({ value, onChange, highlight, readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState('')

  const bgClass = highlight === 'green' ? 'bg-green-50 text-green-700' :
                  highlight === 'red' ? 'bg-red-50 text-red-700' : ''

  if (readOnly) {
    return <td className={`px-2 py-1 text-right text-sm ${bgClass}`}>{fmt(value)}</td>
  }

  if (editing) {
    return (
      <td className="p-0">
        <input
          autoFocus
          type="number"
          step="0.1"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => { setEditing(false); onChange(local === '' ? 0 : Number(local)) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') { setEditing(false); onChange(local === '' ? 0 : Number(local)) }
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full px-2 py-1 text-right border-2 border-blue-400 outline-none bg-blue-50 text-sm"
          style={{ minWidth: '70px' }}
        />
      </td>
    )
  }
  return (
    <td
      className={`px-2 py-1 text-right text-sm cursor-pointer hover:bg-yellow-50 ${bgClass}`}
      onClick={() => { setLocal(value ?? 0); setEditing(true) }}
    >
      {fmt(value)}
    </td>
  )
}

export default function Breakeven() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('financials.manage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getBreakeven().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateBreakeven(newData)
        .then(() => { setSaving(false); setLastSaved(new Date()) })
        .catch(() => setSaving(false))
    }, 1000)
  }, [])

  const updateEarlyPhase = (serviceIdx, site, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        earlyPhase: {
          ...prev.earlyPhase,
          rows: prev.earlyPhase.rows.map((row, i) =>
            i === serviceIdx ? { ...row, values: { ...row.values, [site]: newVal } } : row
          )
        }
      }
      scheduleSave(newData)
      return newData
    })
  }

  const updateMaturePhase = (serviceIdx, site, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        maturePhase: {
          ...prev.maturePhase,
          rows: prev.maturePhase.rows.map((row, i) =>
            i === serviceIdx ? { ...row, values: { ...row.values, [site]: newVal } } : row
          )
        }
      }
      scheduleSave(newData)
      return newData
    })
  }

  const updateBERevenue = (site, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        breakevenRevenue: { ...prev.breakevenRevenue, values: { ...prev.breakevenRevenue.values, [site]: newVal } }
      }
      scheduleSave(newData)
      return newData
    })
  }

  const updateFixedCost = (itemIdx, site, newVal) => {
    setData(prev => {
      const newData = {
        ...prev,
        fixedCosts: {
          ...prev.fixedCosts,
          rows: prev.fixedCosts.rows.map((row, i) =>
            i === itemIdx ? { ...row, values: { ...row.values, [site]: newVal } } : row
          )
        }
      }
      scheduleSave(newData)
      return newData
    })
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>
  if (!data) return <div className="text-red-500 p-4">Lỗi tải dữ liệu</div>

  const sites = data.sites || []

  const SectionTable = ({ title, phase, onCellChange, headerBg = '#1e3a5f' }) => (  // eslint-disable-line
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200" style={{ backgroundColor: headerBg + '15' }}>
        <h3 className="text-sm font-semibold" style={{ color: headerBg }}>{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="financial-table">
          <thead>
            <tr>
              <th className="text-left" style={{ minWidth: '140px', backgroundColor: headerBg }}>Dịch vụ</th>
              {sites.map(s => (
                <th key={s} style={{ minWidth: '80px', backgroundColor: headerBg }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phase.rows.map((row, i) => (
              <tr key={row.service} className="row-normal border-b border-gray-100">
                <td className="px-2 py-1 text-sm font-medium text-gray-700">{row.service}</td>
                {sites.map(site => (
                  <EditableNumberCell
                    key={site}
                    value={row.values?.[site] ?? 0}
                    onChange={(v) => onCellChange(i, site, v)}
                    readOnly={!canEdit}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Phân tích Điểm Hòa Vốn</h2>
          <p className="text-xs text-gray-500 mt-0.5">Số ca/ngày | Click vào ô để chỉnh sửa</p>
        </div>
        {saving && <span className="text-xs text-blue-600">Đang lưu...</span>}
        {!saving && lastSaved && <span className="text-xs text-green-600">Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}</span>}
      </div>

      {/* Section 1: Early phase */}
      <SectionTable
        title={data.earlyPhase?.label || 'Số ca thu đủ bù chi/ngày (tháng 7-12)'}
        phase={data.earlyPhase}
        onCellChange={updateEarlyPhase}
        headerBg="#1e5f3a"
      />

      {/* Section 2: Mature phase */}
      <SectionTable
        title={data.maturePhase?.label || 'Số ca hòa vốn/ngày từ tháng 13'}
        phase={data.maturePhase}
        onCellChange={updateMaturePhase}
        headerBg="#1e3a5f"
      />

      {/* Section 3: Breakeven revenue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50">
          <h3 className="text-sm font-semibold text-amber-800">
            {data.breakevenRevenue?.label || 'Doanh thu hòa vốn từ tháng 13 (triệu VND/tháng)'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '140px', backgroundColor: '#92400e' }}>Chỉ tiêu</th>
                {sites.map(s => (
                  <th key={s} style={{ minWidth: '90px', backgroundColor: '#92400e' }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="row-normal border-b border-gray-100">
                <td className="px-2 py-1 text-sm font-medium text-gray-700">Doanh thu HV</td>
                {sites.map(site => (
                  <EditableNumberCell
                    key={site}
                    value={data.breakevenRevenue?.values?.[site] ?? 0}
                    onChange={(v) => updateBERevenue(site, v)}
                    readOnly={!canEdit}
                  />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Fixed costs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-red-50">
          <h3 className="text-sm font-semibold text-red-800">
            {data.fixedCosts?.label || 'Định phí (triệu VND/tháng)'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="financial-table">
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: '160px', backgroundColor: '#991b1b' }}>Khoản mục</th>
                {sites.map(s => (
                  <th key={s} style={{ minWidth: '90px', backgroundColor: '#991b1b' }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.fixedCosts?.rows?.map((row, i) => (
                <tr key={row.item} className="row-normal border-b border-gray-100">
                  <td className="px-2 py-1 text-sm font-medium text-gray-700">{row.item}</td>
                  {sites.map(site => (
                    <EditableNumberCell
                      key={site}
                      value={row.values?.[site] ?? 0}
                      onChange={(v) => updateFixedCost(i, site, v)}
                      readOnly={!canEdit}
                    />
                  ))}
                </tr>
              ))}
              {/* Total row */}
              <tr className="row-subtotal">
                <td className="px-2 py-1 text-sm font-semibold">Tổng định phí</td>
                {sites.map(site => {
                  const total = (data.fixedCosts?.rows || []).reduce((s, row) => s + (Number(row.values?.[site]) || 0), 0)
                  return (
                    <td key={site} className="px-2 py-1 text-right text-sm font-semibold text-blue-700">
                      {fmt(total)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
