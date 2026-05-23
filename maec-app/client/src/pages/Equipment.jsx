import React, { useEffect, useState, useMemo } from 'react'
import api from '../api'
import EquipmentAttachments from '../components/EquipmentAttachments'
import { useAuth } from '../context/AuthContext'

// Thiết bị page — list of physical hardware units (slit lamps, OCT, fundus
// cameras, exam chairs, VA chart screens, etc.). Source-of-truth for what's
// at each site, who supplied it, and the paperwork (contracts, quotes, manuals).
//
// Layout: filter bar + table left, detail drawer on the right when a row is
// picked. Edit happens inline on the drawer for admin/giamdoc; other roles
// see read-only. New devices are added via "+ Thiết bị mới" at the top.

const SITE_LABELS = { TK: 'Trung Kính', KG: 'Kim Giang', '': 'Chưa gán' }
const SITE_OPTIONS = [
  { value: '', label: '— Chưa gán —' },
  { value: 'KG', label: 'Kim Giang' },
  { value: 'TK', label: 'Trung Kính' },
]

const STATUS_LABELS = {
  active:        { label: 'Đang hoạt động',  cls: 'bg-green-100 text-green-700' },
  commissioning: { label: 'Đang lắp đặt',    cls: 'bg-blue-100  text-blue-700'  },
  repair:        { label: 'Đang sửa',        cls: 'bg-amber-100 text-amber-700' },
  retired:       { label: 'Ngưng sử dụng',   cls: 'bg-gray-200  text-gray-600'  },
}

const CATEGORY_LABELS = {
  'auto-ref':              'Auto-refractor',
  'auto-keratometer':      'Keratometer',
  'lensometer':            'Lensometer / chấm tâm',
  'slit-lamp':             'Sinh hiển vi',
  'slit-lamp-table':       'Bàn SHV',
  'oct':                   'OCT',
  'topographer':           'Bản đồ giác mạc',
  'fundus':                'Đáy mắt',
  'biometer':              'Sinh trắc nhãn cầu',
  'dry-eye':               'Phân tích bề mặt nhãn cầu',
  'va-chart':              'Bảng thị lực',
  'exam-table-chair-set':  'Bộ bàn-ghế khám',
  'exam-chair':            'Ghế khám',
  'other':                 'Khác',
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([v, m]) => ({ value: v, label: m.label }))
const CATEGORY_OPTIONS = [
  { value: '', label: '— Chọn nhóm —' },
  ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
]

const fmtVnd = (n) => {
  if (!n && n !== 0) return ''
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Editable text/number/select field used in the drawer. Compact 2-col layout.
function Field({ label, value, onChange, type = 'text', options = null, multiline = false, readOnly = false, suffix = '' }) {
  const cls = 'w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-600'
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">{label}</span>
      {options ? (
        <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={readOnly} className={cls}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} disabled={readOnly} rows={3} className={cls} />
      ) : (
        <div className="flex items-center gap-1">
          <input
            type={type} value={value ?? ''} disabled={readOnly}
            onChange={e => onChange(type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)}
            className={cls}
          />
          {suffix && <span className="text-xs text-gray-500 flex-shrink-0">{suffix}</span>}
        </div>
      )}
    </label>
  )
}

export default function EquipmentPage() {
  const { auth } = useAuth()
  const canEdit = auth?.role === 'admin' || auth?.role === 'giamdoc'

  const [items, setItems] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  // Filters
  const [siteFilter, setSiteFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')

  const load = async () => {
    try {
      const params = {}
      if (siteFilter) params.siteId = siteFilter
      if (categoryFilter) params.category = categoryFilter
      if (statusFilter) params.status = statusFilter
      if (q.trim()) params.q = q.trim()
      const r = await api.get('/equipment', { params })
      setItems(r.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Tải danh sách thiết bị thất bại')
      setItems([])
    }
  }

  useEffect(() => { load() }, [siteFilter, categoryFilter, statusFilter, q]) // eslint-disable-line

  const selected = useMemo(() => items?.find(x => x._id === selectedId) || null, [items, selectedId])

  useEffect(() => {
    if (creating) return
    setDraft(selected ? { ...selected } : null)
    setDirty(false)
    setError('')
  }, [selected, creating])

  // KPI tiles — count by status + total spend
  const stats = useMemo(() => {
    if (!items) return null
    const s = { total: items.length, active: 0, commissioning: 0, repair: 0, totalSpend: 0 }
    for (const it of items) {
      if (it.status in s) s[it.status]++
      s.totalSpend += it.totalPriceVnd || 0
    }
    return s
  }, [items])

  const update = (patch) => { setDraft(d => ({ ...d, ...patch })); setDirty(true) }

  const save = async () => {
    if (!draft) return
    setSaving(true); setError('')
    try {
      if (creating) {
        const r = await api.post('/equipment', draft)
        setCreating(false)
        await load()
        setSelectedId(r.data._id)
      } else {
        await api.put(`/equipment/${encodeURIComponent(draft._id)}`, draft)
        await load()
      }
      setDirty(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Lưu thất bại')
    }
    setSaving(false)
  }

  const remove = async () => {
    if (!draft || creating) return
    if (!confirm(`Xóa thiết bị "${draft.name}" (${draft._id})? Tài liệu đính kèm sẽ vẫn còn trên R2.`)) return
    setSaving(true); setError('')
    try {
      await api.delete(`/equipment/${encodeURIComponent(draft._id)}`)
      setSelectedId('')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Xóa thất bại')
    }
    setSaving(false)
  }

  const startCreate = () => {
    const nextCode = nextAvailableCode(items || [])
    setCreating(true)
    setSelectedId('')
    setDraft({
      _id: nextCode, code: nextCode, name: '', category: '', model: '', manufacturer: '',
      originCountry: '', siteId: 'KG', status: 'active', warrantyMonths: 12,
      unitPriceVnd: 0, vatAmountVnd: 0, totalPriceVnd: 0, serviceCodes: [],
    })
    setDirty(true)
  }

  const cancelCreate = () => {
    setCreating(false)
    setDraft(null)
    setDirty(false)
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Thiết bị</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý phần cứng tại 2 cơ sở · Hợp đồng / báo giá / HDSD đính kèm trực tiếp trên từng máy
          </p>
        </div>
        {canEdit && (
          <button onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-md">
            + Thiết bị mới
          </button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <StatCard label="Tổng" value={stats.total} />
          <StatCard label="Đang hoạt động" value={stats.active} accent="text-green-700" />
          <StatCard label="Đang lắp đặt"   value={stats.commissioning} accent="text-blue-700" />
          <StatCard label="Đang sửa"       value={stats.repair} accent="text-amber-700" />
          <StatCard label="Tổng chi (đã ký)" value={fmtVnd(stats.totalSpend)} small />
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 flex items-center gap-2 flex-wrap">
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã / tên / model / hãng…"
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 w-full sm:w-72 focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white">
          <option value="">Tất cả cơ sở</option>
          <option value="TK">Trung Kính</option>
          <option value="KG">Kim Giang</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white">
          <option value="">Tất cả nhóm</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white">
          <option value="">Mọi trạng thái</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4">
        {/* List table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-20">Mã</th>
                <th className="text-left px-3 py-2 font-medium">Tên / Model</th>
                <th className="text-left px-3 py-2 font-medium w-32">Nhóm</th>
                <th className="text-left px-3 py-2 font-medium w-24">Cơ sở</th>
                <th className="text-left px-3 py-2 font-medium w-32">Trạng thái</th>
                <th className="text-right px-3 py-2 font-medium w-32">Giá (VAT)</th>
              </tr>
            </thead>
            <tbody>
              {items === null ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 italic">Đang tải…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 italic">Không có thiết bị nào khớp.</td></tr>
              ) : items.map(it => {
                const st = STATUS_LABELS[it.status] || STATUS_LABELS.active
                return (
                  <tr key={it._id}
                    onClick={() => { setCreating(false); setSelectedId(it._id) }}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50 ${selectedId === it._id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs">{it.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{it.name}</div>
                      <div className="text-xs text-gray-500">
                        {it.manufacturer}{it.model ? ` · ${it.model}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{CATEGORY_LABELS[it.category] || it.category || '—'}</td>
                    <td className="px-3 py-2 text-xs">{SITE_LABELS[it.siteId] ?? it.siteId}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtVnd(it.totalPriceVnd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Drawer */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 self-start">
          {!draft ? (
            <div className="text-sm text-gray-400 italic text-center py-12">
              Chọn một thiết bị để xem chi tiết
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div>
                  <div className="font-mono text-xs text-gray-500">
                    {creating ? 'Thiết bị mới' : draft._id}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800">{draft.name || '(chưa đặt tên)'}</h2>
                </div>
                {canEdit && (creating ? (
                  <button onClick={cancelCreate} className="text-xs text-gray-500 hover:text-gray-700">Huỷ</button>
                ) : (
                  <button onClick={remove} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50" disabled={saving}>
                    Xoá thiết bị
                  </button>
                ))}
              </div>

              {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="Mã thiết bị" value={draft.code}
                  onChange={v => update({ code: v, _id: creating ? v : draft._id })}
                  readOnly={!canEdit || !creating} />
                <Field label="Cơ sở" value={draft.siteId} options={SITE_OPTIONS}
                  onChange={v => update({ siteId: v })} readOnly={!canEdit} />

                <div className="col-span-2">
                  <Field label="Tên (VN)" value={draft.name} onChange={v => update({ name: v })} readOnly={!canEdit} />
                </div>
                <div className="col-span-2">
                  <Field label="Tên (EN)" value={draft.nameEn} onChange={v => update({ nameEn: v })} readOnly={!canEdit} />
                </div>

                <Field label="Nhóm" value={draft.category} options={CATEGORY_OPTIONS}
                  onChange={v => update({ category: v })} readOnly={!canEdit} />
                <Field label="Trạng thái" value={draft.status} options={STATUS_OPTIONS}
                  onChange={v => update({ status: v })} readOnly={!canEdit} />

                <Field label="Model" value={draft.model} onChange={v => update({ model: v })} readOnly={!canEdit} />
                <Field label="Hãng sản xuất" value={draft.manufacturer}
                  onChange={v => update({ manufacturer: v })} readOnly={!canEdit} />

                <Field label="Xuất xứ" value={draft.originCountry}
                  onChange={v => update({ originCountry: v })} readOnly={!canEdit} />
                <Field label="Số serial" value={draft.serialNumber}
                  onChange={v => update({ serialNumber: v })} readOnly={!canEdit} />

                <div className="col-span-2">
                  <Field label="Vị trí trong cơ sở" value={draft.location}
                    onChange={v => update({ location: v })} readOnly={!canEdit} />
                </div>

                <Field label="Số lưu hành TBYT" value={draft.registrationNumber}
                  onChange={v => update({ registrationNumber: v })} readOnly={!canEdit} />
                <Field label="Bảo hành (tháng)" type="number" value={draft.warrantyMonths}
                  onChange={v => update({ warrantyMonths: v })} readOnly={!canEdit} suffix="tháng" />

                <Field label="Ngày bàn giao" type="date" value={(draft.commissionedAt || '').slice(0, 10)}
                  onChange={v => update({ commissionedAt: v })} readOnly={!canEdit} />
                <Field label="Lần bảo dưỡng kế tiếp" type="date" value={(draft.nextServiceDate || '').slice(0, 10)}
                  onChange={v => update({ nextServiceDate: v })} readOnly={!canEdit} />
              </div>

              <div className="border-t border-gray-200 pt-3 mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Mua sắm / Hợp đồng</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <Field label="Nhà cung cấp" value={draft.vendorCompany}
                      onChange={v => update({ vendorCompany: v })} readOnly={!canEdit} />
                  </div>
                  <Field label="MST nhà cung cấp" value={draft.vendorTaxCode}
                    onChange={v => update({ vendorTaxCode: v })} readOnly={!canEdit} />
                  <Field label="Số hợp đồng" value={draft.contractNumber}
                    onChange={v => update({ contractNumber: v })} readOnly={!canEdit} />
                  <Field label="Ngày HĐ" type="date" value={(draft.contractDate || '').slice(0, 10)}
                    onChange={v => update({ contractDate: v })} readOnly={!canEdit} />
                  <Field label="Bảo hành (ghi chú)" value={draft.warrantyNote}
                    onChange={v => update({ warrantyNote: v })} readOnly={!canEdit} />
                  <Field label="Đơn giá" type="number" value={draft.unitPriceVnd}
                    onChange={v => update({ unitPriceVnd: v })} readOnly={!canEdit} suffix="đ" />
                  <Field label="Thuế VAT" type="number" value={draft.vatAmountVnd}
                    onChange={v => update({ vatAmountVnd: v })} readOnly={!canEdit} suffix="đ" />
                  <Field label="Chiết khấu" type="number" value={draft.discountVnd}
                    onChange={v => update({ discountVnd: v })} readOnly={!canEdit} suffix="đ" />
                  <Field label="Thành tiền" type="number" value={draft.totalPriceVnd}
                    onChange={v => update({ totalPriceVnd: v })} readOnly={!canEdit} suffix="đ" />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Phụ kiện kèm theo" value={draft.accessoriesIncluded} multiline
                    onChange={v => update({ accessoriesIncluded: v })} readOnly={!canEdit} />
                  <Field label="Ghi chú" value={draft.notes} multiline
                    onChange={v => update({ notes: v })} readOnly={!canEdit} />
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={save} disabled={!dirty || saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-md">
                    {saving ? 'Đang lưu…' : creating ? 'Tạo thiết bị' : 'Lưu thay đổi'}
                  </button>
                  {dirty && !saving && <span className="text-xs text-amber-600">Có thay đổi chưa lưu</span>}
                </div>
              )}

              {!creating && draft._id && (
                <div className="border-t border-gray-200 pt-3">
                  <EquipmentAttachments equipmentId={draft._id} canEdit={canEdit} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent = 'text-gray-800', small = false }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className={`${small ? 'text-base' : 'text-2xl'} font-semibold mt-0.5 ${accent}`}>{value}</div>
    </div>
  )
}

// Suggest the next free TB-NNN code based on what's already in `items`.
function nextAvailableCode(items) {
  const nums = items
    .map(i => /^TB-(\d+)$/i.exec(i.code || ''))
    .filter(Boolean).map(m => +m[1])
  const max = nums.length ? Math.max(...nums) : 0
  return `TB-${String(max + 1).padStart(3, '0')}`
}
