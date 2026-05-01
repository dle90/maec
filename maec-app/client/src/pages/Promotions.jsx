import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')

function PromoModal({ promo, onClose, onSaved }) {
  const [form, setForm] = useState(promo || {
    name: '', code: '', description: '', type: 'percentage', discountValue: 0,
    maxDiscountAmount: 0, minOrderAmount: 0, startDate: '', endDate: '',
    maxUsageTotal: 0, maxUsagePerPatient: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Tên chương trình là bắt buộc')
    setSaving(true)
    try {
      if (promo?._id) {
        await api.put(`/promotions/${promo._id}`, form)
      } else {
        await api.post('/promotions', form)
      }
      onSaved()
    } catch (err) { setError(err.response?.data?.error || 'Lỗi') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">{promo?._id ? 'Sửa' : 'Thêm'} chương trình giảm giá</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="p-6 space-y-3">
          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên chương trình *</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mã</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.code || ''}
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Loại giảm</label>
              <select className="w-full border rounded px-2 py-1.5 text-sm" value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="percentage">Phần trăm (%)</option>
                <option value="fixed_amount">Số tiền cố định</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {form.type === 'percentage' ? 'Giảm (%)' : 'Giảm (VND)'}
              </label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.discountValue}
                onChange={e => setForm(p => ({ ...p, discountValue: +e.target.value }))} />
            </div>
            {form.type === 'percentage' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Giảm tối đa (VND)</label>
                <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.maxDiscountAmount}
                  onChange={e => setForm(p => ({ ...p, maxDiscountAmount: +e.target.value }))} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Đơn hàng tối thiểu</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.minOrderAmount}
                onChange={e => setForm(p => ({ ...p, minOrderAmount: +e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ngày bắt đầu</label>
              <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" value={form.startDate || ''}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ngày kết thúc</label>
              <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" value={form.endDate || ''}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tổng lượt SD tối đa</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.maxUsageTotal}
                onChange={e => setForm(p => ({ ...p, maxUsageTotal: +e.target.value }))} placeholder="0 = không giới hạn" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SD tối đa / BN</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.maxUsagePerPatient}
                onChange={e => setForm(p => ({ ...p, maxUsagePerPatient: +e.target.value }))} placeholder="0 = không giới hạn" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
              <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.description || ''}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GenerateCodesModal({ promo, onClose, onGenerated }) {
  const [count, setCount] = useState(5)
  const [prefix, setPrefix] = useState('')
  const [maxUsage, setMaxUsage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [generated, setGenerated] = useState([])

  const handleGenerate = async () => {
    setSaving(true)
    try {
      const res = await api.post(`/promotions/${promo._id}/codes/generate`, { count, prefix, maxUsage })
      setGenerated(res.data)
      onGenerated()
    } catch (err) { alert(err.response?.data?.error || 'Lỗi') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Tạo mã giảm giá - {promo.name}</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Số lượng</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={count}
                onChange={e => setCount(+e.target.value)} min={1} max={100} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tiền tố</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm" value={prefix}
                onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="VD: LR" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SD tối đa/mã</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={maxUsage}
                onChange={e => setMaxUsage(+e.target.value)} min={1} />
            </div>
          </div>
          {generated.length > 0 && (
            <div className="bg-green-50 rounded p-3">
              <div className="text-xs font-medium text-green-700 mb-2">Đã tạo {generated.length} mã:</div>
              <div className="grid grid-cols-2 gap-1">
                {generated.map(c => (
                  <div key={c._id} className="text-xs font-mono bg-white px-2 py-1 rounded border">{c.code}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Đóng</button>
          {generated.length === 0 && (
            <button onClick={handleGenerate} disabled={saving} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Đang tạo...' : 'Tạo mã'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CodesListModal({ promo, onClose }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/promotions/${promo._id}/codes`).then(r => { setCodes(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [promo._id])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Mã giảm giá - {promo.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="p-4">
          {loading ? <p className="text-gray-400 text-sm">Đang tải...</p> : codes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Chưa có mã nào</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-gray-600">
                <th className="text-left px-3 py-2">Mã</th>
                <th className="text-center px-3 py-2">Đã dùng</th>
                <th className="text-center px-3 py-2">Tối đa</th>
                <th className="text-center px-3 py-2">Trạng thái</th>
              </tr></thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c._id} className="border-t">
                    <td className="px-3 py-1.5 font-mono font-medium">{c.code}</td>
                    <td className="px-3 py-1.5 text-center">{c.usedCount}</td>
                    <td className="px-3 py-1.5 text-center">{c.maxUsage}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'used' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-500'}`}>
                        {c.status === 'active' ? 'Có thể dùng' : c.status === 'used' ? 'Đã dùng hết' : c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Promotions() {
  const { hasPerm } = useAuth()
  const canEdit = hasPerm('catalogs.manage')
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [generating, setGenerating] = useState(null)
  const [viewingCodes, setViewingCodes] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/promotions'); setPromos(r.data) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Chương trình giảm giá</h2>
        {canEdit && (
          <button onClick={() => setEditing({})} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Thêm chương trình
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Tên chương trình</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3 text-right">Giá trị</th>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3 text-center">Đã dùng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              : promos.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Chưa có chương trình</td></tr>
              : promos.map(p => (
                <tr key={p._id} className="border-t hover:bg-blue-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.code}</td>
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5">{p.type === 'percentage' ? 'Phần trăm' : 'Cố định'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                    {p.type === 'percentage' ? `${p.discountValue}%` : fmtMoney(p.discountValue)}
                    {p.type === 'percentage' && p.maxDiscountAmount > 0 && (
                      <span className="text-gray-400 text-xs ml-1">(max {fmtMoney(p.maxDiscountAmount)})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {p.startDate && p.endDate ? `${p.startDate} - ${p.endDate}` : p.startDate || p.endDate || 'Không giới hạn'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.currentUsage}{p.maxUsageTotal ? `/${p.maxUsageTotal}` : ''}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.status === 'active' ? 'Hoạt động' : p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => setViewingCodes(p)} className="text-blue-500 hover:text-blue-700 text-xs">Mã</button>
                    {canEdit && <button onClick={() => setGenerating(p)} className="text-green-500 hover:text-green-700 text-xs">Tạo mã</button>}
                    {canEdit && <button onClick={() => setEditing(p)} className="text-gray-500 hover:text-gray-700 text-xs">Sửa</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editing !== null && <PromoModal promo={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {generating && <GenerateCodesModal promo={generating} onClose={() => setGenerating(null)} onGenerated={load} />}
      {viewingCodes && <CodesListModal promo={viewingCodes} onClose={() => setViewingCodes(null)} />}
    </div>
  )
}
