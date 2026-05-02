import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import { EmployeeSection, DepartmentSection, PermissionMatrix } from './HRManagement'
import ReportTemplates from './ReportTemplates'
import { CATALOG_TO_GROUP, DEFAULT_CATALOG_KEY } from '../config/catalogGroups'

const LAST_CATALOG_KEY = 'maec_last_catalog'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')

// Group structure (CATALOG_GROUPS) is imported from the shared config so the
// main sidebar's collapsible Danh mục tree and this page agree on layout.
// Navigation moved to the sidebar tree on 2026-04-23 — the in-page GroupPills
// + SubcatalogTabs + Tổng quan landing were removed in that pass.

// ── Field definitions per catalog ────────────────────────
const CATALOG_FIELDS = {
  'customer-sources': {
    columns: ['code', 'name', 'requiresReferralPartner', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên nguồn', requiresReferralPartner: 'Cần đối tác giới thiệu?', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã' },
      { key: 'name', label: 'Tên nguồn', required: true },
      { key: 'requiresReferralPartner', label: 'Cần đối tác giới thiệu?', type: 'boolean' },
    ],
    formatCell: { requiresReferralPartner: v => v ? 'Có' : 'Không' },
  },
  'referral-doctors': {
    columns: ['code', 'name', 'phone', 'email', 'idCard', 'address', 'gender', 'dob', 'specialty', 'workplace', 'area', 'paymentMethod', 'bankAccount', 'bankName', 'assignedStaff', 'firstReferralDate', 'contractDate', 'notes'],
    columnLabels: { code: 'Mã', name: 'Tên', phone: 'Số điện thoại', email: 'Email', idCard: 'Số CCCD', address: 'Địa chỉ', gender: 'Giới tính', dob: 'Ngày sinh', specialty: 'Chuyên khoa', workplace: 'Nơi làm việc', area: 'Địa bàn', paymentMethod: 'Hình thức thanh toán', bankAccount: 'STK', bankName: 'Ngân hàng', assignedStaff: 'Nhân viên theo dõi', firstReferralDate: 'Ngày gửi đầu tiên', contractDate: 'Ngày hợp đồng', notes: 'Ghi chú' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên', required: true },
      { key: 'phone', label: 'Số điện thoại' }, { key: 'email', label: 'Email' },
      { key: 'idCard', label: 'Số CCCD' }, { key: 'address', label: 'Địa chỉ', wide: true },
      { key: 'gender', label: 'Giới tính', type: 'select', options: [{ value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' }] },
      { key: 'dob', label: 'Ngày sinh', type: 'date' },
      { key: 'specialty', label: 'Chuyên khoa' }, { key: 'workplace', label: 'Nơi làm việc' },
      { key: 'area', label: 'Địa bàn' },
      { key: 'paymentMethod', label: 'Hình thức thanh toán', type: 'select', options: [{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'Chuyển khoản' }, { value: 'both', label: 'Cả hai' }] },
      { key: 'bankAccount', label: 'STK' }, { key: 'bankName', label: 'Ngân hàng' },
      { key: 'assignedStaff', label: 'Nhân viên KD theo dõi', type: 'userSelect', userRole: 'sale' },
      { key: 'firstReferralDate', label: 'Ngày gửi đầu tiên', type: 'date' },
      { key: 'contractDate', label: 'Ngày hợp đồng', type: 'date' },
      { key: 'notes', label: 'Ghi chú', wide: true },
    ],
    formatCell: { gender: v => v === 'M' ? 'Nam' : v === 'F' ? 'Nữ' : v || '', paymentMethod: v => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', both: 'Cả hai' }[v] || v || '') },
  },
  'partner-facilities': {
    columns: ['code', 'name', 'phone', 'address', 'specialty', 'clinicHeadName', 'contactPerson', 'area', 'paymentMethod', 'bankAccount', 'bankName', 'firstReferralDate', 'contractDate', 'assignedStaff', 'notes'],
    columnLabels: { code: 'Mã', name: 'Tên', phone: 'Số điện thoại', address: 'Địa chỉ', specialty: 'Chuyên khoa', clinicHeadName: 'Tên trưởng phòng khám', contactPerson: 'Tên người liên hệ', area: 'Địa bàn', paymentMethod: 'Hình thức thanh toán', bankAccount: 'STK', bankName: 'Ngân hàng', firstReferralDate: 'Ngày gửi đầu tiên', contractDate: 'Ngày hợp đồng', assignedStaff: 'Người theo dõi', notes: 'Ghi chú' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên', required: true },
      { key: 'phone', label: 'Số điện thoại' }, { key: 'email', label: 'Email' },
      { key: 'address', label: 'Địa chỉ', wide: true },
      { key: 'specialty', label: 'Chuyên khoa' }, { key: 'clinicHeadName', label: 'Tên trưởng phòng khám' },
      { key: 'contactPerson', label: 'Tên người liên hệ' }, { key: 'area', label: 'Địa bàn' },
      { key: 'paymentMethod', label: 'Hình thức thanh toán', type: 'select', options: [{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'Chuyển khoản' }, { value: 'both', label: 'Cả hai' }] },
      { key: 'bankAccount', label: 'STK' }, { key: 'bankName', label: 'Ngân hàng' },
      { key: 'firstReferralDate', label: 'Ngày gửi đầu tiên', type: 'date' },
      { key: 'contractDate', label: 'Ngày hợp đồng', type: 'date' },
      { key: 'assignedStaff', label: 'Nhân viên KD theo dõi', type: 'userSelect', userRole: 'sale' },
      { key: 'type', label: 'Loại cơ sở', type: 'select', options: [{ value: 'hospital', label: 'Bệnh viện' }, { value: 'clinic', label: 'Phòng khám' }, { value: 'lab', label: 'Xét nghiệm' }, { value: 'other', label: 'Khác' }] },
      { key: 'notes', label: 'Ghi chú', wide: true },
    ],
    formatCell: { paymentMethod: v => ({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', both: 'Cả hai' }[v] || v || '') },
  },
  'commission-groups': {
    columns: ['code', 'name', 'description', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên nhóm', description: 'Mô tả', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên nhóm', required: true },
      { key: 'description', label: 'Mô tả', wide: true },
    ],
  },
  'commission-rules': {
    columns: ['commissionGroupName', 'serviceName', 'type', 'value', 'status'],
    columnLabels: { commissionGroupName: 'Nhóm HH', serviceName: 'Dịch vụ', type: 'Loại', value: 'Giá trị', status: 'TT' },
    editFields: [
      { key: 'commissionGroupId', label: 'Nhóm HH', required: true }, { key: 'commissionGroupName', label: 'Tên nhóm HH' },
      { key: 'serviceName', label: 'Dịch vụ' }, { key: 'serviceId', label: 'Mã DV' },
      { key: 'type', label: 'Loại', type: 'select', options: [{ value: 'percentage', label: 'Phần trăm (%)' }, { value: 'fixed', label: 'Số tiền cố định' }] },
      { key: 'value', label: 'Giá trị', type: 'number' },
    ],
    formatCell: { type: v => v === 'percentage' ? '%' : 'VND', value: (v, row) => row.type === 'percentage' ? `${v}%` : fmtMoney(v) },
  },
  'specialties': {
    columns: ['code', 'name', 'description', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên chuyên khoa', description: 'Mô tả', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên chuyên khoa', required: true },
      { key: 'description', label: 'Mô tả', wide: true },
    ],
  },
  'services': {
    columns: ['code', 'name', 'category', 'basePrice', 'inPackagePrice'],
    columnLabels: { code: 'Mã', name: 'Tên', category: 'Nhóm', basePrice: 'Giá lẻ', inPackagePrice: 'Giá trong gói' },
    editFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên', required: true, wide: true },
      { key: 'category', label: 'Nhóm', type: 'select', options: [
        { value: 'khucxa',   label: 'Khúc xạ / thị lực' },
        { value: 'iop-shv',  label: 'Nhãn áp & SHV' },
        { value: 'imaging',  label: 'Chẩn đoán hình ảnh + sinh trắc' },
        { value: 'cl',       label: 'Kính tiếp xúc + kiểm soát cận thị' },
        { value: 'thuthuat', label: 'Thủ thuật' },
      ] },
      { key: 'basePrice', label: 'Giá lẻ (à la carte)', type: 'number' },
      { key: 'inPackagePrice', label: 'Giá trong gói (discount, để trống = dùng giá lẻ)', type: 'number' },
      { key: 'unit', label: 'Đơn vị' },
      { key: 'description', label: 'Mô tả', wide: true },
    ],
    formatCell: {
      basePrice: v => fmtMoney(v),
      inPackagePrice: v => v == null ? '—' : fmtMoney(v),
      category: v => ({
        'khucxa': 'Khúc xạ / thị lực',
        'iop-shv': 'Nhãn áp & SHV',
        'imaging': 'CĐHA + sinh trắc',
        'cl': 'KTX + kiểm soát CT',
        'thuthuat': 'Thủ thuật',
      }[v] || v || ''),
    },
    rightAlign: ['basePrice', 'inPackagePrice'],
  },
  'thuoc': {
    columns: ['code', 'name', 'category', 'brand', 'spec', 'importPrice', 'sellPrice'],
    columnLabels: { code: 'Mã', name: 'Tên', category: 'Loại', brand: 'Brand', spec: 'Quy cách', importPrice: 'Giá nhập', sellPrice: 'Giá bán' },
    editFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên', required: true, wide: true },
      { key: 'category', label: 'Loại', type: 'select', options: [
        { value: 'drops',     label: 'Nhỏ mắt' },
        { value: 'oral',      label: 'Uống / TPCN' },
        { value: 'accessory', label: 'Phụ kiện y tế' },
      ] },
      { key: 'brand', label: 'Brand' },
      { key: 'spec', label: 'Quy cách (vd: 5ml chai)' },
      { key: 'importPrice', label: 'Giá nhập (VND)', type: 'number' },
      { key: 'sellPrice', label: 'Giá bán (VND)', type: 'number' },
      { key: 'needsRx', label: 'Cần kê đơn (Rx)?', type: 'boolean' },
      { key: 'description', label: 'Mô tả', wide: true },
    ],
    formatCell: {
      importPrice: v => v == null ? '—' : Number(v).toLocaleString('vi-VN'),
      sellPrice: v => v == null ? '—' : Number(v).toLocaleString('vi-VN'),
      category: v => ({ drops: 'Nhỏ mắt', oral: 'Uống/TPCN', accessory: 'Phụ kiện' }[v] || v || ''),
    },
    rightAlign: ['importPrice', 'sellPrice'],
  },
  'kinh': {
    columns: ['code', 'name', 'category', 'brand', 'spec', 'importPrice', 'sellPrice'],
    columnLabels: { code: 'Mã', name: 'Tên', category: 'Loại', brand: 'Brand', spec: 'Quy cách', importPrice: 'Giá nhập', sellPrice: 'Giá bán' },
    editFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên', required: true, wide: true },
      { key: 'category', label: 'Loại', type: 'select', options: [
        { value: 'gong',     label: 'Gọng kính' },
        { value: 'trong',    label: 'Tròng kính' },
        { value: 'ktx',      label: 'Kính tiếp xúc' },
        { value: 'phu-kien', label: 'Phụ kiện (CL care, dụng cụ)' },
      ] },
      { key: 'brand', label: 'Brand' },
      { key: 'spec', label: 'Quy cách / dung tích / size' },
      { key: 'importPrice', label: 'Giá nhập (VND)', type: 'number' },
      { key: 'sellPrice', label: 'Giá bán (VND)', type: 'number' },
      { key: 'description', label: 'Mô tả', wide: true },
    ],
    formatCell: {
      importPrice: v => v == null ? '—' : Number(v).toLocaleString('vi-VN'),
      sellPrice: v => v == null ? '—' : Number(v).toLocaleString('vi-VN'),
      category: v => ({ gong: 'Gọng', trong: 'Tròng', ktx: 'KTX', 'phu-kien': 'Phụ kiện' }[v] || v || ''),
    },
    rightAlign: ['importPrice', 'sellPrice'],
  },
  'packages': {
    columns: ['code', 'name', 'bundledCount', 'priceDisplay', 'entitlementDisplay'],
    columnLabels: { code: 'Mã', name: 'Tên gói', bundledCount: 'Số DV gộp', priceDisplay: 'Giá', entitlementDisplay: 'Entitlement' },
    editFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên gói', required: true, wide: true },
      { key: 'description', label: 'Mô tả', wide: true },
      { key: 'basePrice', label: 'Đơn giá (cho gói flat-price)', type: 'number' },
    ],
    formatCell: {
      bundledCount: (_, row) => (row.bundledServices || []).length,
      priceDisplay: (_, row) => {
        if (row.pricingTiers?.length) {
          return row.pricingTiers.map(t => `${t.name}: ${fmtMoney(t.totalPrice)}`).join(' · ')
        }
        if (row.pricingRules?.length) {
          return row.pricingRules.map(r => `${r.condition}: ${fmtMoney(r.price)}`).join(' · ')
        }
        return fmtMoney(row.basePrice)
      },
      entitlementDisplay: (_, row) => {
        const e = row.activatesEntitlement
        if (!e || !e.durationMonths) return '—'
        const n = (e.coveredServices || []).length
        return `${e.durationMonths}th · ${n} DV free`
      },
    },
    rightAlign: ['bundledCount'],
    note: 'Gói khám bundle nhiều dịch vụ. Sửa pricingTiers / activatesEntitlement / pricingRules qua seed script (UI editing chỉ hỗ trợ các trường flat).',
  },
  'service-types': {
    columns: ['code', 'name', 'abbreviation', 'taxGroupName'],
    columnLabels: { code: 'Mã', name: 'Tên', abbreviation: 'Tên viết tắt', taxGroupName: 'Nhóm thuế dịch vụ' },
    editFields: [
      { key: 'code', label: 'Mã', required: true }, { key: 'name', label: 'Tên', required: true },
      { key: 'abbreviation', label: 'Tên viết tắt' },
      { key: 'taxGroupId', label: 'Mã nhóm thuế' }, { key: 'taxGroupName', label: 'Nhóm thuế dịch vụ' },
      { key: 'description', label: 'Mô tả', wide: true }, { key: 'sortOrder', label: 'Thứ tự', type: 'number' },
    ],
    note: 'Lưu ý: Nếu không chọn "Nhóm thuế dịch vụ", khi xuất hóa đơn điện tử, các dịch vụ này sẽ là "không kê khai thuế".',
  },
  'tax-groups': {
    columns: ['code', 'name', 'description', 'vatType', 'rate'],
    columnLabels: { code: 'Mã', name: 'Tên', description: 'Mô tả', vatType: 'Loại thuế VAT', rate: '% VAT' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên', required: true },
      { key: 'description', label: 'Mô tả', wide: true },
      { key: 'vatType', label: 'Loại thuế VAT', type: 'select', options: [{ value: 'percentage', label: 'Theo %' }, { value: 'exempt', label: 'Không chịu thuế' }] },
      { key: 'rate', label: '% VAT', type: 'number' },
    ],
    formatCell: { vatType: v => v === 'exempt' ? 'Không chịu thuế' : v === 'percentage' ? 'Theo %' : v || '' },
    rightAlign: ['rate'],
  },
  'supplies': {
    columns: ['code', 'name', 'unit', 'packagingSpec', 'minimumStock', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên vật tư', unit: 'Đơn vị', packagingSpec: 'Quy cách', minimumStock: 'Định mức', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã', required: true }, { key: 'name', label: 'Tên vật tư', required: true },
      { key: 'unit', label: 'Đơn vị' }, { key: 'packagingSpec', label: 'Quy cách đóng gói' },
      { key: 'categoryId', label: 'Mã nhóm VT' }, { key: 'supplierId', label: 'Mã nhà cung cấp' },
      { key: 'minimumStock', label: 'Định mức tối thiểu', type: 'number' },
      { key: 'conversionRate', label: 'Tỷ lệ quy đổi', type: 'number' },
    ],
    rightAlign: ['minimumStock'],
  },
  'supply-categories': {
    columns: ['code', 'name', 'parentId', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên nhóm', parentId: 'Nhóm cha', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên nhóm', required: true },
      { key: 'parentId', label: 'Mã nhóm cha' },
    ],
  },
  'suppliers': {
    columns: ['code', 'name', 'contactPerson', 'phone', 'email', 'taxCode', 'status'],
    columnLabels: { code: 'Mã', name: 'Tên nhà cung cấp', contactPerson: 'Người liên hệ', phone: 'SĐT', email: 'Email', taxCode: 'MST', status: 'TT' },
    editFields: [
      { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên nhà cung cấp', required: true },
      { key: 'contactPerson', label: 'Người liên hệ' }, { key: 'phone', label: 'Số điện thoại' },
      { key: 'email', label: 'Email' }, { key: 'taxCode', label: 'MST' },
      { key: 'address', label: 'Địa chỉ', wide: true },
    ],
  },
  'supply-service-mapping': {
    columns: ['serviceCode', 'serviceName', 'supplyCode', 'supplyName', 'quantity', 'unit'],
    columnLabels: { serviceCode: 'Mã DV', serviceName: 'Dịch vụ', supplyCode: 'Mã VT', supplyName: 'Vật tư', quantity: 'SL', unit: 'ĐV' },
    editFields: [
      { key: 'serviceId', label: 'Mã dịch vụ (_id)' }, { key: 'serviceCode', label: 'Mã DV' },
      { key: 'serviceName', label: 'Tên dịch vụ', required: true },
      { key: 'supplyId', label: 'Mã vật tư (_id)' }, { key: 'supplyCode', label: 'Mã VT' },
      { key: 'supplyName', label: 'Tên vật tư', required: true },
      { key: 'quantity', label: 'Số lượng định mức', type: 'number' },
      { key: 'unit', label: 'Đơn vị' },
    ],
    rightAlign: ['quantity'],
  },
}

// ── Row Drawer (edit form + history + usage) ─────────────
// Replaces the old modal — right-docked so admin can keep the table visible
// for cross-reference while editing. Three tabs: Thông tin (edit form) ·
// Lịch sử (audit log for this row) · Điểm sử dụng (stub until Pass B2).
function RowDrawer({ catalogKey, catalogLabel, fields, record, onClose, onSave, canEdit }) {
  const isNew = !record?._id
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState(record || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Async-loaded option lists keyed by role for userSelect fields
  const [userOptions, setUserOptions] = useState({})
  const userRoles = [...new Set(fields.filter(f => f.type === 'userSelect').map(f => f.userRole || 'nhanvien'))]
  useEffect(() => {
    let cancelled = false
    Promise.all(userRoles.map(role =>
      api.get('/catalogs/users', { params: { role } }).then(r => [role, r.data || []]).catch(() => [role, []])
    )).then(pairs => { if (!cancelled) setUserOptions(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRoles.join(',')])

  const handleSave = async () => {
    for (const f of fields) { if (f.required && !form[f.key]?.toString().trim()) return setError(`${f.label} là bắt buộc`) }
    setSaving(true); setError('')
    try { await onSave(form) } catch (err) { setError(err.response?.data?.error || 'Lỗi'); setSaving(false) }
  }

  const title = isNew ? 'Thêm mới' : (record.name || record.displayName || record.code || record._id)
  const subtitle = isNew ? catalogLabel : (record.code || record._id)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900 truncate max-w-[260px]">{title}</div>
            <div className="text-xs text-gray-400 font-mono mt-0.5">{subtitle}</div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {/* Tabs — only show history + usage for existing rows */}
        {!isNew && (
          <div className="px-5 pt-3 border-b border-gray-100 flex gap-5 text-sm">
            <TabLink active={tab === 'info'} onClick={() => setTab('info')}>Thông tin</TabLink>
            <TabLink active={tab === 'history'} onClick={() => setTab('history')}>Lịch sử</TabLink>
            <TabLink active={tab === 'usage'} onClick={() => setTab('usage')}>Điểm sử dụng</TabLink>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'info' && (
            <>
              <div className="p-5 space-y-3">
                {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">{error}</div>}
                <div className="grid grid-cols-2 gap-3">
                  {fields.map(f => (
                    <div key={f.key} className={f.wide ? 'col-span-2' : ''}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}{f.required ? <span className="text-rose-500"> *</span> : null}</label>
                      <FormField f={f} form={form} setForm={setForm} userOptions={userOptions} disabled={!canEdit} />
                    </div>
                  ))}
                </div>
              </div>
              {!isNew && catalogKey === 'packages' && <PackageBundleDetails pkg={record} />}
            </>
          )}
          {tab === 'history' && !isNew && (
            <HistoryTab catalogKey={catalogKey} resourceId={record._id} />
          )}
          {tab === 'usage' && !isNew && (
            <UsageTab catalogKey={catalogKey} record={record} />
          )}
        </div>

        {/* Footer — save only on info tab */}
        {tab === 'info' && canEdit && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TabLink({ active, children, onClick }) {
  return (
    <button onClick={onClick}
      className={`pb-2 -mb-px border-b-2 text-sm transition-colors ${active ? 'border-gray-900 text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {children}
    </button>
  )
}

function FormField({ f, form, setForm, userOptions, disabled }) {
  const inputCls = `w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:bg-gray-50`
  const set = (v) => setForm(p => ({ ...p, [f.key]: v }))
  if (f.type === 'select') return (
    <select className={inputCls} value={form[f.key] || ''} onChange={e => set(e.target.value)} disabled={disabled}>
      <option value="">-- Chọn --</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
  if (f.type === 'boolean') return (
    <select className={inputCls}
      value={form[f.key] === true ? '1' : form[f.key] === false ? '0' : ''}
      onChange={e => set(e.target.value === '1')} disabled={disabled}>
      <option value="">-- Chọn --</option><option value="1">Có</option><option value="0">Không</option>
    </select>
  )
  if (f.type === 'userSelect') return (
    <select className={inputCls} value={form[f.key] || ''} onChange={e => set(e.target.value)} disabled={disabled}>
      <option value="">-- Chọn --</option>
      {(userOptions[f.userRole || 'nhanvien'] || []).map(u => (
        <option key={u._id} value={u._id}>{(u.displayName || u._id)}{u.department ? ` — ${u.department}` : ''}</option>
      ))}
    </select>
  )
  if (f.type === 'number') return <input type="number" className={inputCls} value={form[f.key] ?? 0} onChange={e => set(+e.target.value)} disabled={disabled} />
  if (f.type === 'date') return <input type="date" className={inputCls} value={form[f.key] || ''} onChange={e => set(e.target.value)} disabled={disabled} />
  return <input className={inputCls} value={form[f.key] || ''} onChange={e => set(e.target.value)} disabled={disabled} />
}

// Read-only bundle / tier / entitlement view for a Gói khám row.
// Resolves bundledServices codes against the live services catalog so users
// see actual service names + the per-package price. Editing the bundle
// itself is still seed-only — see note at the bottom of the panel.
function PackageBundleDetails({ pkg }) {
  const [services, setServices] = useState([])
  useEffect(() => {
    let cancelled = false
    api.get('/catalogs/services').then(r => { if (!cancelled) setServices(r.data || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const svcMap = Object.fromEntries(services.map(s => [s.code, s]))
  const bundled = pkg.bundledServices || []
  const tiers = pkg.pricingTiers || []
  const ent = pkg.activatesEntitlement
  return (
    <div className="border-t border-gray-100 px-5 py-4 space-y-5 bg-gray-50">
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dịch vụ trong gói ({bundled.length})</h3>
        {bundled.length === 0 ? (
          <div className="text-xs text-gray-400 italic">Chưa có dịch vụ nào</div>
        ) : (
          <ul className="space-y-1">
            {bundled.map(code => {
              const svc = svcMap[code]
              const ala = svc?.basePrice ?? 0
              const inPkg = svc?.inPackagePrice ?? ala
              const isDiscounted = svc?.inPackagePrice != null && svc.inPackagePrice !== ala
              return (
                <li key={code} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-gray-400">{code}</div>
                    <div className="text-gray-700 truncate">{svc?.name || <span className="italic text-gray-400">(không tìm thấy)</span>}</div>
                  </div>
                  {svc && (
                    <div className="font-mono text-[11px] text-gray-700 flex-shrink-0 text-right">
                      {fmtMoney(inPkg)}đ
                      {isDiscounted && <div className="text-[10px] text-gray-400 line-through">{fmtMoney(ala)}đ</div>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {tiers.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bậc giá ({tiers.length})</h3>
          <ul className="space-y-1">
            {tiers.map(t => (
              <li key={t.code} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-700">{t.name}</div>
                  <div className="font-mono text-[10px] text-gray-400 truncate">{t.code}{t.extraProductSku ? ` · ${t.extraProductSku}` : ''}</div>
                </div>
                <div className="font-mono text-gray-700 flex-shrink-0">{fmtMoney(t.totalPrice)}đ</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ent?.durationMonths > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quyền lợi kèm gói</h3>
          <div className="text-xs text-gray-600 mb-2">Thời hạn: <span className="font-semibold">{ent.durationMonths} tháng</span></div>
          {ent.coveredServices?.length > 0 && (
            <ul className="space-y-1">
              {ent.coveredServices.map(c => (
                <li key={c.serviceCode} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-gray-400">{c.serviceCode}</div>
                    <div className="text-gray-700 truncate">{svcMap[c.serviceCode]?.name || <span className="italic text-gray-400">(không tìm thấy)</span>}</div>
                  </div>
                  <div className="text-[11px] text-gray-500 flex-shrink-0">{c.maxUses == null ? 'Không giới hạn' : `Tối đa ${c.maxUses} lần`}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="text-[11px] text-gray-400 italic">
        Hiển thị chỉ đọc. Sửa bundle / tier / entitlement bằng cách chỉnh seed-maec-catalog.js và chạy lại seed.
      </div>
    </div>
  )
}

// Lịch sử tab — pulls audit entries for this catalog row. Requires audit.view
// permission on the server; non-privileged roles get a gentle notice.
function HistoryTab({ catalogKey, resourceId }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setEntries(null); setError('')
    api.get('/audit-log', { params: { resource: 'catalogs', resourceId, path: `/catalogs/${catalogKey}/`, limit: 50 } })
      .then(r => setEntries(r.data || []))
      .catch(e => setError(e.response?.status === 403 ? 'Bạn không có quyền xem nhật ký.' : 'Không tải được lịch sử.'))
  }, [catalogKey, resourceId])
  if (error) return <div className="p-5 text-sm text-gray-400">{error}</div>
  if (entries == null) return <div className="p-5 text-sm text-gray-400">Đang tải...</div>
  if (entries.length === 0) return <div className="p-5 text-sm text-gray-400">Chưa có thay đổi nào được ghi nhận.</div>
  const verb = (m) => m === 'POST' ? 'tạo' : m === 'PUT' ? 'sửa' : m === 'DELETE' ? 'xóa' : m
  return (
    <div className="p-5 space-y-3">
      {entries.map(e => (
        <div key={e._id} className="text-sm">
          <div className="text-gray-900">
            <b>{e.username || 'Hệ thống'}</b> {verb(e.method)} bản ghi
          </div>
          {e.payload && Object.keys(e.payload).length > 0 && (
            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {Object.entries(e.payload).filter(([k]) => !['_id', 'createdAt', 'updatedAt'].includes(k)).slice(0, 4).map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`).join(' · ')}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">{relTime(e.ts)}</div>
        </div>
      ))}
    </div>
  )
}

// Điểm sử dụng tab — Pass B2 stub. Shows a placeholder with intent, will be
// filled in when per-catalog reference-count endpoints land.
function UsageTab({ catalogKey, record }) {
  return (
    <div className="p-5">
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
        <div className="font-semibold text-gray-800 mb-1">Điểm sử dụng</div>
        <p className="text-gray-500">Tính năng này sẽ hiển thị các phiếu đăng ký, phiếu thu, và quy tắc hoa hồng đang tham chiếu đến <b className="text-gray-700">{record.name || record.displayName || record._id}</b>, giúp bạn quyết định có thể ngưng hoạt động an toàn hay không.</p>
        <p className="text-xs text-gray-400 mt-2">Đang phát triển — Pass B2.</p>
      </div>
    </div>
  )
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return iso.slice(0, 10)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} ngày trước`
  return iso.slice(0, 10)
}

// ── Generic Catalog Table ────────────────────────────────
const PAGE_SIZE = 50

function CatalogTable({ catalogKey, catalogLabel, canEdit }) {
  const config = CATALOG_FIELDS[catalogKey]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive
  const [sortBy, setSortBy] = useState('')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  // Reset pagination when the catalog or any filter changes so we don't end up
  // on page 3 of a catalog that only has 10 rows after a filter switch.
  useEffect(() => { setPage(1) }, [catalogKey, searchQ, statusFilter, sortBy, sortDir])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (searchQ) params.q = searchQ
      const r = await api.get(`/catalogs/${catalogKey}`, { params })
      setItems(r.data)
    } catch {}
    setLoading(false)
  }, [catalogKey, searchQ])

  useEffect(() => { load() }, [load])

  if (!config) return <div className="text-gray-400 text-sm p-4">Chưa cấu hình cho danh mục này</div>

  const handleSave = async (form) => {
    if (editing?._id) await api.put(`/catalogs/${catalogKey}/${editing._id}`, form)
    else await api.post(`/catalogs/${catalogKey}`, form)
    setEditing(null); load()
  }

  const handleToggle = async (item) => {
    const nextStatus = item.status === 'inactive' ? 'active' : 'inactive'
    try {
      await api.put(`/catalogs/${catalogKey}/${item._id}`, { ...item, status: nextStatus })
      load()
    } catch (err) { alert(err.response?.data?.error || 'Lỗi cập nhật trạng thái') }
  }

  const handleDelete = async (item) => {
    const label = item.name || item.code || item._id
    if (!confirm(`Xóa "${label}"? Hành động này không thể hoàn tác.`)) return
    try {
      await api.delete(`/catalogs/${catalogKey}/${item._id}`)
      load()
    } catch (err) { alert(err.response?.data?.error || 'Lỗi xóa') }
  }

  const activeCount = items.filter(i => i.status !== 'inactive').length
  const filtered = items.filter(it => {
    if (statusFilter === 'active' && it.status === 'inactive') return false
    if (statusFilter === 'inactive' && it.status !== 'inactive') return false
    return true
  })
  const sorted = sortBy ? [...filtered].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy]
    const cmp = (av ?? '') < (bv ?? '') ? -1 : (av ?? '') > (bv ?? '') ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }) : filtered
  const paged = sorted.slice(0, page * PAGE_SIZE)
  const hasMore = paged.length < sorted.length

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  return (
    <>
      {config.note && <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">⚠ {config.note}</div>}

      {/* Unified toolbar: search + status filter + counts + + Thêm */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          placeholder="Tìm kiếm..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã ngưng</option>
        </select>
        <div className="flex-1 text-xs text-gray-500">
          <b className="text-gray-700">{items.length}</b> mục
          {items.length > 0 && <span> · <b className="text-gray-700">{activeCount}</b> đang hoạt động</span>}
          {filtered.length !== items.length && <span> · <b className="text-gray-700">{filtered.length}</b> hiển thị</span>}
        </div>
        {canEdit && config.editFields && (
          <button onClick={() => setEditing({})} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">＋ Thêm mới</button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
              {config.columns.map(col => {
                const label = config.columnLabels[col] || col
                const sortable = !config.rightAlign?.includes(col) || col === 'basePrice' || col === 'rate'
                const isActive = sortBy === col
                return (
                  <th key={col} className={`px-4 py-3 ${config.rightAlign?.includes(col) ? 'text-right' : ''} ${sortable ? 'cursor-pointer hover:text-gray-700' : ''}`}
                    onClick={sortable ? () => toggleSort(col) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortable && <span className={`text-[10px] ${isActive ? 'text-blue-600' : 'text-gray-300'}`}>{isActive ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>}
                    </span>
                  </th>
                )
              })}
              {canEdit && config.editFields && <th className="px-4 py-3 w-32 text-center">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : paged.length === 0 ? (
              <tr><td colSpan={config.columns.length + 1} className="px-4 py-10 text-center text-gray-400">
                {items.length === 0
                  ? <div className="space-y-2">
                      <div>Chưa có dữ liệu.</div>
                      {canEdit && config.editFields && (
                        <button onClick={() => setEditing({})} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">＋ Thêm bản ghi đầu tiên</button>
                      )}
                    </div>
                  : 'Không khớp bộ lọc.'}
              </td></tr>
            )
            : paged.map((item, i) => (
              <tr key={item._id || i} className="border-t border-gray-100 hover:bg-blue-50/50">
                {config.columns.map(col => {
                  let val = item[col]
                  if (config.formatCell?.[col]) val = config.formatCell[col](val, item)
                  if (col === 'status') {
                    return <td key={col} className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${val === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{val === 'active' ? 'HĐ' : val === 'inactive' ? 'Ngưng' : val || '-'}</span></td>
                  }
                  if (col === 'code') return <td key={col} className="px-4 py-2.5 font-mono text-xs text-gray-500">{val || '-'}</td>
                  if (col === 'name' || col === 'serviceName' || col === 'commissionGroupName') return <td key={col} className="px-4 py-2.5 font-medium text-gray-900">{val || '-'}</td>
                  return <td key={col} className={`px-4 py-2.5 text-gray-600 ${config.rightAlign?.includes(col) ? 'text-right font-medium' : ''}`}>{val ?? '-'}</td>
                })}
                {canEdit && config.editFields && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <button onClick={() => setEditing(item)} className="text-blue-600 hover:text-blue-800">Sửa</button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => handleToggle(item)}
                        className={item.status === 'inactive' ? 'text-emerald-600 hover:text-emerald-800' : 'text-orange-600 hover:text-orange-800'}>
                        {item.status === 'inactive' ? 'Mở' : 'Khóa'}
                      </button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => handleDelete(item)} className="text-rose-600 hover:text-rose-800">Xóa</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between text-xs text-gray-500">
            <span>Hiển thị {paged.length} / {sorted.length} mục</span>
            <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Tải thêm ↓</button>
          </div>
        )}
      </div>
      {editing !== null && (
        <RowDrawer
          catalogKey={catalogKey}
          catalogLabel={catalogLabel}
          fields={config.editFields}
          record={editing}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

// Nhân sự moved to Danh mục → Hồ sơ & Tham chiếu → Nhân viên on 2026-04-23,
// now rendered by HR's EmployeeSection. The old UsersTable master-detail
// that lived here + ROLE_OPTIONS/EMP_TYPE_OPTIONS/GENDER_OPTIONS are removed.
// The /api/catalogs/users endpoint stays for userSelect picker lookups.

function PatientsTable() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [page, setPage] = useState(1)
  const [openPatient, setOpenPatient] = useState(null)
  useEffect(() => { setPage(1) }, [searchQ, genderFilter])
  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/catalogs/patients', { params: searchQ ? { q: searchQ } : {} }); setItems(r.data) } catch {}
    setLoading(false)
  }, [searchQ])
  useEffect(() => { load() }, [load])
  const filtered = items.filter(p => !genderFilter || p.gender === genderFilter)
  const paged = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = paged.length < filtered.length
  const cols = [
    { key: 'patientId', label: 'Mã', cls: 'font-mono text-xs text-blue-600' },
    { key: 'name', label: 'Tên', cls: 'font-medium text-gray-900' },
    { key: 'phone', label: 'SĐT' },
    { key: 'email', label: 'Email' },
    { key: 'dob', label: 'Ngày sinh' },
    { key: 'gender', label: 'Giới tính', fmt: v => v === 'M' ? 'Nam' : v === 'F' ? 'Nữ' : v || '-' },
    { key: 'idCard', label: 'CMND/CCCD' },
    { key: 'insuranceNumber', label: 'Mã BHYT' },
    { key: 'province', label: 'Tỉnh/Thành phố' },
    { key: 'district', label: 'Quận/huyện' },
    { key: 'ward', label: 'Phường/Xã' },
  ]
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          placeholder="Tìm bệnh nhân (tên, mã, SĐT)..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
        />
        <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
          <option value="">Tất cả giới tính</option><option value="M">Nam</option><option value="F">Nữ</option>
        </select>
        <div className="flex-1 text-xs text-gray-500">
          <b className="text-gray-700">{items.length}</b> bệnh nhân
          {filtered.length !== items.length && <span> · <b className="text-gray-700">{filtered.length}</b> hiển thị</span>}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
            {cols.map(c => <th key={c.key} className="px-4 py-3">{c.label}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : paged.length === 0 ? <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-gray-400">Chưa có bệnh nhân khớp bộ lọc.</td></tr>
            : paged.map(p => (
              <tr key={p._id} onClick={() => setOpenPatient(p)} className="border-t border-gray-100 hover:bg-blue-50/50 cursor-pointer">
                {cols.map(c => <td key={c.key} className={`px-4 py-2.5 text-gray-600 ${c.cls || ''}`}>{c.fmt ? c.fmt(p[c.key]) : (p[c.key] || '-')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between text-xs text-gray-500">
            <span>Hiển thị {paged.length} / {filtered.length} mục</span>
            <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Tải thêm ↓</button>
          </div>
        )}
      </div>
      {openPatient && <PatientDetailDrawer patient={openPatient} onClose={() => setOpenPatient(null)} />}
    </>
  )
}

// PatientDetailDrawer — opens from a patient row in /catalogs/patients.
// Shows the patient's identity card + full encounter history (lifetime).
// Each encounter row is a link to /kham?id=<encId> so the receptionist can
// jump straight into the visit.
function PatientDetailDrawer({ patient, onClose }) {
  const [encounters, setEncounters] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.get('/encounters', { params: { patientId: patient.patientId || patient._id } })
      .then(r => { if (!cancelled) setEncounters(r.data || []) })
      .catch(() => { if (!cancelled) setEncounters([]) })
    return () => { cancelled = true }
  }, [patient])

  const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
  const fmtDate = (iso) => iso ? iso.slice(0, 10) : '—'
  const fmtTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const statusBadge = (s) => {
    if (s === 'paid')      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Đã trả</span>
    if (s === 'cancelled') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Hủy</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Mở</span>
  }

  const addr = [patient.address, patient.street, patient.ward, patient.city].filter(Boolean).join(', ') || '—'
  const gender = patient.gender === 'M' ? 'Nam' : patient.gender === 'F' ? 'Nữ' : '—'

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900 truncate">{patient.name || '—'}</div>
            <div className="text-xs text-gray-500 font-mono mt-0.5">{patient.patientId || patient._id}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hồ sơ</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div><span className="text-gray-500">Giới tính:</span> {gender}</div>
              <div><span className="text-gray-500">Ngày sinh:</span> {fmtDate(patient.dob)}</div>
              <div><span className="text-gray-500">SĐT:</span> <span className="font-mono">{patient.phone || '—'}</span></div>
              <div><span className="text-gray-500">Email:</span> {patient.email || '—'}</div>
              <div><span className="text-gray-500">CCCD:</span> <span className="font-mono">{patient.idCard || '—'}</span></div>
              <div><span className="text-gray-500">BHYT:</span> <span className="font-mono">{patient.insuranceNumber || '—'}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Địa chỉ:</span> {addr}</div>
              {patient.clinicalInfo && <div className="col-span-2"><span className="text-gray-500">Lâm sàng:</span> {patient.clinicalInfo}</div>}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lịch sử khám {encounters && `(${encounters.length})`}</h3>
              <Link to={`/kham?patientId=${encodeURIComponent(patient.patientId || patient._id)}`} className="text-xs text-blue-600 hover:text-blue-800">Mở trong Khám →</Link>
            </div>
            {encounters === null ? (
              <div className="text-xs text-gray-400 italic">Đang tải...</div>
            ) : encounters.length === 0 ? (
              <div className="text-xs text-gray-400 italic px-2 py-3 bg-gray-50 rounded-lg">Bệnh nhân này chưa có lượt khám nào.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y">
                {encounters.map(e => (
                  <Link key={e._id} to={`/kham?id=${encodeURIComponent(e._id)}`}
                    className="block px-3 py-2.5 hover:bg-blue-50 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono w-20 flex-shrink-0">{fmtDate(e.createdAt)}</span>
                      <span className="text-xs text-gray-500 font-mono w-12 flex-shrink-0">{fmtTime(e.createdAt)}</span>
                      <span className="text-xs text-gray-500 w-24 flex-shrink-0 truncate">{e.site || '—'}</span>
                      <span className="flex-1 truncate text-gray-700">
                        {e.packageName || <span className="text-gray-400 italic">— chưa gán gói —</span>}
                        {e.assignedServices?.length > 0 && <span className="text-xs text-gray-500 ml-1">({e.assignedServices.length} DV)</span>}
                      </span>
                      <span className="font-mono text-blue-700 text-xs flex-shrink-0">{fmtMoney(e.billTotal)}đ</span>
                      <span className="flex-shrink-0">{statusBadge(e.status)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Promotions & Promo Codes (inline) ────────────────────
function PromotionsTable({ canEdit }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setLoading(true); try { const r = await api.get('/promotions'); setItems(r.data) } catch {}; setLoading(false) }, [])
  useEffect(() => { load() }, [load])
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
          <th className="px-4 py-3">Mã</th><th className="px-4 py-3">Tên chương trình</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3 text-right">Giá trị</th><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3 text-center">Đã dùng</th><th className="px-4 py-3">TT</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
          : items.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Chưa có chương trình khuyến mãi.</td></tr>
          : items.map(p => (
            <tr key={p._id} className="border-t border-gray-100 hover:bg-blue-50/50">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.code}</td>
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-2.5 text-gray-600">{p.type === 'percentage' ? '%' : 'VND'}</td>
              <td className="px-4 py-2.5 text-right font-medium text-blue-600">{p.type === 'percentage' ? `${p.discountValue}%` : fmtMoney(p.discountValue)}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{p.startDate || ''} - {p.endDate || ''}</td>
              <td className="px-4 py-2.5 text-center text-gray-600">{p.currentUsage}{p.maxUsageTotal ? `/${p.maxUsageTotal}` : ''}</td>
              <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{p.status === 'active' ? 'HĐ' : p.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PromoCodesTable() {
  const [promos, setPromos] = useState([])
  const [codes, setCodes] = useState([])
  const [selectedPromo, setSelectedPromo] = useState('')
  useEffect(() => { api.get('/promotions').then(r => setPromos(r.data)).catch(() => {}) }, [])
  useEffect(() => { if (selectedPromo) api.get(`/promotions/${selectedPromo}/codes`).then(r => setCodes(r.data)).catch(() => setCodes([])); else setCodes([]) }, [selectedPromo])
  return (
    <>
      <div className="mb-3">
        <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 bg-white" value={selectedPromo} onChange={e => setSelectedPromo(e.target.value)}>
          <option value="">-- Chọn chương trình để xem mã --</option>
          {promos.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>
      {selectedPromo && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
              <th className="px-4 py-3">Mã</th><th className="px-4 py-3">Chương trình</th><th className="px-4 py-3 text-center">Đã dùng</th><th className="px-4 py-3 text-center">Tối đa</th><th className="px-4 py-3">TT</th>
            </tr></thead>
            <tbody>
              {codes.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Chưa có mã</td></tr>
              : codes.map(c => (
                <tr key={c._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono font-medium text-gray-900">{c.code}</td>
                  <td className="px-4 py-2 text-gray-500">{c.promotionName}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{c.usedCount}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{c.maxUsage}</td>
                  <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{c.status === 'active' ? 'HĐ' : c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN CATALOGS PAGE
// ══════════════════════════════════════════════════════════

function PageHeader({ breadcrumb, userName }) {
  const date = new Date()
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b bg-white -mx-4 -mt-4 mb-4">
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold text-gray-800">Danh mục</div>
        <div className="text-xs text-gray-400 font-mono">/quản trị</div>
      </div>
      <div className="flex-1 text-xs text-gray-500">{breadcrumb}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {userName && <span className="px-2 py-1 bg-gray-100 rounded-md">👤 {userName}</span>}
        <span className="px-2 py-1 bg-gray-100 rounded-md">{dateStr}</span>
      </div>
    </div>
  )
}

export default function Catalogs() {
  const { hasPerm, auth } = useAuth()
  const { catalogKey } = useParams()
  const activeKey = catalogKey || ''

  // Remember the last catalog the user visited so opening /catalogs after that
  // lands them where they left off instead of re-picking the default.
  useEffect(() => {
    if (activeKey) try { localStorage.setItem(LAST_CATALOG_KEY, activeKey) } catch {}
  }, [activeKey])

  // /catalogs with no param — redirect to the last visited catalog, or the
  // first catalog of the first group on a fresh browser.
  if (!activeKey) {
    let remembered = null
    try { remembered = localStorage.getItem(LAST_CATALOG_KEY) } catch {}
    const destination = (remembered && CATALOG_TO_GROUP[remembered]) ? remembered : DEFAULT_CATALOG_KEY
    return <Navigate to={`/catalogs/${destination}`} replace />
  }

  const activeGroup = CATALOG_TO_GROUP[activeKey] || null
  const activeItem = activeGroup?.items.find(i => i.key === activeKey)
  const activeLabel = activeItem?.label || ''

  const PARTNER_KEYS = new Set(['referral-doctors', 'partner-facilities', 'commission-groups', 'commission-rules', 'customer-sources'])
  const INVENTORY_KEYS = new Set(['supplies', 'supply-categories', 'suppliers', 'supply-service-mapping'])
  const catalogEditPerm = PARTNER_KEYS.has(activeKey)
    ? 'partners.manage'
    : INVENTORY_KEYS.has(activeKey)
      ? 'inventory.manage'
      : 'catalogs.manage'

  const breadcrumb = activeGroup
    ? <>{activeGroup.label} · <b className="text-gray-700">{activeLabel}</b></>
    : 'Không tìm thấy'

  const renderContent = () => {
    if (activeKey === 'hr-employees')    return <EmployeeSection />
    if (activeKey === 'hr-departments')  return <DepartmentSection />
    if (activeKey === 'hr-permissions')  return <PermissionMatrix />
    if (activeKey === 'report-templates') return <ReportTemplates />
    if (activeKey === 'patients')        return <PatientsTable />
    if (activeKey === 'promotions')      return <PromotionsTable canEdit={hasPerm('catalogs.manage')} />
    if (activeKey === 'promo-codes')     return <PromoCodesTable />
    if (CATALOG_FIELDS[activeKey])       return <CatalogTable catalogKey={activeKey} catalogLabel={activeLabel} canEdit={hasPerm(catalogEditPerm)} />
    return <div className="text-gray-400 text-sm p-4">Danh mục không tồn tại.</div>
  }

  return (
    <div>
      <PageHeader breadcrumb={breadcrumb} userName={auth?.displayName || auth?.username} />
      {renderContent()}
    </div>
  )
}
