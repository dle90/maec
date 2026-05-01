import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getSites, updateSites } from '../api'
import { useAuth } from '../context/AuthContext'

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '-'
  const n = Number(v)
  if (isNaN(n)) return v
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

function EditableTextCell({ value, onChange, align = 'left', type = 'text', readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState('')

  if (readOnly) {
    return (
      <td className="px-2 py-1.5 text-sm" style={{ textAlign: align }}>
        {type === 'number' ? (value != null && value !== '' ? Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '-') : (value || '-')}
      </td>
    )
  }

  return editing ? (
    <td className="p-0">
      <input
        autoFocus
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const val = type === 'number' ? (local === '' ? 0 : Number(local)) : local
          onChange(val)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            setEditing(false)
            const val = type === 'number' ? (local === '' ? 0 : Number(local)) : local
            onChange(val)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full px-2 py-1 border-2 border-blue-400 outline-none bg-blue-50 text-sm"
        style={{ textAlign: align, minWidth: '80px' }}
      />
    </td>
  ) : (
    <td
      className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-yellow-50`}
      style={{ textAlign: align }}
      onClick={() => { setLocal(value ?? ''); setEditing(true) }}
    >
      {type === 'number' ? fmt(value) : (value || '-')}
    </td>
  )
}

export default function SiteList() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('system.admin')
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getSites().then(d => {
      setSites(d)
      setLoading(false)
    })
  }, [])

  const scheduleSave = useCallback((newSites) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      updateSites(newSites)
        .then(() => { setSaving(false); setLastSaved(new Date()) })
        .catch(() => setSaving(false))
    }, 1000)
  }, [])

  const updateCell = (id, field, newVal) => {
    setSites(prev => {
      const updated = prev.map(site => site.id === id ? { ...site, [field]: newVal } : site)
      scheduleSave(updated)
      return updated
    })
  }

  const addSite = () => {
    const newId = Math.max(...sites.map(s => s.id), 0) + 1
    const newSite = {
      id: newId, name: '', location: '', startMonth: '',
      totalInvestment: 0, linkradShare: 0, linkradInvestment: 0,
      bankLoan: 0, bank: '', note: ''
    }
    const updated = [...sites, newSite]
    setSites(updated)
    scheduleSave(updated)
  }

  const deleteSite = (id) => {
    const updated = sites.filter(s => s.id !== id)
    setSites(updated)
    scheduleSave(updated)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>

  const totalInv = sites.reduce((s, site) => s + (Number(site.totalInvestment) || 0), 0)
  const totalLinkrad = sites.reduce((s, site) => s + (Number(site.linkradInvestment) || 0), 0)
  const totalBank = sites.reduce((s, site) => s + (Number(site.bankLoan) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Danh sách Site</h2>
          <p className="text-xs text-gray-500 mt-0.5">Tổng {sites.length} sites | Đơn vị đầu tư: VND triệu</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-blue-600">Đang lưu...</span>}
          {!saving && lastSaved && <span className="text-xs text-green-600">Đã lưu lúc {lastSaved.toLocaleTimeString('vi-VN')}</span>}
          <button
            onClick={addSite}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Thêm Site
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th className="px-2 py-2 text-white text-center font-medium" style={{ minWidth: '40px' }}>STT</th>
                <th className="px-3 py-2 text-white text-left font-medium" style={{ minWidth: '200px' }}>Tên site</th>
                <th className="px-3 py-2 text-white text-left font-medium" style={{ minWidth: '110px' }}>Địa phương</th>
                <th className="px-3 py-2 text-white text-center font-medium" style={{ minWidth: '100px' }}>Tháng bắt đầu</th>
                <th className="px-3 py-2 text-white text-right font-medium" style={{ minWidth: '110px' }}>Tổng ĐT (tr.)</th>
                <th className="px-3 py-2 text-white text-right font-medium" style={{ minWidth: '110px' }}>Tỷ lệ SH LR (%)</th>
                <th className="px-3 py-2 text-white text-right font-medium" style={{ minWidth: '110px' }}>ĐT LinkRad (tr.)</th>
                <th className="px-3 py-2 text-white text-right font-medium" style={{ minWidth: '110px' }}>Vay NH (tr.)</th>
                <th className="px-3 py-2 text-white text-left font-medium" style={{ minWidth: '90px' }}>Ngân hàng</th>
                <th className="px-3 py-2 text-white text-left font-medium" style={{ minWidth: '200px' }}>Ghi chú</th>
                <th className="px-3 py-2 text-white text-center font-medium" style={{ minWidth: '60px' }}>Xóa</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, i) => (
                <tr key={site.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50`}>
                  <td className="px-2 py-1.5 text-center text-gray-500">{i + 1}</td>
                  <EditableTextCell value={site.name} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'name', v)} />
                  <EditableTextCell value={site.location} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'location', v)} />
                  <EditableTextCell value={site.startMonth} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'startMonth', v)} align="center" />
                  <EditableTextCell value={site.totalInvestment} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'totalInvestment', v)} align="right" type="number" />
                  <td
                    className="px-2 py-1.5 text-right text-sm cursor-pointer hover:bg-yellow-50"
                    onClick={() => {
                      const newVal = prompt('Nhập tỷ lệ sở hữu (0-1):', site.linkradShare)
                      if (newVal !== null) updateCell(site.id, 'linkradShare', parseFloat(newVal) || 0)
                    }}
                  >
                    {((site.linkradShare || 0) * 100).toFixed(1)}%
                  </td>
                  <EditableTextCell value={site.linkradInvestment} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'linkradInvestment', v)} align="right" type="number" />
                  <EditableTextCell value={site.bankLoan} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'bankLoan', v)} align="right" type="number" />
                  <EditableTextCell value={site.bank} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'bank', v)} />
                  <EditableTextCell value={site.note} readOnly={!canEdit} onChange={(v) => updateCell(site.id, 'note', v)} />
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => {
                        if (window.confirm(`Xóa site "${site.name}"?`)) deleteSite(site.id)
                      }}
                      className="text-red-500 hover:text-red-700 text-base leading-none"
                      title="Xóa"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                <td colSpan={4} className="px-3 py-2 text-blue-800">Tổng cộng</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmt(totalInv)}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right text-blue-800">{fmt(totalLinkrad)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmt(totalBank)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
