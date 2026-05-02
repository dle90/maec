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
        { value: 'ktx',      label: 'Kính tiếp xúc (mềm)' },
        { value: 'ortho-k',  label: 'Ortho-K' },
        { value: 'phu-kien', label: 'Phụ kiện (CL care, dụng cụ)' },
      ] },
      { key: 'kinhType', label: 'Loại Ortho-K (chỉ áp dụng cho category Ortho-K)', type: 'select', options: [
        { value: '',           label: '— không phân loại —' },
        { value: 'standard',   label: 'Standard' },
        { value: 'toric',      label: 'Toric' },
        { value: 'customized', label: 'Customized' },
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
      category: v => ({ gong: 'Gọng', trong: 'Tròng', ktx: 'KTX (mềm)', 'ortho-k': 'Ortho-K', 'phu-kien': 'Phụ kiện' }[v] || v || ''),
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

  // Wider modal for catalogs that have a builder section (currently packages)
  // since the bundle / tier / entitlement editor needs horizontal room.
  const isWideModal = catalogKey === 'packages'
  const modalCls = isWideModal ? 'max-w-5xl' : 'max-w-2xl'
  const formCols = isWideModal ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${modalCls} bg-white max-h-[92vh] flex flex-col shadow-2xl rounded-xl overflow-hidden`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-gray-900 truncate">{title}</div>
            <div className="text-xs text-gray-400 font-mono mt-0.5">{subtitle}</div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Tabs — only show history + usage for existing rows */}
        {!isNew && (
          <div className="px-5 pt-3 border-b border-gray-100 flex gap-5 text-sm flex-shrink-0">
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
                <div className={`grid ${formCols} gap-3`}>
                  {fields.map(f => (
                    <div key={f.key} className={f.wide ? (isWideModal ? 'col-span-2 lg:col-span-3' : 'col-span-2') : ''}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}{f.required ? <span className="text-rose-500"> *</span> : null}</label>
                      <FormField f={f} form={form} setForm={setForm} userOptions={userOptions} disabled={!canEdit} />
                    </div>
                  ))}
                </div>
              </div>
              {!isNew && catalogKey === 'packages' && <PackageBuilder pkg={record} canEdit={canEdit} />}
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
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
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

// Editable bundle / tier / entitlement view for a Gói khám row.
// Each service in the bundle has a price-mode toggle [Giá lẻ / Trong gói] that
// determines what it contributes to the package's suggested total. Tiers can
// optionally attach a Kính SKU (e.g. Ortho-K lens). Entitlement covers
// services + maxUses. "Lưu thay đổi" persists via PUT /catalogs/packages/:id.
function PackageBuilder({ pkg, canEdit }) {
  const [services, setServices] = useState([])
  const [kinhList, setKinhList] = useState([])
  const [bundled, setBundled] = useState(() => normalizeBundle(pkg))
  const [tiers, setTiers] = useState(() => (pkg.pricingTiers || []).map(t => ({ ...t })))
  const [entOpen, setEntOpen] = useState(!!pkg.activatesEntitlement?.durationMonths)
  const [entMonths, setEntMonths] = useState(pkg.activatesEntitlement?.durationMonths || 12)
  const [entCovered, setEntCovered] = useState(() => (pkg.activatesEntitlement?.coveredServices || []).map(c => ({ ...c })))
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    setBundled(normalizeBundle(pkg))
    setTiers((pkg.pricingTiers || []).map(t => ({ ...t })))
    setEntOpen(!!pkg.activatesEntitlement?.durationMonths)
    setEntMonths(pkg.activatesEntitlement?.durationMonths || 12)
    setEntCovered((pkg.activatesEntitlement?.coveredServices || []).map(c => ({ ...c })))
    setSavedAt(null)
    setErr('')
  }, [pkg._id])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/catalogs/services').catch(() => ({ data: [] })),
      api.get('/catalogs/kinh').catch(() => ({ data: [] })),
    ]).then(([sR, kR]) => {
      if (cancelled) return
      setServices(sR.data || [])
      setKinhList(kR.data || [])
    })
    return () => { cancelled = true }
  }, [])

  const svcMap = Object.fromEntries(services.map(s => [s.code, s]))
  const kinhMap = Object.fromEntries(kinhList.map(k => [k.code, k]))
  const availableServices = services.filter(s => !bundled.some(b => b.code === s.code))

  const priceFor = (entry) => {
    const svc = svcMap[entry.code]
    if (!svc) return 0
    if (entry.priceMode === 'base') return svc.basePrice || 0
    return svc.inPackagePrice ?? svc.basePrice ?? 0
  }
  const suggestedTotal = bundled.reduce((sum, b) => sum + priceFor(b), 0)

  const addService = (code) => {
    if (!code || bundled.some(b => b.code === code)) return
    setBundled([...bundled, { code, priceMode: 'inPackage' }])
    setPicking(false)
  }
  const removeService = (code) => setBundled(bundled.filter(b => b.code !== code))
  const flipMode = (code) => setBundled(bundled.map(b => b.code === code
    ? { ...b, priceMode: b.priceMode === 'base' ? 'inPackage' : 'base' }
    : b))

  const addTier = () => setTiers([...tiers, { code: `tier-${tiers.length + 1}`, name: '', totalPrice: 0, extraProductSku: '', extraServices: [] }])
  const updateTier = (i, patch) => setTiers(tiers.map((t, j) => j === i ? { ...t, ...patch } : t))
  const removeTier = (i) => setTiers(tiers.filter((_, j) => j !== i))

  const toggleEntCover = (code) => {
    if (entCovered.some(c => c.serviceCode === code)) {
      setEntCovered(entCovered.filter(c => c.serviceCode !== code))
    } else {
      setEntCovered([...entCovered, { serviceCode: code, maxUses: null }])
    }
  }
  const setEntMaxUses = (code, val) => setEntCovered(entCovered.map(c => c.serviceCode === code
    ? { ...c, maxUses: val === '' ? null : Math.max(0, +val) }
    : c))

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const body = {
        ...pkg,
        bundledServices: bundled.map(b => b.code),
        bundledServiceModes: bundled.map(b => ({ code: b.code, priceMode: b.priceMode })),
        pricingTiers: tiers,
        activatesEntitlement: entOpen
          ? { durationMonths: +entMonths || 12, coveredServices: entCovered }
          : undefined,
      }
      delete body._id
      await api.put(`/catalogs/packages/${pkg.code}`, body)
      setSavedAt(new Date())
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi lưu')
    }
    setSaving(false)
  }

  const dirty = JSON.stringify({ b: bundled, t: tiers, e: entOpen, em: entMonths, ec: entCovered })
    !== JSON.stringify({ b: normalizeBundle(pkg), t: pkg.pricingTiers || [], e: !!pkg.activatesEntitlement?.durationMonths, em: pkg.activatesEntitlement?.durationMonths || 12, ec: pkg.activatesEntitlement?.coveredServices || [] })

  // Split this package's pricing tiers into separate packages, one per tier.
  // Each new package: code = `${pkg.code}-${SUFFIX}` (uppercase first 3 chars
  // of tier.code), bundles the source services + tier.extraServices, attaches
  // tier.extraProductSku as bundledKinhSku. The source package is left active
  // so the user can verify before deactivating it manually.
  const splitTiers = async () => {
    if (!tiers.length) return
    const suffixOf = (code) => (code || 'TIER').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
    const newPkgs = tiers.map(t => {
      const suffix = suffixOf(t.code) || 'X'
      const newCode = `${pkg.code}-${suffix}`
      const allServiceCodes = [...new Set([
        ...bundled.map(b => b.code),
        ...(t.extraServices || []),
      ])]
      const modes = bundled.reduce((acc, b) => ({ ...acc, [b.code]: b.priceMode }), {})
      return {
        code: newCode,
        name: `${pkg.name}${t.name ? ` — ${t.name}` : ''}`,
        description: pkg.description || '',
        bundledServices: allServiceCodes,
        bundledServiceModes: allServiceCodes.map(code => ({
          code, priceMode: modes[code] || 'inPackage', customPrice: 0,
        })),
        bundledKinhSku: t.extraProductSku || '',
        basePrice: 0,
        pricingTiers: [],
        activatesEntitlement: pkg.activatesEntitlement,
        status: 'active',
      }
    })
    const labels = newPkgs.map(p => `  • ${p.code} — ${p.name}`).join('\n')
    if (!confirm(`Tạo ${newPkgs.length} gói mới từ các bậc giá hiện tại:\n\n${labels}\n\nGói gốc ${pkg.code} sẽ vẫn active — bạn tự đặt inactive sau khi kiểm tra.`)) return
    setSaving(true); setErr('')
    try {
      for (const p of newPkgs) {
        await api.post('/catalogs/packages', p)
      }
      alert(`Đã tạo ${newPkgs.length} gói. Mở "Bảng giá gói" để xem & chỉnh giá.`)
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi tách bậc — kiểm tra trùng mã')
    }
    setSaving(false)
  }

  return (
    <div className="border-t border-gray-100 px-5 py-4 space-y-5 bg-gray-50">
      {/* Bundle editor */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dịch vụ trong gói ({bundled.length})</h3>
          {canEdit && !picking && availableServices.length > 0 && (
            <button onClick={() => setPicking(true)} className="text-xs text-blue-600 hover:text-blue-800">+ Thêm dịch vụ</button>
          )}
        </div>
        {picking && (
          <div className="mb-2 p-2 bg-white border border-blue-200 rounded-lg">
            <select autoFocus className="w-full text-sm border border-gray-200 rounded px-2 py-1"
              defaultValue=""
              onChange={e => addService(e.target.value)}>
              <option value="" disabled>— Chọn dịch vụ —</option>
              {availableServices.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} ({fmtMoney(s.basePrice || 0)}đ)
                </option>
              ))}
            </select>
            <button onClick={() => setPicking(false)} className="mt-1 text-xs text-gray-500 hover:text-gray-800">Hủy</button>
          </div>
        )}
        {bundled.length === 0 ? (
          <div className="text-xs text-gray-400 italic px-2 py-3 bg-white rounded border border-gray-200">Chưa có dịch vụ nào. Bấm "+ Thêm dịch vụ".</div>
        ) : (
          <ul className="space-y-1">
            {bundled.map(entry => {
              const svc = svcMap[entry.code]
              const base = svc?.basePrice ?? 0
              const inPkg = svc?.inPackagePrice ?? base
              const hasInPkgDiscount = svc?.inPackagePrice != null && svc.inPackagePrice !== base
              const effective = priceFor(entry)
              return (
                <li key={entry.code} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-gray-400">{entry.code}</div>
                    <div className="text-gray-700 truncate">{svc?.name || <span className="italic text-gray-400">(không tìm thấy)</span>}</div>
                  </div>
                  {svc && hasInPkgDiscount && canEdit && (
                    <div className="inline-flex border border-gray-200 rounded overflow-hidden flex-shrink-0">
                      <button type="button" onClick={() => entry.priceMode === 'base' || flipMode(entry.code)}
                        className={`px-2 py-0.5 text-[10px] ${entry.priceMode === 'base' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        Giá lẻ {fmtMoney(base)}đ
                      </button>
                      <button type="button" onClick={() => entry.priceMode === 'inPackage' || flipMode(entry.code)}
                        className={`px-2 py-0.5 text-[10px] ${entry.priceMode === 'inPackage' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        Trong gói {fmtMoney(inPkg)}đ
                      </button>
                    </div>
                  )}
                  <div className="font-mono text-[11px] text-blue-700 flex-shrink-0 w-20 text-right">{fmtMoney(effective)}đ</div>
                  {canEdit && (
                    <button onClick={() => removeService(entry.code)} className="text-red-500 hover:text-red-700 text-base leading-none flex-shrink-0" aria-label="Bỏ">×</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {bundled.length > 0 && (
          <div className="mt-2 text-xs text-gray-600 flex items-center justify-between bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
            <span>Tổng giá đề xuất (sum theo lựa chọn trên):</span>
            <span className="font-mono font-semibold text-blue-700">{fmtMoney(suggestedTotal)}đ</span>
          </div>
        )}
      </section>

      {/* Tiers */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bậc giá ({tiers.length})</h3>
          <div className="flex items-center gap-2">
            {canEdit && tiers.length > 0 && (
              <button onClick={splitTiers} disabled={saving}
                className="text-xs text-purple-700 hover:text-purple-900 px-2 py-0.5 border border-purple-200 rounded hover:bg-purple-50"
                title="Tạo các gói riêng từ mỗi bậc giá">
                ⎘ Tách bậc thành gói riêng
              </button>
            )}
            {canEdit && <button onClick={addTier} className="text-xs text-blue-600 hover:text-blue-800">+ Thêm bậc</button>}
          </div>
        </div>
        {tiers.length === 0 ? (
          <div className="text-xs text-gray-400 italic">Không có bậc giá. Gói dùng "Đơn giá" ở trên (form Thông tin) cho mọi lượt khám.</div>
        ) : (
          <ul className="space-y-2">
            {tiers.map((t, i) => (
              <li key={i} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={t.name || ''} onChange={e => updateTier(i, { name: e.target.value })} disabled={!canEdit}
                    placeholder="Tên bậc (vd: Standard)"
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm" />
                  <input value={t.code || ''} onChange={e => updateTier(i, { code: e.target.value })} disabled={!canEdit}
                    placeholder="mã"
                    className="w-24 border border-gray-200 rounded px-2 py-1 text-xs font-mono" />
                  <input type="number" value={t.totalPrice || 0} onChange={e => updateTier(i, { totalPrice: +e.target.value })} disabled={!canEdit}
                    className="w-28 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-right" />
                  <span className="text-xs text-gray-400">đ</span>
                  {canEdit && <button onClick={() => removeTier(i)} className="text-red-500 hover:text-red-700 text-base leading-none">×</button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Kính kèm:</span>
                  <select value={t.extraProductSku || ''} onChange={e => updateTier(i, { extraProductSku: e.target.value })} disabled={!canEdit}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                    <option value="">— Không có —</option>
                    {kinhList.map(k => (
                      <option key={k.code} value={k.code}>
                        {k.code} — {k.name} ({fmtMoney(k.sellPrice || 0)}đ)
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Entitlement */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quyền lợi kèm gói</h3>
          {canEdit && (
            <label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              <input type="checkbox" checked={entOpen} onChange={e => setEntOpen(e.target.checked)} />
              Bật entitlement
            </label>
          )}
        </div>
        {entOpen ? (
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Thời hạn (tháng):</span>
              <input type="number" min="1" value={entMonths} onChange={e => setEntMonths(+e.target.value)} disabled={!canEdit}
                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-right" />
            </div>
            <div className="text-xs text-gray-500">Dịch vụ được phủ:</div>
            <ul className="space-y-1">
              {bundled.map(b => {
                const covered = entCovered.find(c => c.serviceCode === b.code)
                return (
                  <li key={b.code} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!covered} onChange={() => toggleEntCover(b.code)} disabled={!canEdit} />
                    <span className="flex-1 truncate">{svcMap[b.code]?.name || b.code}</span>
                    {covered && (
                      <>
                        <span className="text-gray-400">Tối đa</span>
                        <input type="number" min="0" value={covered.maxUses ?? ''} onChange={e => setEntMaxUses(b.code, e.target.value)} disabled={!canEdit}
                          placeholder="∞"
                          className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono text-right" />
                        <span className="text-gray-400">lần</span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">Không có entitlement. Gói chỉ áp 1 lần cho lượt khám hiện tại.</div>
        )}
      </section>

      {canEdit && (
        <div className="border-t border-gray-200 pt-3 flex items-center justify-end gap-2">
          {err && <div className="flex-1 text-xs text-rose-600">{err}</div>}
          {savedAt && !dirty && <div className="flex-1 text-xs text-emerald-600">✓ Đã lưu lúc {savedAt.toLocaleTimeString('vi-VN')}</div>}
          <button onClick={save} disabled={saving || !dirty}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      )}
    </div>
  )
}

// Read pkg.bundledServices + bundledServiceModes into a unified array of
// { code, priceMode } entries. Missing modes default to 'inPackage'.
function normalizeBundle(pkg) {
  const modeMap = Object.fromEntries((pkg.bundledServiceModes || []).map(m => [m.code, m]))
  return (pkg.bundledServices || []).map(code => {
    const m = modeMap[code]
    return {
      code,
      priceMode: m?.priceMode || 'inPackage',
      customPrice: m?.customPrice || 0,
    }
  })
}

// PackagePriceMatrix — services × packages grid for cross-package editing.
// Click a cell to cycle: empty → "gói" (in-package price) → "lẻ" (base price)
// → empty. Bottom of each package column shows the auto-computed total
// (sum of selected service prices + Kính kèm sellPrice if attached).
// "Lưu thay đổi" persists every modified package via parallel PUTs.
function PackagePriceMatrix({ canEdit }) {
  const [packages, setPackages] = useState([])
  const [services, setServices] = useState([])
  const [kinhList, setKinhList] = useState([])
  const [draft, setDraft] = useState({})  // packageCode → {bundle: [{code,priceMode}], kinh: code}
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [kinhFilter, setKinhFilter] = useState('') // default: all Kính categories

  const reload = async () => {
    setLoading(true)
    try {
      const [pR, sR, kR] = await Promise.all([
        api.get('/catalogs/packages'),
        api.get('/catalogs/services'),
        api.get('/catalogs/kinh'),
      ])
      const allPkgs = pR.data || []
      setPackages(showInactive ? allPkgs : allPkgs.filter(p => p.status !== 'inactive'))
      setServices(sR.data || [])
      setKinhList(kR.data || [])
      // Seed draft from server state. Two Kính bundling mechanisms:
      //   bundledKinhSkus → specific Kính SKUs (any non-ortho-K kept as SKU-bundled)
      //   bundledKinhTypes → ortho-K type tokens ('standard'/'toric'/'customized');
      //                      the actual SKU is picked at billing time
      // Backward compat: legacy single bundledKinhSku → bundledKinhSkus[0].
      const d = {}
      for (const p of allPkgs) {
        const kinhArr = (p.bundledKinhSkus || []).length
          ? [...p.bundledKinhSkus]
          : (p.bundledKinhSku ? [p.bundledKinhSku] : [])
        d[p.code] = {
          bundle: normalizeBundle(p),
          kinhSkus: kinhArr,
          kinhTypes: [...(p.bundledKinhTypes || [])],
        }
      }
      setDraft(d)
      setSavedAt(null); setErr('')
    } finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [showInactive])

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Đang tải bảng giá gói...</div>
  if (services.length === 0 || packages.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">Chưa có dữ liệu gói/dịch vụ.</div>
  }

  const svcMap = Object.fromEntries(services.map(s => [s.code, s]))
  const kinhMap = Object.fromEntries(kinhList.map(k => [k.code, k]))

  const cellEntry = (pkgCode, svcCode) => (draft[pkgCode]?.bundle || []).find(b => b.code === svcCode) || null
  const cellPrice = (svc, entry) => {
    if (!svc || !entry) return 0
    if (entry.priceMode === 'custom') return entry.customPrice || 0
    if (entry.priceMode === 'base') return svc.basePrice || 0
    return svc.inPackagePrice ?? svc.basePrice ?? 0
  }
  // Cycle MODE only. Empty → inPackage → base → custom (seeded with current
  // effective price) → empty. Mode label click cycles; price input edits the
  // custom override directly.
  const cycleMode = (pkgCode, svcCode) => {
    if (!canEdit) return
    setSavedAt(null)
    const svc = svcMap[svcCode]
    const cur = cellEntry(pkgCode, svcCode)
    setDraft(d => {
      const bundle = (d[pkgCode]?.bundle || []).filter(b => b.code !== svcCode)
      let next
      if (cur == null) next = { code: svcCode, priceMode: 'inPackage', customPrice: 0 }
      else if (cur.priceMode === 'inPackage') next = { ...cur, priceMode: 'base' }
      else if (cur.priceMode === 'base') {
        // Seed customPrice with current effective price (base) for convenience
        next = { ...cur, priceMode: 'custom', customPrice: cur.customPrice || svc?.basePrice || 0 }
      }
      else next = null  // 'custom' → empty
      if (next) bundle.push(next)
      return { ...d, [pkgCode]: { ...d[pkgCode], bundle } }
    })
  }
  // Set custom price — auto-promotes the cell to custom mode if not already.
  const setCustomPrice = (pkgCode, svcCode, raw) => {
    if (!canEdit) return
    setSavedAt(null)
    const num = Math.max(0, Number(String(raw).replace(/[^\d]/g, '')) || 0)
    setDraft(d => {
      const bundle = [...(d[pkgCode]?.bundle || [])]
      const idx = bundle.findIndex(b => b.code === svcCode)
      if (idx >= 0) {
        bundle[idx] = { ...bundle[idx], priceMode: 'custom', customPrice: num }
      } else {
        bundle.push({ code: svcCode, priceMode: 'custom', customPrice: num })
      }
      return { ...d, [pkgCode]: { ...d[pkgCode], bundle } }
    })
  }
  const isKinhInPkg = (pkgCode, kinhCode) => (draft[pkgCode]?.kinhSkus || []).includes(kinhCode)
  const toggleKinh = (pkgCode, kinhCode) => {
    if (!canEdit) return
    setSavedAt(null)
    setDraft(d => {
      const cur = d[pkgCode]?.kinhSkus || []
      const next = cur.includes(kinhCode) ? cur.filter(c => c !== kinhCode) : [...cur, kinhCode]
      return { ...d, [pkgCode]: { ...d[pkgCode], kinhSkus: next } }
    })
  }

  // Type-level toggle for ortho-K. The actual lens SKU is picked at billing
  // time from whichever ortho-K SKUs match the type and are in stock.
  const isTypeInPkg = (pkgCode, typeCode) => (draft[pkgCode]?.kinhTypes || []).includes(typeCode)
  const toggleType = (pkgCode, typeCode) => {
    if (!canEdit) return
    setSavedAt(null)
    setDraft(d => {
      const cur = d[pkgCode]?.kinhTypes || []
      const next = cur.includes(typeCode) ? cur.filter(c => c !== typeCode) : [...cur, typeCode]
      return { ...d, [pkgCode]: { ...d[pkgCode], kinhTypes: next } }
    })
  }
  // Build type → {label, skus, avgPrice} map from ortho-K SKUs
  const orthoKByType = (() => {
    const groups = {}
    for (const k of kinhList) {
      if (k.category !== 'ortho-k' || k.status === 'inactive') continue
      const t = k.kinhType || ''
      if (!groups[t]) groups[t] = { type: t, skus: [], total: 0, count: 0 }
      groups[t].skus.push(k)
      groups[t].total += (k.sellPrice || 0)
      groups[t].count += 1
    }
    return groups
  })()
  const typeAvgPrice = (typeCode) => {
    const g = orthoKByType[typeCode]
    if (!g || g.count === 0) return 0
    return Math.round(g.total / g.count)
  }
  const TYPE_LABELS = { standard: 'Standard', toric: 'Toric', customized: 'Customized' }

  const pkgServiceTotal = (pkgCode) => {
    const bundle = draft[pkgCode]?.bundle || []
    return bundle.reduce((s, b) => s + cellPrice(svcMap[b.code], b), 0)
  }
  const pkgKinhPrice = (pkgCode) => {
    return (draft[pkgCode]?.kinhSkus || []).reduce((s, code) => s + (kinhMap[code]?.sellPrice || 0), 0)
  }
  const pkgTypePrice = (pkgCode) => {
    return (draft[pkgCode]?.kinhTypes || []).reduce((s, t) => s + typeAvgPrice(t), 0)
  }
  const pkgGrandTotal = (pkgCode) => pkgServiceTotal(pkgCode) + pkgKinhPrice(pkgCode) + pkgTypePrice(pkgCode)

  const isDirty = (pkgCode) => {
    const orig = packages.find(p => p.code === pkgCode)
    if (!orig) return false
    const origBundle = normalizeBundle(orig)
    const draftBundle = draft[pkgCode]?.bundle || []
    if (origBundle.length !== draftBundle.length) return true
    const origMap = Object.fromEntries(origBundle.map(b => [b.code, b]))
    for (const b of draftBundle) {
      const o = origMap[b.code]
      if (!o) return true
      if (o.priceMode !== b.priceMode) return true
      if (b.priceMode === 'custom' && (o.customPrice || 0) !== (b.customPrice || 0)) return true
    }
    const origKinh = (orig.bundledKinhSkus || []).length
      ? [...orig.bundledKinhSkus].sort()
      : (orig.bundledKinhSku ? [orig.bundledKinhSku] : [])
    const draftKinh = [...(draft[pkgCode]?.kinhSkus || [])].sort()
    if (origKinh.join(',') !== draftKinh.join(',')) return true
    const origTypes = [...(orig.bundledKinhTypes || [])].sort()
    const draftTypes = [...(draft[pkgCode]?.kinhTypes || [])].sort()
    if (origTypes.join(',') !== draftTypes.join(',')) return true
    return false
  }
  const dirtyCodes = packages.filter(p => isDirty(p.code)).map(p => p.code)

  const save = async () => {
    if (dirtyCodes.length === 0) return
    setSaving(true); setErr('')
    try {
      await Promise.all(dirtyCodes.map(code => {
        const orig = packages.find(p => p.code === code)
        const d = draft[code]
        return api.put(`/catalogs/packages/${code}`, {
          ...orig,
          _id: undefined,
          bundledServices: d.bundle.map(b => b.code),
          bundledServiceModes: d.bundle.map(b => ({
            code: b.code,
            priceMode: b.priceMode,
            customPrice: b.priceMode === 'custom' ? (b.customPrice || 0) : 0,
          })),
          bundledKinhSkus: d.kinhSkus || [],
          bundledKinhSku: '',
          bundledKinhTypes: d.kinhTypes || [],
        })
      }))
      await reload()
      setSavedAt(new Date())
    } catch (e) {
      setErr(e.response?.data?.error || 'Lỗi lưu')
    }
    setSaving(false)
  }

  // Sort services by category then by name for stable rendering
  const orderedServices = [...services].sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))

  // Kính SKU rows: shown for non-ortho-K Kính (frames, soft CL, accessories
  // etc.). Ortho-K is bundled at type level and rendered separately above.
  const visibleKinh = kinhList
    .filter(k => k.status !== 'inactive')
    .filter(k => k.category !== 'ortho-k')   // ortho-K handled by type rows
    .filter(k => !kinhFilter || kinhFilter === 'ortho-k' || k.category === kinhFilter)
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))
  // Ortho-K type rows: only shown if there are ortho-K SKUs categorized.
  // Order: standard → toric → customized → others (alphabetical)
  const TYPE_ORDER = ['standard', 'toric', 'customized']
  const visibleTypes = (kinhFilter === '' || kinhFilter === 'ortho-k')
    ? Object.keys(orthoKByType)
        .filter(t => t)  // skip empty/uncategorized for now
        .sort((a, b) => {
          const ai = TYPE_ORDER.indexOf(a); const bi = TYPE_ORDER.indexOf(b)
          if (ai !== -1 && bi !== -1) return ai - bi
          if (ai !== -1) return -1
          if (bi !== -1) return 1
          return a.localeCompare(b)
        })
    : []
  const uncategorizedOrthoK = (orthoKByType[''] || { skus: [] }).skus.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col max-h-[calc(100vh-12rem)]">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-3 flex-wrap flex-shrink-0">
        <div className="text-xs text-gray-500">
          <b className="text-gray-700">{services.length}</b> dịch vụ × <b className="text-gray-700">{packages.length}</b> gói.
          Bấm nhãn ô: <span className="px-1 rounded bg-blue-100 text-blue-700 font-mono">gói</span> → <span className="px-1 rounded bg-gray-200 text-gray-700 font-mono">lẻ</span> → <span className="px-1 rounded bg-yellow-200 text-yellow-800 font-mono">tự</span> → bỏ. Sửa giá trực tiếp để chuyển sang "tự".
        </div>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Hiện gói đã khóa
        </label>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1">
          Kính:
          <select value={kinhFilter} onChange={e => setKinhFilter(e.target.value)}
            className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white">
            <option value="">Tất cả</option>
            <option value="ortho-k">Ortho-K</option>
            <option value="ktx">KTX (mềm)</option>
            <option value="trong">Tròng</option>
            <option value="gong">Gọng</option>
            <option value="phu-kien">Phụ kiện</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {err && <span className="text-xs text-rose-600">{err}</span>}
          {savedAt && dirtyCodes.length === 0 && <span className="text-xs text-emerald-600">✓ Đã lưu lúc {savedAt.toLocaleTimeString('vi-VN')}</span>}
          {canEdit && (
            <button onClick={save} disabled={saving || dirtyCodes.length === 0}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Đang lưu…' : `Lưu ${dirtyCodes.length || ''} thay đổi`.trim()}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
      <table className="text-xs whitespace-nowrap">
        <thead className="sticky top-0 z-30">
          {/* Row 1: column headers (sticky top:0) */}
          <tr className="bg-gray-50 text-gray-600">
            <th className="sticky top-0 left-0 bg-gray-50 px-2 py-2 text-left font-semibold border-r border-gray-200 z-30">Mã DV</th>
            <th className="sticky top-0 left-[80px] bg-gray-50 px-2 py-2 text-left font-semibold border-r border-gray-200 min-w-[200px] z-30">Tên dịch vụ</th>
            <th className="sticky top-0 px-2 py-2 text-right font-semibold border-r border-gray-200 bg-gray-100 z-20">Giá lẻ</th>
            <th className="sticky top-0 px-2 py-2 text-right font-semibold border-r border-gray-200 bg-gray-100 z-20">Giá trong gói</th>
            {packages.map(p => (
              <th key={p.code} className="sticky top-0 px-2 py-2 text-center font-semibold border-r border-gray-200 align-bottom bg-gray-50 z-20">
                <div className="text-[10px] font-mono text-gray-400">{p.code}</div>
                <div className="text-xs text-gray-700 max-w-[100px] mx-auto whitespace-normal" title={p.name}>{p.name}</div>
              </th>
            ))}
          </tr>
          {/* Row 2: Tổng giá gói (auto) — moved from tfoot, sticks just below header */}
          <tr className="bg-blue-50 text-blue-900 border-y-2 border-blue-300 font-bold">
            <td className="sticky top-[60px] left-0 bg-blue-50 px-2 py-2 border-r border-gray-200 z-30" />
            <td colSpan={3} className="sticky top-[60px] left-[80px] bg-blue-50 px-2 py-2 text-right border-r border-gray-200 z-30">Tổng giá gói (auto)</td>
            {packages.map(p => (
              <td key={p.code} className={`sticky top-[60px] px-2 py-2 text-right font-mono border-r border-gray-200 z-20 ${isDirty(p.code) ? 'bg-yellow-100 text-yellow-900' : 'bg-blue-50'}`}>
                {fmtMoney(pkgGrandTotal(p.code))}đ
              </td>
            ))}
          </tr>
          {/* Row 3: breakdown — service total + Kính total */}
          <tr className="bg-gray-100 text-gray-600 text-[11px]">
            <td className="sticky top-[100px] left-0 bg-gray-100 px-2 py-1.5 border-r border-gray-200 z-30" />
            <td colSpan={3} className="sticky top-[100px] left-[80px] bg-gray-100 px-2 py-1.5 text-right border-r border-gray-200 z-30">DV + Ortho-K(TB) + Kính khác</td>
            {packages.map(p => {
              const sp = pkgServiceTotal(p.code)
              const kp = pkgKinhPrice(p.code)
              const tp = pkgTypePrice(p.code)
              const ks = (draft[p.code]?.kinhSkus || []).length
              const ts = (draft[p.code]?.kinhTypes || []).length
              return (
                <td key={p.code} className="sticky top-[100px] bg-gray-100 px-2 py-1.5 text-right font-mono border-r border-gray-200 z-20">
                  <div>{fmtMoney(sp)}</div>
                  {(kp + tp) > 0 && (
                    <div className="text-[9px] text-gray-500">
                      +{fmtMoney(kp + tp)} {ts > 0 && `(${ts}T)`}{ks > 0 && ` (${ks}S)`}
                    </div>
                  )}
                </td>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {orderedServices.map(svc => (
            <tr key={svc.code} className="border-t border-gray-100 hover:bg-blue-50/30">
              <td className="sticky left-0 bg-white px-2 py-1.5 font-mono text-[10px] text-gray-500 border-r border-gray-200 z-10">{svc.code}</td>
              <td className="sticky left-[80px] bg-white px-2 py-1.5 text-gray-700 border-r border-gray-200 z-10">{svc.name}</td>
              <td className="px-2 py-1.5 text-right font-mono text-gray-700 border-r border-gray-200">{fmtMoney(svc.basePrice || 0)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-gray-700 border-r border-gray-200">{svc.inPackagePrice == null ? '—' : fmtMoney(svc.inPackagePrice)}</td>
              {packages.map(p => {
                const entry = cellEntry(p.code, svc.code)
                const mode = entry?.priceMode
                const price = cellPrice(svc, entry)
                const bgCls = mode === 'inPackage' ? 'bg-blue-50'
                  : mode === 'base' ? 'bg-gray-100'
                  : mode === 'custom' ? 'bg-yellow-50'
                  : 'bg-white hover:bg-blue-50/40'
                const labelCls = mode === 'inPackage' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : mode === 'base' ? 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                  : mode === 'custom' ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                  : 'bg-gray-100 text-gray-400 hover:bg-blue-100'
                const label = mode == null ? '+' : mode === 'inPackage' ? 'gói' : mode === 'base' ? 'lẻ' : 'tự'
                return (
                  <td key={p.code} className={`border-r border-gray-200 p-0.5 ${bgCls}`}>
                    <div className="flex flex-col gap-0.5 items-stretch">
                      <button onClick={() => cycleMode(p.code, svc.code)} disabled={!canEdit}
                        className={`text-[9px] font-semibold rounded leading-tight py-0.5 transition-colors ${labelCls}`}
                        title={mode == null ? 'Bấm để thêm' : 'Bấm để đổi mode (gói → lẻ → tự → bỏ)'}>
                        {label}
                      </button>
                      {mode != null && (
                        <input
                          type="text"
                          value={price === 0 && mode !== 'custom' ? '' : fmtMoney(price)}
                          onChange={e => setCustomPrice(p.code, svc.code, e.target.value)}
                          disabled={!canEdit}
                          className="w-full text-[10px] font-mono text-right px-1 py-0.5 border border-transparent rounded bg-white/70 hover:bg-white focus:bg-white focus:border-blue-300 focus:outline-none disabled:bg-transparent"
                          title={mode === 'custom' ? 'Giá tùy chỉnh — sửa tự do' : 'Sửa giá để đặt tùy chỉnh (auto-chuyển sang "tự")'}
                        />
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          {visibleTypes.length > 0 && (
            <>
              <tr className="bg-purple-50 border-t-2 border-purple-300">
                <td colSpan={4 + packages.length} className="sticky left-0 bg-purple-50 px-2 py-1.5 text-xs font-semibold text-purple-700 z-10">
                  🔬 Ortho-K (theo loại) — bấm ô để gắn loại vào gói. SKU cụ thể chọn lúc bill ở Khám.
                  {uncategorizedOrthoK > 0 && (
                    <span className="ml-2 font-normal text-purple-600">
                      ({uncategorizedOrthoK} SKU Ortho-K chưa phân loại — sửa "Loại Ortho-K" trên row Kính)
                    </span>
                  )}
                </td>
              </tr>
              {visibleTypes.map(t => {
                const g = orthoKByType[t]
                const avg = typeAvgPrice(t)
                return (
                  <tr key={`T-${t}`} className="border-t border-purple-100 hover:bg-purple-50/30">
                    <td className="sticky left-0 bg-white px-2 py-1.5 font-mono text-[10px] text-purple-500 border-r border-gray-200 z-10">type:{t}</td>
                    <td className="sticky left-[80px] bg-white px-2 py-1.5 text-purple-900 border-r border-gray-200 z-10">
                      Ortho-K {TYPE_LABELS[t] || t}
                      <span className="ml-1 text-[10px] text-gray-400">[{g.count} SKU]</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-700 border-r border-gray-200" colSpan={2}>
                      ~{fmtMoney(avg)} <span className="text-[9px] text-gray-400">(TB)</span>
                    </td>
                    {packages.map(p => {
                      const checked = isTypeInPkg(p.code, t)
                      return (
                        <td key={p.code} className={`border-r border-gray-200 p-0.5 ${checked ? 'bg-purple-50' : 'bg-white hover:bg-purple-50/40'}`}>
                          <button onClick={() => toggleType(p.code, t)} disabled={!canEdit}
                            className={`w-full text-[10px] font-semibold rounded leading-tight py-1 transition-colors ${checked ? 'bg-purple-200 text-purple-800 hover:bg-purple-300' : 'bg-gray-100 text-gray-400 hover:bg-purple-100'}`}
                            title={checked ? `Đã gắn loại — bấm để bỏ (~${fmtMoney(avg)}đ TB)` : `Bấm để gắn loại Ortho-K ${TYPE_LABELS[t] || t}`}>
                            {checked ? '✓' : '+'}
                            {checked && <div className="text-[9px] font-mono">~{fmtMoney(avg)}</div>}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </>
          )}
          <tr className="bg-emerald-50 border-t-2 border-emerald-300">
            <td colSpan={4 + packages.length} className="sticky left-0 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 z-10">
              👓 Kính khác / Lens ({visibleKinh.length}{kinhFilter && kinhFilter !== 'ortho-k' ? ` · lọc: ${kinhFilter}` : ''}) — bấm ô để gắn SKU cụ thể vào gói
              {visibleKinh.length === 0 && (
                <span className="ml-2 font-normal text-emerald-600">
                  Không có Kính khớp bộ lọc.{' '}
                  <button onClick={() => setKinhFilter('')} className="underline hover:text-emerald-900">Hiển thị tất cả →</button>
                </span>
              )}
            </td>
          </tr>
          {visibleKinh.map(k => (
            <tr key={`K-${k.code}`} className="border-t border-gray-100 hover:bg-emerald-50/30">
              <td className="sticky left-0 bg-white px-2 py-1.5 font-mono text-[10px] text-gray-500 border-r border-gray-200 z-10">{k.code}</td>
              <td className="sticky left-[80px] bg-white px-2 py-1.5 text-gray-700 border-r border-gray-200 z-10">
                {k.name}
                {k.category && <span className="ml-1 text-[10px] text-gray-400">[{k.category}]</span>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-gray-700 border-r border-gray-200" colSpan={2}>
                {fmtMoney(k.sellPrice || 0)}
              </td>
              {packages.map(p => {
                const checked = isKinhInPkg(p.code, k.code)
                return (
                  <td key={p.code} className={`border-r border-gray-200 p-0.5 ${checked ? 'bg-emerald-50' : 'bg-white hover:bg-emerald-50/40'}`}>
                    <button onClick={() => toggleKinh(p.code, k.code)} disabled={!canEdit}
                      className={`w-full text-[10px] font-semibold rounded leading-tight py-1 transition-colors ${checked ? 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300' : 'bg-gray-100 text-gray-400 hover:bg-emerald-100'}`}
                      title={checked ? `Đang kèm — bấm để bỏ (${fmtMoney(k.sellPrice || 0)}đ)` : 'Bấm để gắn'}>
                      {checked ? '✓' : '+'}
                      {checked && <div className="text-[9px] font-mono">{fmtMoney(k.sellPrice || 0)}</div>}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [categoryFilter, setCategoryFilter] = useState('') // empty = all
  const [sortBy, setSortBy] = useState('')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  // Reset pagination when the catalog or any filter changes so we don't end up
  // on page 3 of a catalog that only has 10 rows after a filter switch.
  useEffect(() => { setPage(1) }, [catalogKey, searchQ, statusFilter, categoryFilter, sortBy, sortDir])
  // Clear category filter when switching catalogs (it's per-catalog)
  useEffect(() => { setCategoryFilter('') }, [catalogKey])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (searchQ) params.q = searchQ
      if (categoryFilter) params.category = categoryFilter
      const r = await api.get(`/catalogs/${catalogKey}`, { params })
      setItems(r.data)
    } catch {}
    setLoading(false)
  }, [catalogKey, searchQ, categoryFilter])

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
        {(() => {
          const catField = (config.editFields || []).find(f => f.key === 'category' && f.type === 'select')
          if (!catField) return null
          return (
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
              value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">Loại: Tất cả</option>
              {catField.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )
        })()}
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

function GenderIcon({ gender }) {
  if (gender === 'M') return <span className="ml-1.5 text-blue-500" title="Nam">♂</span>
  if (gender === 'F') return <span className="ml-1.5 text-pink-500" title="Nữ">♀</span>
  return null
}

function PatientsTable() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [todayOnly, setTodayOnly] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [genderFilter, setGenderFilter] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [lastFrom, setLastFrom] = useState('')
  const [lastTo, setLastTo] = useState('')
  const [page, setPage] = useState(1)
  const [openPatient, setOpenPatient] = useState(null)
  useEffect(() => { setPage(1) }, [searchQ, todayOnly, genderFilter, ageMin, ageMax, createdFrom, createdTo, lastFrom, lastTo])
  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/catalogs/patients', { params: searchQ ? { q: searchQ } : {} }); setItems(r.data) } catch {}
    setLoading(false)
  }, [searchQ])
  useEffect(() => { load() }, [load])

  const calcAge = (dob) => {
    if (!dob) return null
    const ms = Date.now() - new Date(dob).getTime()
    if (!Number.isFinite(ms) || ms < 0) return null
    return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
  }
  const todayStr = new Date().toISOString().slice(0, 10)
  // Search is authoritative — when a query is active, the server result is
  // returned as-is, regardless of site/today/advanced filters. Filters only
  // apply when browsing (no search query).
  const isSearching = !!searchQ.trim()
  const filtered = isSearching ? items : items.filter(p => {
    if (todayOnly) {
      const lastDay = (p.lastEncounterAt || '').slice(0, 10)
      const createdDay = (p.createdAt || '').slice(0, 10)
      if (lastDay !== todayStr && createdDay !== todayStr) return false
    }
    if (genderFilter && p.gender !== genderFilter) return false
    const age = calcAge(p.dob)
    if (ageMin !== '' && (age == null || age < +ageMin)) return false
    if (ageMax !== '' && (age == null || age > +ageMax)) return false
    if (createdFrom && (p.createdAt || '').slice(0, 10) < createdFrom) return false
    if (createdTo && (p.createdAt || '').slice(0, 10) > createdTo) return false
    if (lastFrom && (!p.lastEncounterAt || p.lastEncounterAt.slice(0, 10) < lastFrom)) return false
    if (lastTo && (!p.lastEncounterAt || p.lastEncounterAt.slice(0, 10) > lastTo)) return false
    return true
  })
  const paged = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = paged.length < filtered.length
  const advFilterCount = (genderFilter ? 1 : 0) + (ageMin !== '' || ageMax !== '' ? 1 : 0)
    + (createdFrom || createdTo ? 1 : 0) + (lastFrom || lastTo ? 1 : 0)
  const clearAdvanced = () => {
    setGenderFilter(''); setAgeMin(''); setAgeMax('')
    setCreatedFrom(''); setCreatedTo(''); setLastFrom(''); setLastTo('')
  }

  // "Create new patient" CTA — visible when there's a search query and no
  // results match. Heuristic: digits/spaces/+/-/() ≥ 3 chars looks like a
  // phone number, else treat as a name. Deep-links to /registration with
  // a prefill URL param so FormView pre-fills + skips the search step.
  const trimmedQ = searchQ.trim()
  const isPhoneLike = /^[\d\s+()-]{3,}$/.test(trimmedQ)
  const createNewHref = trimmedQ
    ? `/registration?${isPhoneLike ? 'prefillPhone' : 'prefillName'}=${encodeURIComponent(trimmedQ)}`
    : '/registration'

  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          placeholder="Tìm hoặc thêm BN — tên, SĐT (BN/giám hộ), mã..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          autoFocus
        />
        <div className={`flex items-center gap-2 ${isSearching ? 'opacity-40' : ''}`} title={isSearching ? 'Bộ lọc tạm tắt khi đang tìm kiếm' : undefined}>
          <button onClick={() => setTodayOnly(t => !t)} disabled={isSearching}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors ${todayOnly ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            title="Bấm để chuyển giữa 'Tất cả' và 'Hôm nay'">
            {todayOnly ? '📅 Hôm nay' : '👥 Tất cả'}
          </button>
          <button onClick={() => setAdvancedOpen(o => !o)} disabled={isSearching}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            {advancedOpen ? '▾' : '▸'} Bộ lọc nâng cao{advFilterCount > 0 && ` (${advFilterCount})`}
          </button>
        </div>
        <div className="flex-1 text-xs text-gray-500 text-right flex items-center justify-end gap-2">
          <span>
            <b className="text-gray-700">{items.length}</b> {isSearching ? 'kết quả' : 'bệnh nhân'}
            {!isSearching && filtered.length !== items.length && <span> · <b className="text-gray-700">{filtered.length}</b> hiển thị</span>}
          </span>
          <Link to={createNewHref} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">
            + BN mới{trimmedQ ? '…' : ''}
          </Link>
        </div>
      </div>
      {advancedOpen && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 flex items-center gap-2 flex-wrap">
          <select className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
            <option value="">Giới tính: Tất cả</option><option value="M">Nam</option><option value="F">Nữ</option>
          </select>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
            <span className="text-xs text-gray-500">Tuổi</span>
            <input type="number" min="0" placeholder="từ" value={ageMin} onChange={e => setAgeMin(e.target.value)}
              className="w-12 text-sm focus:outline-none" />
            <span className="text-gray-400">–</span>
            <input type="number" min="0" placeholder="đến" value={ageMax} onChange={e => setAgeMax(e.target.value)}
              className="w-12 text-sm focus:outline-none" />
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
            <span className="text-xs text-gray-500" title="Ngày tạo hồ sơ">Tạo</span>
            <input type="date" value={createdFrom} onChange={e => setCreatedFrom(e.target.value)} className="text-xs focus:outline-none" />
            <span className="text-gray-400">–</span>
            <input type="date" value={createdTo} onChange={e => setCreatedTo(e.target.value)} className="text-xs focus:outline-none" />
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
            <span className="text-xs text-gray-500" title="Lượt khám gần nhất">Khám gần nhất</span>
            <input type="date" value={lastFrom} onChange={e => setLastFrom(e.target.value)} className="text-xs focus:outline-none" />
            <span className="text-gray-400">–</span>
            <input type="date" value={lastTo} onChange={e => setLastTo(e.target.value)} className="text-xs focus:outline-none" />
          </div>
          {advFilterCount > 0 && (
            <button onClick={clearAdvanced} className="text-xs text-gray-500 hover:text-gray-800 underline">Xóa lọc nâng cao</button>
          )}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
            <th className="px-4 py-3">Mã</th>
            <th className="px-4 py-3">Tên</th>
            <th className="px-4 py-3">SĐT</th>
            <th className="px-4 py-3">Ngày sinh</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : paged.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center">
                <div className="text-gray-400 mb-3">
                  {trimmedQ ? `Không tìm thấy BN khớp "${trimmedQ}".` : 'Chưa có bệnh nhân khớp bộ lọc.'}
                </div>
                <Link to={createNewHref}
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
                  {trimmedQ
                    ? `+ Tạo BN mới với ${isPhoneLike ? 'SĐT' : 'tên'} "${trimmedQ}"`
                    : '+ Bệnh nhân mới'}
                </Link>
              </td></tr>
            )
            : paged.map(p => (
              <tr key={p._id} onClick={() => setOpenPatient(p)} className="border-t border-gray-100 hover:bg-blue-50/50 cursor-pointer">
                <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{p.patientId || '-'}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {p.name || '-'}
                  <GenderIcon gender={p.gender} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {p.phone || (p.guardianPhone
                    ? <span className="text-gray-700">{p.guardianPhone}<span className="ml-1 text-[10px] text-gray-400">({p.guardianRelation || 'người giám hộ'})</span></span>
                    : '-')}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{p.dob || '-'}</td>
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
  const { auth } = useAuth()
  const SITES = ['Trung Kính', 'Kim Giang']
  const initialSite = (() => {
    try {
      const remembered = localStorage.getItem('maec_last_checkin_site')
      if (remembered && SITES.includes(remembered)) return remembered
    } catch {}
    if (SITES.includes(auth?.department)) return auth.department
    return SITES[0]
  })()
  const [site, setSite] = useState(initialSite)
  const [encounters, setEncounters] = useState(null)
  const [checkingIn, setCheckingIn] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.get('/encounters', { params: { patientId: patient.patientId || patient._id } })
      .then(r => { if (!cancelled) setEncounters(r.data || []) })
      .catch(() => { if (!cancelled) setEncounters([]) })
    return () => { cancelled = true }
  }, [patient])

  // Idempotent: server returns existing open encounter if one exists.
  // Either way we navigate into Khám to show the encounter pane.
  const checkIn = async () => {
    if (!patient._id) return
    setCheckingIn(true)
    try {
      try { localStorage.setItem('maec_last_checkin_site', site) } catch {}
      const r = await api.post('/registration/check-in', { patientId: patient._id, services: [], site })
      const id = r.data?.encounterId
      const existing = r.data?.existing
      if (id) {
        const params = new URLSearchParams({ id })
        if (existing) params.set('existing', '1')
        window.location.href = `/kham?${params.toString()}`
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Không tạo được lượt khám')
      setCheckingIn(false)
    }
  }

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
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-gray-900 truncate">{patient.name || '—'}</div>
            <div className="text-xs text-gray-500 font-mono mt-0.5">{patient.patientId || patient._id}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <select value={site} onChange={e => setSite(e.target.value)} disabled={checkingIn}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
              title="Cơ sở thực hiện lượt khám">
              {SITES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={checkIn} disabled={checkingIn}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
              {checkingIn ? 'Đang tiếp đón…' : '+ Tiếp đón'}
            </button>
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
          {(patient.guardianName || patient.guardianPhone) && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Người giám hộ</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-gray-500">Tên:</span> {patient.guardianName || '—'}</div>
                <div><span className="text-gray-500">Quan hệ:</span> {patient.guardianRelation || '—'}</div>
                <div className="col-span-2"><span className="text-gray-500">SĐT:</span> <span className="font-mono">{patient.guardianPhone || '—'}</span></div>
              </div>
            </section>
          )}
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
                        {(e.packages || []).length === 0
                          ? <span className="text-gray-400 italic">— chưa gán gói —</span>
                          : (e.packages || []).map(p => p.name).join(' + ')}
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

  // Packages have an alternate "matrix" view (services × packages grid).
  // Toggle persists in URL ?view=matrix so deep-links survive refreshes.
  const isPackages = activeKey === 'packages'
  const viewParam = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search).get('view') : null
  const [packagesView, setPackagesView] = useState(viewParam === 'matrix' ? 'matrix' : 'table')
  useEffect(() => {
    if (!isPackages) return
    const sp = new URLSearchParams(window.location.search)
    if (packagesView === 'matrix') sp.set('view', 'matrix'); else sp.delete('view')
    const next = sp.toString() ? `?${sp.toString()}` : ''
    if (window.location.search !== next) window.history.replaceState(null, '', `${window.location.pathname}${next}`)
  }, [isPackages, packagesView])

  const renderContent = () => {
    if (activeKey === 'hr-employees')    return <EmployeeSection />
    if (activeKey === 'hr-departments')  return <DepartmentSection />
    if (activeKey === 'hr-permissions')  return <PermissionMatrix />
    if (activeKey === 'report-templates') return <ReportTemplates />
    if (activeKey === 'patients')        return <PatientsTable />
    if (activeKey === 'promotions')      return <PromotionsTable canEdit={hasPerm('catalogs.manage')} />
    if (activeKey === 'promo-codes')     return <PromoCodesTable />
    if (isPackages && packagesView === 'matrix') return <PackagePriceMatrix canEdit={hasPerm(catalogEditPerm)} />
    if (CATALOG_FIELDS[activeKey])       return <CatalogTable catalogKey={activeKey} catalogLabel={activeLabel} canEdit={hasPerm(catalogEditPerm)} />
    return <div className="text-gray-400 text-sm p-4">Danh mục không tồn tại.</div>
  }

  const inProductCluster = PRODUCT_SERVICE_CLUSTER.some(c => c.key === activeKey)

  return (
    <div>
      <PageHeader breadcrumb={breadcrumb} userName={auth?.displayName || auth?.username} />
      {inProductCluster && (
        <div className="flex gap-1 mb-3 flex-wrap items-center">
          {PRODUCT_SERVICE_CLUSTER.map(c => (
            <Link key={c.key} to={`/catalogs/${c.key}`}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeKey === c.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <span className="mr-1">{c.icon}</span>{c.label}
            </Link>
          ))}
          {isPackages && (
            <div className="ml-auto inline-flex border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setPackagesView('table')}
                className={`px-3 py-1.5 text-xs font-medium ${packagesView === 'table' ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Danh sách
              </button>
              <button onClick={() => setPackagesView('matrix')}
                className={`px-3 py-1.5 text-xs font-medium ${packagesView === 'matrix' ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Bảng giá gói
              </button>
            </div>
          )}
        </div>
      )}
      {renderContent()}
    </div>
  )
}

// Subcatalogs that share the "Sản phẩm & Dịch vụ" sidebar entry. Kính and
// Thuốc moved to the Kho page on 2026-05-02 — they're physical inventory,
// not clinical billables. Sản phẩm & Dịch vụ is now clinical/service-only.
const PRODUCT_SERVICE_CLUSTER = [
  { key: 'services', label: 'Dịch vụ khám', icon: '📄' },
  { key: 'packages', label: 'Gói khám',     icon: '📦' },
]
