import React, { useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

// Loại khám (Encounter.examType). Maps to the clinic's documented workflows.
// Add more here as new workflows get formalised (cataract pre-op, glaucoma, etc.).
const EXAM_TYPES = [
  '',
  'Khám mắt cơ bản',
  'Khám khúc xạ + thị giác hai mắt',
  'Khám kính tiếp xúc (mới)',
  'Tái khám kính tiếp xúc',
  'Khác',
]

const blank = {
  name: '', examType: '', modality: '', bodyPart: '',
  technique: '', clinicalInfo: '', findings: '', impression: '', recommendation: '',
  isShared: false,
}

export default function ReportTemplates() {
  const { auth } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState({ examType: '', q: '' })

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/templates', { params: filter.examType ? { examType: filter.examType } : {} })
      setTemplates(r.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter.examType])

  const save = async () => {
    if (!editing.name.trim()) { alert('Tên mẫu là bắt buộc'); return }
    try {
      if (editing._id) await api.put(`/templates/${editing._id}`, editing)
      else await api.post('/templates', editing)
      setEditing(null)
      load()
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.error || e.message)) }
  }

  const remove = async (t) => {
    if (!confirm(`Xóa mẫu "${t.name}"?`)) return
    await api.delete(`/templates/${t._id}`)
    load()
  }

  const filtered = templates.filter(t =>
    !filter.q || t.name.toLowerCase().includes(filter.q.toLowerCase()) || (t.bodyPart || '').toLowerCase().includes(filter.q.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Mẫu kết quả</h2>
          <p className="text-sm text-gray-500">Mẫu cá nhân + mẫu chia sẻ. Sử dụng từ trang Ca đọc — Của tôi để điền nhanh.</p>
        </div>
        <button onClick={() => setEditing({ ...blank })} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
          + Tạo mẫu mới
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select value={filter.examType} onChange={e => setFilter(f => ({ ...f, examType: e.target.value }))} className="border rounded px-2 py-1.5 text-sm">
          {EXAM_TYPES.map(m => <option key={m} value={m}>{m || 'Tất cả loại khám'}</option>)}
        </select>
        <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} placeholder="Tìm theo tên hoặc bộ phận..." className="border rounded px-2 py-1.5 text-sm flex-1 max-w-md" />
        <span className="ml-auto text-xs text-gray-500">{filtered.length} mẫu</span>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
            <tr>
              <th className="px-3 py-2">Tên mẫu</th>
              <th className="px-3 py-2">Loại khám</th>
              <th className="px-3 py-2">Mắt / Bộ phận</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Sở hữu</th>
              <th className="px-3 py-2 text-right">Sử dụng</th>
              <th className="px-3 py-2 text-center w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Chưa có mẫu nào. Bấm "Tạo mẫu mới" để bắt đầu.</td></tr>
            ) : filtered.map(t => (
              <tr key={t._id} className="border-t hover:bg-blue-50/30">
                <td className="px-3 py-2 font-medium text-gray-800">{t.name}</td>
                <td className="px-3 py-2 text-xs text-gray-700">{t.examType || '-'}</td>
                <td className="px-3 py-2 text-gray-600">{t.bodyPart || '-'}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${t.isShared ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.isShared ? 'Chia sẻ' : 'Cá nhân'}</span></td>
                <td className="px-3 py-2 text-xs text-gray-500">{t.ownerId || '(global)'}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700">{t.useCount || 0}</td>
                <td className="px-3 py-2 text-center space-x-1">
                  <button onClick={() => setEditing(t)} className="text-blue-500 hover:text-blue-700 text-xs">Sửa</button>
                  {(t.ownerId === auth?.username || auth?.role === 'admin') && (
                    <button onClick={() => remove(t)} className="text-red-500 hover:text-red-700 text-xs">Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold">{editing._id ? 'Sửa mẫu' : 'Tạo mẫu mới'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tên mẫu *</label>
                  <input value={editing.name} onChange={e => setEditing(t => ({ ...t, name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="Ví dụ: Khám mắt cơ bản — bình thường, người lớn" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Loại khám</label>
                  <select value={editing.examType} onChange={e => setEditing(t => ({ ...t, examType: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                    {EXAM_TYPES.map(m => <option key={m} value={m}>{m || '(bất kỳ)'}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mắt / Bộ phận (OD / OS / OU hoặc khác)</label>
                <input value={editing.bodyPart} onChange={e => setEditing(t => ({ ...t, bodyPart: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="Ví dụ: OD, OS, OU, hoặc để trống" />
              </div>
              {['technique', 'clinicalInfo', 'findings', 'impression', 'recommendation'].map(k => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {k === 'technique' ? 'Kỹ thuật' :
                     k === 'clinicalInfo' ? 'Thông tin lâm sàng' :
                     k === 'findings' ? 'Mô tả hình ảnh (Findings)' :
                     k === 'impression' ? 'Kết luận (Impression)' : 'Đề nghị (Recommendation)'}
                  </label>
                  <textarea rows={k === 'findings' ? 5 : 3} value={editing[k]}
                    onChange={e => setEditing(t => ({ ...t, [k]: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm resize-y" />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={editing.isShared} onChange={e => setEditing(t => ({ ...t, isShared: e.target.checked }))} />
                Chia sẻ với tất cả bác sĩ (mẫu chung)
              </label>
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">{editing._id ? 'Cập nhật' : 'Tạo'}</button>
              <button onClick={() => setEditing(null)} className="ml-auto text-sm text-gray-500 hover:text-gray-700 px-4">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
