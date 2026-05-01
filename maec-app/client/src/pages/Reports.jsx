import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import api, { getDashboardToday, getDashboardExtras } from '../api'
import { useAuth } from '../context/AuthContext'
import DashboardClinical from './DashboardClinical'
import DashboardOps from './DashboardOps'
import {
  CasesByMachineReport, CasesByMachineGroupReport, CasesByRadiologistReport,
  CasesByRadiologistModalityReport, CasesByTimeReport, ServicesDetailReport,
  PatientListReport,
} from './RadiologyReports'
import {
  REPORT_GROUPS, REPORT_TO_GROUP, TOP_LEVEL,
  CA_CHUP_DIMENSIONS, DOANH_THU_DIMENSIONS,
} from '../config/reportGroups'

const LAST_REPORT_KEY = 'maec_last_report'

const fmtMoney = (v) => v == null ? '0' : Number(v).toLocaleString('vi-VN')
const fmtDate = (d) => {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('vi-VN')
}
const fmtTime = (d) => {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
const today = () => new Date().toISOString().slice(0, 10)

// R1 2026-04-24: 8-report REPORT_MENU replaced by reportGroups.js config.
// The 8 per-dimension renderers below are kept as exports and dispatched
// from the Doanh thu unified page via DOANH_THU_DIMENSIONS.

// ── Column groups (collapsible) ─────────────────────────
const COLUMN_GROUPS = [
  {
    key: 'basic', label: 'Cơ bản', defaultOpen: true,
    columns: [
      { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
      { key: 'branch', label: 'Chi nhánh', cls: 'font-medium' },
      { key: 'date', label: 'Ngày', render: r => fmtDate(r.date) },
      { key: 'time', label: 'Giờ', render: r => fmtTime(r.date) },
      { key: 'billingCode', label: 'Mã TK', cls: 'font-mono' },
    ],
  },
  {
    key: 'doctor', label: 'Bác sĩ', defaultOpen: true,
    columns: [
      { key: 'doctorCode', label: 'Mã bác sĩ', cls: 'font-mono' },
      { key: 'doctorName', label: 'Tên bác sĩ' },
      { key: 'doctorWorkplace', label: 'Nơi làm việc BS' },
      { key: 'doctorPhone', label: 'SĐT BS' },
    ],
  },
  {
    key: 'staff', label: 'NV theo dõi', defaultOpen: true,
    columns: [
      { key: 'staffCode', label: 'Mã NV theo dõi', cls: 'font-mono' },
      { key: 'staffName', label: 'Tên NV theo dõi' },
    ],
  },
  {
    key: 'patient', label: 'Khách hàng', defaultOpen: true,
    columns: [
      { key: 'patientCode', label: 'Mã khách hàng', cls: 'font-mono' },
      { key: 'patientName', label: 'Tên khách hàng' },
      { key: 'patientPhone', label: 'SĐT' },
      { key: 'patientAddress', label: 'Địa chỉ' },
      { key: 'patientDob', label: 'Ngày sinh', render: r => fmtDate(r.patientDob) },
      { key: 'patientIdCard', label: 'CCCD' },
    ],
  },
  {
    key: 'service', label: 'Dịch vụ', defaultOpen: true,
    columns: [
      { key: 'customerSource', label: 'Nguồn KH' },
      { key: 'serviceCode', label: 'Mã dịch vụ', cls: 'font-mono' },
      { key: 'serviceTypeCode', label: 'Mã loại dịch vụ', cls: 'font-mono' },
      { key: 'serviceName', label: 'Tên dịch vụ' },
    ],
  },
  {
    key: 'finance', label: 'Tài chính', defaultOpen: true,
    columns: [
      { key: 'unitPrice', label: 'Đơn giá', align: 'right', render: r => `${fmtMoney(r.unitPrice)} d` },
      { key: 'quantity', label: 'Số lượng', align: 'right', render: r => r.quantity ?? 1 },
      { key: 'subtotal', label: 'Thành tiền', align: 'right', render: r => `${fmtMoney(r.subtotal)} d` },
      { key: 'consultFee', label: 'Phí tư vấn', align: 'right', render: r => `${fmtMoney(r.consultFee)} d` },
      { key: 'revenue', label: 'Doanh thu', align: 'right', cls: 'font-medium', render: r => `${fmtMoney(r.revenue)} d` },
      { key: 'discount', label: 'Giảm giá', align: 'right', render: r => `${fmtMoney(r.discount)} d` },
      { key: 'collected', label: 'Đã thu', align: 'right', cls: 'text-green-700', render: r => `${fmtMoney(r.collected)} d` },
      { key: 'remaining', label: 'Còn phải thu', align: 'right', cls: 'text-red-600', render: r => `${fmtMoney(r.remaining)} d` },
    ],
  },
  {
    key: 'extra', label: 'Khác', defaultOpen: true,
    columns: [
      { key: 'injectionLot', label: 'Số lô thuốc tiêm' },
      { key: 'injectionType', label: 'Loại thuốc tiêm' },
      { key: 'notes', label: 'Ghi chú' },
      { key: 'paymentInfo', label: 'Thông tin thanh toán' },
      { key: 'paymentMethod', label: 'Hình thức thanh toán' },
    ],
  },
]

// ── Detailed Revenue Report ─────────────────────────────
export function RevenueDetailReport() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branchFilter, setBranchFilter] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState([])
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(COLUMN_GROUPS.map(g => [g.key, g.defaultOpen]))
  )

  useEffect(() => {
    api.get('/hr/departments?type=branch').then(r => setBranches(r.data)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { dateFrom, dateTo }
      if (branchFilter) params.branch = branchFilter
      const r = await api.get('/reports/revenue-detail', { params })
      setData(r.data)
    } catch { setData([]) }
    setLoading(false)
  }, [dateFrom, dateTo, branchFilter])

  useEffect(() => { load() }, [load])

  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  // Flatten visible columns
  const visibleColumns = COLUMN_GROUPS.flatMap(g =>
    openGroups[g.key] ? g.columns : []
  )
  const totalCols = visibleColumns.length

  return (
    <>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="border rounded px-2 py-1.5 text-sm" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
          <option value="">Chi nhánh (All)</option>
          {branches.map(b => <option key={b._id} value={b.name}>{b.name}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
      </div>

      {/* Column group toggles */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Nhóm cột:</span>
        {COLUMN_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => toggleGroup(g.key)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              openGroups[g.key]
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
            }`}
          >
            {openGroups[g.key] ? '−' : '+'} {g.label}
          </button>
        ))}
      </div>

      {/* Single wide table */}
      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            {/* Group header row */}
            <tr className="bg-[#152f4d] text-blue-300 text-xs">
              {COLUMN_GROUPS.map(g => {
                if (!openGroups[g.key]) return null
                return (
                  <th
                    key={g.key}
                    colSpan={g.columns.length}
                    className="px-3 py-1 text-center border-x border-blue-800 cursor-pointer hover:text-white"
                    onClick={() => toggleGroup(g.key)}
                    title={`Ẩn nhóm "${g.label}"`}
                  >
                    {g.label} <span className="opacity-50">−</span>
                  </th>
                )
              })}
            </tr>
            {/* Column header row */}
            <tr className="bg-[#1e3a5f] text-white text-left">
              {visibleColumns.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={totalCols} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={totalCols} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : data.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {visibleColumns.map(col => {
                  const val = col.render ? col.render(row, i) : (row[col.key] || '-')
                  return (
                    <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>
                      {val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Column Filter Dropdown ───────────────────────────────
const FILTER_OPS = [
  { value: 'eq', label: 'Equals', icon: '=' },
  { value: 'neq', label: 'Does not equal', icon: '!=' },
  { value: 'lt', label: 'Less than', icon: '<' },
  { value: 'gt', label: 'Greater than', icon: '>' },
  { value: 'lte', label: 'Less than or equal to', icon: '<=' },
  { value: 'gte', label: 'Greater than or equal to', icon: '>=' },
  { value: 'between', label: 'Between', icon: '...' },
  { value: 'reset', label: 'Reset', icon: '↺' },
]

function ColumnFilter({ colKey, filters, setFilters, isNumeric }) {
  const [open, setOpen] = useState(false)
  const [op, setOp] = useState(filters[colKey]?.op || '')
  const [val, setVal] = useState(filters[colKey]?.val || '')
  const [val2, setVal2] = useState(filters[colKey]?.val2 || '')
  const ref = React.useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const apply = (selectedOp) => {
    if (selectedOp === 'reset') {
      setOp(''); setVal(''); setVal2('')
      setFilters(prev => { const n = { ...prev }; delete n[colKey]; return n })
      setOpen(false)
      return
    }
    setOp(selectedOp)
  }

  const confirm = () => {
    if (op && val !== '') {
      setFilters(prev => ({ ...prev, [colKey]: { op, val, val2 } }))
    }
    setOpen(false)
  }

  const active = !!filters[colKey]

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`ml-1 text-xs ${active ? 'text-yellow-300' : 'text-blue-300 opacity-60 hover:opacity-100'}`}
        title="Lọc cột"
      >
        <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-xl z-50 w-48 text-gray-700 text-xs" onClick={e => e.stopPropagation()}>
          <div className="py-1">
            {FILTER_OPS.map(f => (
              <button
                key={f.value}
                onClick={() => apply(f.value)}
                className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2 ${op === f.value ? 'bg-blue-50 font-medium' : ''}`}
              >
                <span className="w-5 text-center text-gray-400">{f.icon}</span> {f.label}
              </button>
            ))}
          </div>
          {op && op !== 'reset' && (
            <div className="border-t px-3 py-2 space-y-1.5">
              <input
                type={isNumeric ? 'number' : 'text'}
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="Giá trị..."
                value={val}
                onChange={e => setVal(e.target.value)}
                autoFocus
              />
              {op === 'between' && (
                <input
                  type={isNumeric ? 'number' : 'text'}
                  className="w-full border rounded px-2 py-1 text-xs"
                  placeholder="Đến..."
                  value={val2}
                  onChange={e => setVal2(e.target.value)}
                />
              )}
              <button onClick={confirm} className="w-full bg-[#1e3a5f] text-white rounded py-1 text-xs hover:bg-[#2a4f7a]">Áp dụng</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function applyFilters(data, filters, cols) {
  if (Object.keys(filters).length === 0) return data
  return data.filter(row => {
    for (const [colKey, f] of Object.entries(filters)) {
      const col = cols.find(c => c.key === colKey)
      let rawVal = row[colKey]
      if (rawVal == null) rawVal = ''
      const isNum = col?.isNumeric
      const a = isNum ? Number(rawVal) : String(rawVal).toLowerCase()
      const b = isNum ? Number(f.val) : String(f.val).toLowerCase()
      const c = isNum ? Number(f.val2) : String(f.val2).toLowerCase()
      switch (f.op) {
        case 'eq': if (a !== b) return false; break
        case 'neq': if (a === b) return false; break
        case 'lt': if (a >= b) return false; break
        case 'gt': if (a <= b) return false; break
        case 'lte': if (a > b) return false; break
        case 'gte': if (a < b) return false; break
        case 'between': if (a < b || a > c) return false; break
      }
    }
    return true
  })
}

// ── Customer Detail Report ──────────────────────────────
const CUSTOMER_COLS = [
  { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400 w-10' },
  { key: 'date', label: 'Ngày', render: r => fmtDate(r.date), filterable: true },
  { key: 'patientName', label: 'Tên khách hàng', filterable: true },
  { key: 'patientAddress', label: 'Địa chỉ', filterable: true },
  { key: 'patientDob', label: 'Ngày sinh', render: r => fmtDate(r.patientDob), filterable: true },
  { key: 'amount', label: 'Số tiền', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.amount)} d` },
  { key: 'discount', label: 'Giảm giá', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.discount)} d` },
  { key: 'paid', label: 'Số tiền đã thanh toán', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.paid)} d` },
  { key: 'collected', label: 'Số tiền đã thu hộ', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.collected)} d` },
  { key: 'paymentMethod', label: 'Hình thức thanh toán', filterable: true },
]

export function CustomerDetailReport() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/reports/customer-detail', { params: { dateFrom, dateTo } })
      setData(r.data)
    } catch { setData([]) }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const filtered = applyFilters(data, filters, CUSTOMER_COLS)

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
        {Object.keys(filters).length > 0 && (
          <button onClick={() => setFilters({})} className="text-xs text-red-500 hover:text-red-700 ml-2">Xóa tất cả bộ lọc</button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a5f] text-white text-left">
              {CUSTOMER_COLS.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                  {col.filterable && (
                    <ColumnFilter colKey={col.key} filters={filters} setFilters={setFilters} isNumeric={col.isNumeric} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={CUSTOMER_COLS.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={CUSTOMER_COLS.length} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : filtered.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {CUSTOMER_COLS.map(col => {
                  const val = col.render ? col.render(row, i) : (row[col.key] || '-')
                  return (
                    <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>
                      {val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Promotion Detail Report ─────────────────────────────
const PROMO_COLS = [
  { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400 w-10' },
  { key: 'promoCode', label: 'Mã chương trình', cls: 'font-mono', filterable: true },
  { key: 'promoName', label: 'Tên chương trình', filterable: true },
  { key: 'date', label: 'Ngày', render: r => fmtDate(r.date), filterable: true },
  { key: 'patientName', label: 'Tên khách hàng', filterable: true },
  { key: 'patientAddress', label: 'Địa chỉ khách hàng', filterable: true },
  { key: 'paymentMethod', label: 'Hình thức thanh toán', filterable: true },
  { key: 'totalAmount', label: 'Tổng tiền', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.totalAmount)} d` },
  { key: 'discountAmount', label: 'Số tiền giảm giá', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.discountAmount)} d` },
  { key: 'netAmount', label: 'Tổng tiền thực thu', align: 'right', isNumeric: true, filterable: true, cls: 'font-medium', render: r => `${fmtMoney(r.netAmount)} d` },
]

export function PromotionDetailReport() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/reports/promotion-detail', { params: { dateFrom, dateTo } })
      setData(r.data)
    } catch { setData([]) }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const filtered = applyFilters(data, filters, PROMO_COLS)

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
        {Object.keys(filters).length > 0 && (
          <button onClick={() => setFilters({})} className="text-xs text-red-500 hover:text-red-700 ml-2">Xóa tất cả bộ lọc</button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a5f] text-white text-left">
              {PROMO_COLS.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                  {col.filterable && <ColumnFilter colKey={col.key} filters={filters} setFilters={setFilters} isNumeric={col.isNumeric} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={PROMO_COLS.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={PROMO_COLS.length} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : filtered.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {PROMO_COLS.map(col => {
                  const val = col.render ? col.render(row, i) : (row[col.key] || '-')
                  return <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>{val}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Pagination component ────────────────────────────────
function Pagination({ total, page, pageSize, setPage, setPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
      <div className="flex items-center gap-1">
        {[5, 10, 20].map(s => (
          <button key={s} onClick={() => { setPageSize(s); setPage(1) }}
            className={`px-2 py-1 rounded border ${pageSize === s ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-300 hover:bg-gray-100'}`}
          >{s}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span>Page {page} of {totalPages} ({total} items)</span>
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40">&lt;</button>
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40">&gt;</button>
      </div>
    </div>
  )
}

// ── Clinic Revenue Report ───────────────────────────────
const CLINIC_REV_COLS = [
  { key: 'stt', label: 'STT', render: (_, i, offset) => offset + i + 1, cls: 'text-gray-400 w-10' },
  { key: 'date', label: 'Ngày', render: r => fmtDate(r.date), filterable: true },
  { key: 'invoiceNumber', label: 'Mã hóa đơn', cls: 'font-mono', filterable: true },
  { key: 'doctorCode', label: 'Mã bác sĩ giới thiệu', cls: 'font-mono', filterable: true },
  { key: 'doctorName', label: 'Bác sĩ giới thiệu', filterable: true },
  { key: 'patientCode', label: 'Mã khách hàng', cls: 'font-mono', filterable: true },
  { key: 'patientName', label: 'Tên khách hàng', filterable: true },
  { key: 'patientAddress', label: 'Địa chỉ khách hàng', filterable: true },
  { key: 'patientDob', label: 'Ngày sinh', render: r => fmtDate(r.patientDob), filterable: true },
  { key: 'serviceTypeCode', label: 'Nhóm dịch vụ', filterable: true },
  { key: 'serviceName', label: 'Tên dịch vụ', filterable: true },
  { key: 'amount', label: 'Đơn tiền', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.amount)} d` },
  { key: 'discount', label: 'Giảm giá', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.discount)} d` },
  { key: 'netAmount', label: 'Tiền thực thu', align: 'right', isNumeric: true, filterable: true, cls: 'font-medium', render: r => `${fmtMoney(r.netAmount)} d` },
  { key: 'paymentMethod', label: 'Hình thức thanh toán', filterable: true },
]

export function ClinicRevenueReport() {
  const [tab, setTab] = useState('revenue') // revenue | collection
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/reports/clinic-revenue', { params: { dateFrom, dateTo, tab } })
      setData(r.data)
      setPage(1)
    } catch { setData([]) }
    setLoading(false)
  }, [dateFrom, dateTo, tab])

  useEffect(() => { load() }, [load])

  const filtered = applyFilters(data, filters, CLINIC_REV_COLS)
  const offset = (page - 1) * pageSize
  const paged = filtered.slice(offset, offset + pageSize)

  return (
    <>
      {/* Tabs */}
      <div className="flex mb-4 border-b">
        <button onClick={() => { setTab('revenue'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'revenue' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          DOANH THU
        </button>
        <button onClick={() => { setTab('collection'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'collection' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          THU HỘ
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
        {Object.keys(filters).length > 0 && (
          <button onClick={() => setFilters({})} className="text-xs text-red-500 hover:text-red-700 ml-2">Xóa tất cả bộ lọc</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a5f] text-white text-left">
              {CLINIC_REV_COLS.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                  {col.filterable && <ColumnFilter colKey={col.key} filters={filters} setFilters={setFilters} isNumeric={col.isNumeric} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={CLINIC_REV_COLS.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={CLINIC_REV_COLS.length} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : paged.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {CLINIC_REV_COLS.map(col => {
                  const val = col.render ? col.render(row, i, offset) : (row[col.key] || '-')
                  return <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>{val}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </>
  )
}

// ── Refund / Exchange Report ─────────────────────────────
const REFUND_COLS = [
  { key: 'stt', label: 'STT', render: (_, i, offset) => offset + i + 1, cls: 'text-gray-400 w-10' },
  { key: 'date', label: 'Ngày', render: r => fmtDate(r.date), filterable: true },
  { key: 'invoiceNumber', label: 'Mã hóa đơn', cls: 'font-mono', filterable: true },
  { key: 'doctorCode', label: 'Mã bác sĩ giới thiệu', cls: 'font-mono', filterable: true },
  { key: 'doctorName', label: 'Bác sĩ giới thiệu', filterable: true },
  { key: 'patientCode', label: 'Mã khách hàng', cls: 'font-mono', filterable: true },
  { key: 'patientName', label: 'Tên khách hàng', filterable: true },
  { key: 'patientAddress', label: 'Địa chỉ khách hàng', filterable: true },
  { key: 'patientDob', label: 'Ngày sinh', render: r => fmtDate(r.patientDob), filterable: true },
  { key: 'serviceTypeCode', label: 'Nhóm dịch vụ', filterable: true },
  { key: 'serviceName', label: 'Tên dịch vụ', filterable: true },
  { key: 'amount', label: 'Đơn tiền', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.amount)} d` },
  { key: 'discount', label: 'Giảm giá', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.discount)} d` },
  { key: 'netAmount', label: 'Tiền thực thu', align: 'right', isNumeric: true, filterable: true, cls: 'font-medium', render: r => `${fmtMoney(r.netAmount)} d` },
  { key: 'reason', label: 'Lý do hoàn trả', filterable: true },
  { key: 'paymentMethod', label: 'Hình thức thanh toán', filterable: true },
]

export function RefundExchangeReport() {
  const [tab, setTab] = useState('refund') // refund | exchange
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/reports/refund-exchange', { params: { dateFrom, dateTo, tab } })
      setData(r.data)
      setPage(1)
    } catch { setData([]) }
    setLoading(false)
  }, [dateFrom, dateTo, tab])

  useEffect(() => { load() }, [load])

  const filtered = applyFilters(data, filters, REFUND_COLS)
  const offset = (page - 1) * pageSize
  const paged = filtered.slice(offset, offset + pageSize)

  return (
    <>
      {/* Tabs */}
      <div className="flex mb-4 border-b">
        <button onClick={() => { setTab('refund'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'refund' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          HOÀN TRẢ
        </button>
        <button onClick={() => { setTab('exchange'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'exchange' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ĐỔI DỊCH VỤ
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
        {Object.keys(filters).length > 0 && (
          <button onClick={() => setFilters({})} className="text-xs text-red-500 hover:text-red-700 ml-2">Xóa tất cả bộ lọc</button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a5f] text-white text-left">
              {REFUND_COLS.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                  {col.filterable && <ColumnFilter colKey={col.key} filters={filters} setFilters={setFilters} isNumeric={col.isNumeric} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={REFUND_COLS.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={REFUND_COLS.length} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : paged.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {REFUND_COLS.map(col => {
                  const val = col.render ? col.render(row, i, offset) : (row[col.key] || '-')
                  return <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>{val}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </>
  )
}

// ── E-Invoice Report ────────────────────────────────────
const EINVOICE_COLS = [
  { key: 'stt', label: 'STT', render: (_, i, offset) => offset + i + 1, cls: 'text-gray-400 w-10' },
  { key: 'date', label: 'Ngày', render: r => fmtDate(r.date), filterable: true },
  { key: 'invoiceNumber', label: 'Mã hóa đơn', cls: 'font-mono', filterable: true },
  { key: 'patientName', label: 'Tên khách hàng', filterable: true },
  { key: 'patientPhone', label: 'SĐT', filterable: true },
  { key: 'email', label: 'Email', filterable: true },
  { key: 'patientAddress', label: 'Địa chỉ', filterable: true },
  { key: 'patientCode', label: 'Mã khách hàng', cls: 'font-mono', filterable: true },
  { key: 'amount', label: 'Tiền chưa xuất', align: 'right', isNumeric: true, filterable: true, render: r => `${fmtMoney(r.amount)} d` },
]

export function EInvoiceReport() {
  const [tab, setTab] = useState('not_issued') // not_issued | issued
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [data, setData] = useState([])
  const [stats, setStats] = useState({ notIssuedCount: 0, notIssuedTotal: 0, issuedCount: 0, issuedTotal: 0 })
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/reports/e-invoice', { params: { dateFrom, dateTo, tab } })
      setData(r.data.rows)
      setStats(r.data.stats)
      setPage(1)
    } catch { setData([]); setStats({ notIssuedCount: 0, notIssuedTotal: 0, issuedCount: 0, issuedTotal: 0 }) }
    setLoading(false)
  }, [dateFrom, dateTo, tab])

  useEffect(() => { load() }, [load])

  const filtered = applyFilters(data, filters, EINVOICE_COLS)
  const offset = (page - 1) * pageSize
  const paged = filtered.slice(offset, offset + pageSize)

  const StatCard = ({ icon, color, label, value }) => (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-lg text-white ${color}`}>
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">{icon}</div>
      <div><div className="text-xs opacity-80">{label}</div><div className="text-lg font-bold">{value}</div></div>
    </div>
  )

  // Columns adjust based on tab
  const cols = tab === 'issued'
    ? EINVOICE_COLS.map(c => c.key === 'amount' ? { ...c, label: 'Tổng tiền', key: 'amount' } : c)
    : EINVOICE_COLS

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard icon="📄" color="bg-[#1e3a5f]" label="Số hóa đơn chưa xuất" value={stats.notIssuedCount} />
        <StatCard icon="💰" color="bg-[#1e3a5f]" label="Tổng tiền chưa xuất" value={`${fmtMoney(stats.notIssuedTotal)} d`} />
        <StatCard icon="✅" color="bg-[#1e3a5f]" label="Số hóa đơn đã xuất" value={stats.issuedCount} />
        <StatCard icon="📈" color="bg-[#1e3a5f]" label="Tổng tiền đã xuất" value={`${fmtMoney(stats.issuedTotal)} d`} />
      </div>

      {/* Tabs */}
      <div className="flex mb-4 border-b">
        <button onClick={() => { setTab('not_issued'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'not_issued' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          HÓA ĐƠN CHƯA XUẤT
        </button>
        <button onClick={() => { setTab('issued'); setFilters({}) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'issued' ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          HÓA ĐƠN ĐÃ XUẤT
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm text-gray-600">Ngày:</div>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <span className="text-xs text-gray-400 ml-2">Ngày: {fmtDate(dateFrom)} - {fmtDate(dateTo)}</span>
        {Object.keys(filters).length > 0 && (
          <button onClick={() => setFilters({})} className="text-xs text-red-500 hover:text-red-700 ml-2">Xóa tất cả bộ lọc</button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 24rem)' }}>
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1e3a5f] text-white text-left">
              {cols.map(col => (
                <th key={col.key} className={`px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.label}
                  {col.filterable && <ColumnFilter colKey={col.key} filters={filters} setFilters={setFilters} isNumeric={col.isNumeric} />}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right">Tổng tiền</th>
              <th className="px-3 py-2.5 text-center w-16">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : paged.map((row, i) => (
              <tr key={row._id || i} className="border-t hover:bg-blue-50/50">
                {cols.map(col => {
                  const val = col.render ? col.render(row, i, offset) : (row[col.key] || '-')
                  return <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.cls || 'text-gray-600'}`}>{val}</td>
                })}
                <td className="px-3 py-2 text-right font-medium">{fmtMoney(row.amount)} d</td>
                <td className="px-3 py-2 text-center">
                  <button className="text-[#1e3a5f] hover:text-blue-800" title={tab === 'not_issued' ? 'Xuất hóa đơn' : 'Tải hóa đơn'}>
                    <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </>
  )
}

// ── Referral Revenue Report ─────────────────────────────
export function ReferralRevenueReport() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branch, setBranch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [branches, setBranches] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/hr/departments?type=branch').then(r => setBranches(r.data)).catch(() => {}) }, [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { dateFrom, dateTo }
      if (branch) params.branch = branch
      if (typeFilter) params.referralType = typeFilter
      const r = await api.get('/reports/referral-revenue', { params })
      setRows(r.data.rows || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [dateFrom, dateTo, branch, typeFilter])
  useEffect(() => { load() }, [load])

  const total = rows.reduce((s, r) => ({
    invoiceCount: s.invoiceCount + r.invoiceCount,
    grandTotal: s.grandTotal + r.grandTotal,
    paidAmount: s.paidAmount + r.paidAmount,
    outstanding: s.outstanding + r.outstanding,
  }), { invoiceCount: 0, grandTotal: 0, paidAmount: 0, outstanding: 0 })

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input type="date" className="border rounded px-2 py-1 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">→</span>
        <input type="date" className="border rounded px-2 py-1 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="border rounded px-2 py-1 text-sm" value={branch} onChange={e => setBranch(e.target.value)}>
          <option value="">Tất cả cơ sở</option>
          {branches.map(b => <option key={b._id} value={b.name}>{b.name}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="doctor">Bác sĩ giới thiệu</option>
          <option value="facility">Cơ sở giới thiệu</option>
          <option value="salesperson">Nhân viên kinh doanh</option>
        </select>
      </div>
      <div className="bg-white rounded-lg border overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="bg-[#1e3a5f] text-white text-left text-xs">
            <th className="px-3 py-2.5 w-8">STT</th>
            <th className="px-3 py-2.5">Loại</th>
            <th className="px-3 py-2.5">Đối tác / Nguồn</th>
            <th className="px-3 py-2.5">NVKD theo dõi</th>
            <th className="px-3 py-2.5 text-right">Số HĐ</th>
            <th className="px-3 py-2.5 text-right">Số DV</th>
            <th className="px-3 py-2.5 text-right">Doanh thu</th>
            <th className="px-3 py-2.5 text-right">Đã thu</th>
            <th className="px-3 py-2.5 text-right">Còn phải thu</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            : rows.map((r, i) => (
              <tr key={`${r.referralType}-${r.referralId || r.sourceCode || i}`} className="border-t hover:bg-blue-50/50">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2">{r.referralTypeLabel}</td>
                <td className="px-3 py-2 font-medium">{r.referralName || '-'}</td>
                <td className="px-3 py-2 text-gray-600">{r.effectiveSalespersonName || '-'}</td>
                <td className="px-3 py-2 text-right">{r.invoiceCount}</td>
                <td className="px-3 py-2 text-right">{r.serviceCount}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.grandTotal)} đ</td>
                <td className="px-3 py-2 text-right text-green-700">{fmtMoney(r.paidAmount)} đ</td>
                <td className="px-3 py-2 text-right text-red-600">{fmtMoney(r.outstanding)} đ</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="bg-gray-50 border-t font-semibold text-sm">
              <td className="px-3 py-2" colSpan={4}>Tổng</td>
              <td className="px-3 py-2 text-right">{total.invoiceCount}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right">{fmtMoney(total.grandTotal)} đ</td>
              <td className="px-3 py-2 text-right text-green-700">{fmtMoney(total.paidAmount)} đ</td>
              <td className="px-3 py-2 text-right text-red-600">{fmtMoney(total.outstanding)} đ</td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Salesperson (NVKD) KPI Report ───────────────────────
function SalespersonKpiReport() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/hr/departments?type=branch').then(r => setBranches(r.data)).catch(() => {}) }, [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { dateFrom, dateTo }
      if (branch) params.branch = branch
      const r = await api.get('/reports/salesperson-kpi', { params })
      setRows(r.data.rows || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [dateFrom, dateTo, branch])
  useEffect(() => { load() }, [load])

  const total = rows.reduce((s, r) => ({
    invoiceCount: s.invoiceCount + r.invoiceCount,
    directCount: s.directCount + r.directCount,
    viaDoctorCount: s.viaDoctorCount + r.viaDoctorCount,
    viaFacilityCount: s.viaFacilityCount + r.viaFacilityCount,
    grandTotal: s.grandTotal + r.grandTotal,
    paidAmount: s.paidAmount + r.paidAmount,
    outstanding: s.outstanding + r.outstanding,
  }), { invoiceCount: 0, directCount: 0, viaDoctorCount: 0, viaFacilityCount: 0, grandTotal: 0, paidAmount: 0, outstanding: 0 })

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <input type="date" className="border rounded px-2 py-1 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">→</span>
        <input type="date" className="border rounded px-2 py-1 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="border rounded px-2 py-1 text-sm" value={branch} onChange={e => setBranch(e.target.value)}>
          <option value="">Tất cả cơ sở</option>
          {branches.map(b => <option key={b._id} value={b.name}>{b.name}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-lg border overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="bg-[#1e3a5f] text-white text-left text-xs">
            <th className="px-3 py-2.5 w-8">STT</th>
            <th className="px-3 py-2.5">Mã NVKD</th>
            <th className="px-3 py-2.5">Tên NVKD</th>
            <th className="px-3 py-2.5">Cơ sở</th>
            <th className="px-3 py-2.5 text-right">Trực tiếp</th>
            <th className="px-3 py-2.5 text-right">Qua BS</th>
            <th className="px-3 py-2.5 text-right">Qua cơ sở</th>
            <th className="px-3 py-2.5 text-right">Tổng HĐ</th>
            <th className="px-3 py-2.5 text-right">Doanh thu</th>
            <th className="px-3 py-2.5 text-right">Đã thu</th>
            <th className="px-3 py-2.5 text-right">Còn phải thu</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            : rows.map((r, i) => (
              <tr key={r.salespersonId} className="border-t hover:bg-blue-50/50">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.salespersonId}</td>
                <td className="px-3 py-2 font-medium">{r.salespersonName}</td>
                <td className="px-3 py-2 text-gray-600">{r.department || '-'}</td>
                <td className="px-3 py-2 text-right">{r.directCount}</td>
                <td className="px-3 py-2 text-right">{r.viaDoctorCount}</td>
                <td className="px-3 py-2 text-right">{r.viaFacilityCount}</td>
                <td className="px-3 py-2 text-right font-medium">{r.invoiceCount}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.grandTotal)} đ</td>
                <td className="px-3 py-2 text-right text-green-700">{fmtMoney(r.paidAmount)} đ</td>
                <td className="px-3 py-2 text-right text-red-600">{fmtMoney(r.outstanding)} đ</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="bg-gray-50 border-t font-semibold text-sm">
              <td className="px-3 py-2" colSpan={4}>Tổng</td>
              <td className="px-3 py-2 text-right">{total.directCount}</td>
              <td className="px-3 py-2 text-right">{total.viaDoctorCount}</td>
              <td className="px-3 py-2 text-right">{total.viaFacilityCount}</td>
              <td className="px-3 py-2 text-right">{total.invoiceCount}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(total.grandTotal)} đ</td>
              <td className="px-3 py-2 text-right text-green-700">{fmtMoney(total.paidAmount)} đ</td>
              <td className="px-3 py-2 text-right text-red-600">{fmtMoney(total.outstanding)} đ</td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN REPORTS PAGE (R1 unified 2026-04-24)
// ══════════════════════════════════════════════════════════

function ReportPageHeader({ breadcrumb, userName }) {
  const date = new Date()
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b bg-white -mx-4 -mt-4 mb-4">
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold text-gray-800">Báo cáo</div>
        <div className="text-xs text-gray-400 font-mono">/báo cáo</div>
      </div>
      <div className="flex-1 text-xs text-gray-500">{breadcrumb}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {userName && <span className="px-2 py-1 bg-gray-100 rounded-md">👤 {userName}</span>}
        <span className="px-2 py-1 bg-gray-100 rounded-md">{dateStr}</span>
      </div>
    </div>
  )
}

// ── Shared report chrome (R2b 2026-04-24, per Claude Design) ───────────────
// Two distinct rows under the PageHeader:
//   1. FilterBar — scope (Kỳ/date + Chi nhánh + contextual filter)
//   2. Dimension bar — organization (Xem theo primary pills + × chia theo chip)
// Keeping them separate lets the user scan scope and grouping as two thoughts.

// Date presets: design calls for Hôm nay / Tháng này / Quý này / Tùy chỉnh.
const DATE_PRESETS = [
  { key: 'today',   label: 'Hôm nay' },
  { key: 'month',   label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
  { key: 'custom',  label: 'Tùy chỉnh' },
]
function presetRange(key) {
  const now = new Date()
  const iso = d => d.toISOString().slice(0, 10)
  if (key === 'today')   { const d = iso(now); return { from: d, to: d } }
  if (key === 'month')   { const d = new Date(now.getFullYear(), now.getMonth(), 1); return { from: iso(d), to: iso(now) } }
  if (key === 'quarter') { const q = Math.floor(now.getMonth() / 3) * 3; const d = new Date(now.getFullYear(), q, 1); return { from: iso(d), to: iso(now) } }
  return null
}
function fmtDMY(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

function useBranchOptions() {
  const [branches, setBranches] = useState([])
  useEffect(() => {
    api.get('/hr/departments?type=branch').then(r => setBranches(r.data || [])).catch(() => {})
  }, [])
  return branches
}

// ReportFilterBar — the top scope row. Date preset pills + custom range
// (when "Tùy chỉnh" is selected) + site + contextual extras rendered in the
// `extra` slot by the report using it.
function ReportFilterBar({ filters, setFilters, extra }) {
  const branches = useBranchOptions()
  const preset = filters.preset || 'month'
  const setPreset = (key) => {
    const range = presetRange(key)
    setFilters(f => ({ ...f, preset: key, ...(range ? { dateFrom: range.from, dateTo: range.to } : {}) }))
  }
  return (
    <div className="flex items-center gap-2 mb-2 flex-wrap bg-white rounded-lg border border-gray-200 px-3 py-2">
      <span className="text-xs text-gray-500">Kỳ:</span>
      {DATE_PRESETS.map(p => {
        const active = p.key === preset
        return (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>
            {p.label}
          </button>
        )
      })}
      {preset === 'custom' && (
        <>
          <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs" value={filters.dateFrom || ''} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs" value={filters.dateTo || ''} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        </>
      )}
      {preset !== 'custom' && filters.dateFrom && (
        <span className="text-xs text-gray-400">{fmtDMY(filters.dateFrom)} – {fmtDMY(filters.dateTo)}</span>
      )}
      <span className="text-gray-300 mx-1">|</span>
      <span className="text-xs text-gray-500">Chi nhánh:</span>
      <select
        className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
        value={filters.site || ''}
        onChange={e => setFilters(f => ({ ...f, site: e.target.value }))}
      >
        <option value="">Tất cả ({branches.length})</option>
        {branches.map(b => <option key={b._id} value={b.name}>{b.name}</option>)}
      </select>
      {extra && <><span className="text-gray-300 mx-1">|</span>{extra}</>}
    </div>
  )
}

// DimensionBar — "Xem theo" primary dimension picker + optional × chia theo
// cross-tab chip. `× chia theo` is disabled in R2b (stacked chart + matrix
// table land in R2d polish). Matches Claude Design Fig. 2/3/4 layout.
function DimensionBar({ dimensions, primary, onPrimary, secondary, onSecondary, disabled }) {
  return (
    <div className="flex items-center gap-1 mb-3 flex-wrap">
      <span className="text-xs text-gray-500 mr-1">Xem theo</span>
      {dimensions.map(d => {
        const isActive = d.key === primary
        const cls = isActive
          ? 'px-3 py-1.5 rounded-full bg-blue-600 text-white'
          : 'px-3 py-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200'
        return (
          <button key={d.key} onClick={() => !disabled && onPrimary(d.key)} disabled={disabled}
            className={`text-xs font-semibold transition-colors ${cls} ${disabled ? 'opacity-50' : ''}`}>
            {d.label}
          </button>
        )
      })}
      <span className="text-gray-300 ml-1">·</span>
      <button
        disabled
        title="Tính năng cross-tab sẽ thêm ở R2d"
        className="px-3 py-1.5 rounded-full text-xs font-semibold text-gray-400 border border-dashed border-gray-300 cursor-not-allowed"
      >
        × chia theo
      </button>
    </div>
  )
}

// Chế độ toggle (Doanh thu + Sổ kho only) — Xem tổng hợp (grouped/charted)
// vs Xem từng dòng (raw paginated rows, no chart, dimension bar hidden).
function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 mr-1">Chế độ</span>
      {[
        { key: 'agg', label: 'Xem tổng hợp' },
        { key: 'raw', label: 'Xem từng dòng' },
      ].map(m => {
        const active = m.key === mode
        const cls = active
          ? 'px-3 py-1.5 rounded-full bg-blue-600 text-white'
          : 'px-3 py-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200'
        return (
          <button key={m.key} onClick={() => onChange(m.key)} className={`text-xs font-semibold transition-colors ${cls}`}>
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

// Unified Ca chụp / Ca đọc report — wraps the 7 per-dimension renderers from
// RadiologyReports.jsx behind one group-by picker. Each dimension owns its
// own internal filter state for R1; shared FilterBar is a later polish.
const CA_CHUP_RENDERERS = {
  'cases-by-machine':              CasesByMachineReport,
  'cases-by-machine-group':        CasesByMachineGroupReport,
  'cases-by-radiologist':          CasesByRadiologistReport,
  'cases-by-radiologist-modality': CasesByRadiologistModalityReport,
  'cases-by-time':                 CasesByTimeReport,
  'services-detail':               ServicesDetailReport,
  'patient-list':                  PatientListReport,
}
function monthAgo() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }
function todayStr() { return new Date().toISOString().slice(0, 10) }

// Unified Ca chụp / Ca đọc — shared FilterBar + DimensionBar, then dispatch
// to the existing per-dim renderer (still fetches & renders its own table).
// Summary strip + horizontal bar chart derived-from-rows come in a later
// polish pass; focus of R2b is the chrome unification.
function CaChupReport() {
  const initial = presetRange('month')
  const [dim, setDim] = useState('cases-by-time')
  const [filters, setFilters] = useState({ preset: 'month', dateFrom: initial.from, dateTo: initial.to, modality: '', site: '', granularity: 'day' })
  const Renderer = CA_CHUP_RENDERERS[dim]
  const modalityExtra = (
    <>
      <span className="text-xs text-gray-500">Modality:</span>
      <select
        className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
        value={filters.modality || ''}
        onChange={e => setFilters(f => ({ ...f, modality: e.target.value }))}
      >
        <option value="">Tất cả</option>
        {['CT','MRI','XR','US'].map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </>
  )
  return (
    <>
      <ReportFilterBar filters={filters} setFilters={setFilters} extra={modalityExtra} />
      <DimensionBar dimensions={CA_CHUP_DIMENSIONS} primary={dim} onPrimary={setDim} />
      {Renderer ? <Renderer filters={filters} /> : <div className="text-sm text-gray-400 p-4">Không có bộ hiển thị phù hợp.</div>}
    </>
  )
}

// Unified Doanh thu report — each per-dim business report is self-contained
// with its own internal filter state, so the unified page is just a picker
// that swaps the active renderer. Shared top-level filter bar is a future
// consolidation.
const DOANH_THU_RENDERERS = {
  'revenue-detail':    RevenueDetailReport,
  'clinic-revenue':    ClinicRevenueReport,
  'customer-detail':   CustomerDetailReport,
  'referral-revenue':  ReferralRevenueReport,
  'promotion-detail':  PromotionDetailReport,
  'refund-exchange':   RefundExchangeReport,
  'e-invoice':         EInvoiceReport,
}
// Unified Doanh thu — FilterBar + Chế độ toggle + DimensionBar (hidden in raw
// mode) + per-dim renderer. Chế độ maps agg-mode to the dim-specific grouped
// renderer, raw-mode to the plain revenue-detail ledger.
const DOANH_THU_STATUSES = [
  { key: '',           label: 'Tất cả' },
  { key: 'paid',       label: 'Đã thanh toán' },
  { key: 'refunded',   label: 'Hoàn trả' },
  { key: 'e_invoiced', label: 'Đã xuất HĐĐT' },
]
function DoanhThuReport() {
  const initial = presetRange('month')
  const [mode, setMode] = useState('agg')
  const [dim, setDim] = useState('clinic-revenue')
  const [filters, setFilters] = useState({ preset: 'month', dateFrom: initial.from, dateTo: initial.to, site: '', status: '' })
  // Raw mode always renders the detail ledger; agg mode renders the
  // currently-selected dimension's grouped renderer.
  const Renderer = mode === 'raw' ? DOANH_THU_RENDERERS['revenue-detail'] : DOANH_THU_RENDERERS[dim]
  const statusExtra = (
    <>
      <span className="text-xs text-gray-500">Trạng thái:</span>
      <select
        className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
        value={filters.status || ''}
        onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
      >
        {DOANH_THU_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </>
  )
  return (
    <>
      <ReportFilterBar filters={filters} setFilters={setFilters} extra={statusExtra} />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === 'agg' && (
          <>
            <span className="text-gray-300 mx-1">·</span>
            <DimensionBar dimensions={DOANH_THU_DIMENSIONS.filter(d => d.key !== 'revenue-detail')} primary={dim} onPrimary={setDim} />
          </>
        )}
      </div>
      {Renderer ? <Renderer /> : <div className="text-sm text-gray-400 p-4">Không có bộ hiển thị phù hợp.</div>}
    </>
  )
}

// ── Tổng Quan executive dashboard (R2a 2026-04-24) ────────────────────────
// The morning read. Triage alert strip at top (renders only when alerts
// exist), then 3 persona rows (Lâm sàng / Vận Hành / Tài Chính) of KPI tiles
// with delta chips + sparklines where available. Tile-click deep-links into
// the corresponding detail report. Semantic color lives on the delta chip
// only — the KPI value itself stays neutral regardless of health (alert
// fatigue avoidance per Claude Design 2026-04-23).
//
// Data source: reuses existing /api/dashboard/today + /dashboard/extras
// endpoints that already power the 3 persona dashboards. No new server code
// for R2a; a proper /api/reports/overview-kpis with date-range + MoM data
// comes in a later pass.

const fmtCount = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN'))
const fmtVND = (n) => {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + ' tr'
  return Number(n).toLocaleString('vi-VN')
}
const fmtTATMin = (m) => {
  if (m == null) return '—'
  if (m < 60) return `${m} phút`
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}h${r ? ' ' + r + 'p' : ''}`
}
const deltaPct = (cur, prev) => {
  if (prev == null || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

function DeltaChip({ pct, invertColor }) {
  if (pct == null) return null
  const up = pct > 0
  const positive = invertColor ? !up : up
  const bg = pct === 0 ? 'bg-gray-100 text-gray-500' : positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
  const arrow = pct === 0 ? '·' : up ? '↑' : '↓'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${bg}`}>
      {arrow}{Math.abs(pct)}%
    </span>
  )
}

function Sparkline({ data, color = '#3b82f6', height = 28 }) {
  if (!Array.isArray(data) || data.length < 2) return <div className="h-7" />
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map(v => ({ v }))}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpiTile({ label, value, sub, deltaPct: dp, invertDelta, sparkline, sparkColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-between h-full ${onClick ? 'hover:shadow-md hover:border-blue-200 transition-all cursor-pointer' : ''}`}
      disabled={!onClick}
    >
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-2xl font-semibold text-gray-900">{value}</div>
          <DeltaChip pct={dp} invertColor={invertDelta} />
        </div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {sparkline && <div className="mt-2"><Sparkline data={sparkline} color={sparkColor} /></div>}
    </button>
  )
}

function PersonaRow({ label, detailKey, detailLabel, children }) {
  const nav = useNavigate()
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
        <button onClick={() => nav(`/reports/${detailKey}`)} className="text-xs text-blue-600 hover:underline">
          Tổng quan {detailLabel} →
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  )
}

function TriageStrip({ items }) {
  if (!items?.length) return null
  const total = items.reduce((s, i) => s + (i.count || 0), 0)
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-3">
      <div className="text-rose-600 text-lg leading-none mt-0.5">⚠</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-rose-800">
          {total === 1 ? '1 vấn đề cần xử lý hôm nay' : `${total} vấn đề cần xử lý hôm nay`}
        </div>
        <div className="text-xs text-rose-700 mt-0.5">
          {items.map(i => `${i.count} ${i.label}`).join(' · ')}
        </div>
      </div>
    </div>
  )
}

function TongQuan() {
  const nav = useNavigate()
  const [today, setToday] = useState(null)
  const [extras, setExtras] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getDashboardToday(), getDashboardExtras()])
      .then(([t, e]) => { if (!alive) return; setToday(t); setExtras(e); setLoading(false) })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  if (loading) return <div className="p-6 text-sm text-gray-400">Đang tải Tổng Quan...</div>
  if (!today || !extras) return <div className="p-6 text-sm text-rose-600">Không tải được dữ liệu tổng quan.</div>

  const s = today.summary || {}
  const casesSpark = (extras.casesLast7Days || []).map(d => d.count)
  const todayDelta = deltaPct(s.todayCount, s.yesterdayCount)
  const triageItems = [
    s.criticalCount > 0 && { count: s.criticalCount, label: 'cảnh báo quan trọng chưa xử lý' },
    s.lowStockCount > 0 && { count: s.lowStockCount, label: 'vật tư dưới định mức' },
    (extras.expiringLots?.count || 0) > 0 && { count: extras.expiringLots.count, label: 'lô sắp hết hạn' },
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <TriageStrip items={triageItems} />

      {/* LÂM SÀNG */}
      <PersonaRow label="Lâm sàng" detailKey="lam-sang-overview" detailLabel="Lâm sàng">
        <KpiTile
          label="Ca chụp hôm nay"
          value={fmtCount(s.todayCount)}
          sub={`${fmtCount(s.yesterdayCount)} hôm qua`}
          deltaPct={todayDelta}
          sparkline={casesSpark}
          sparkColor="#3b82f6"
          onClick={() => nav('/reports/ca-chup-doc')}
        />
        <KpiTile
          label="Ca đọc hôm nay"
          value={fmtCount(extras.reportedTodayCount)}
          sub={`${fmtCount(s.pendingCount)} đang chờ đọc`}
          onClick={() => nav('/reports/ca-chup-doc')}
        />
        <KpiTile
          label="TAT trung bình"
          value={fmtTATMin(extras.avgTATMinutes)}
          sub="studyDate → reportedAt (hôm nay)"
          onClick={() => nav('/reports/ca-chup-doc')}
        />
        <KpiTile
          label="Cảnh báo quan trọng"
          value={fmtCount(s.criticalCount)}
          sub="chưa xử lý"
          deltaPct={null}
          onClick={() => nav('/ris?view=critical')}
        />
      </PersonaRow>

      {/* VẬN HÀNH */}
      <PersonaRow label="Vận Hành" detailKey="van-hanh-overview" detailLabel="Vận Hành">
        <KpiTile
          label="Doanh thu hôm nay"
          value={fmtVND(s.revenueToday)}
          sub={`${fmtCount(s.invoiceCountToday)} phiếu thu`}
          sparkColor="#10b981"
          onClick={() => nav('/reports/doanh-thu')}
        />
        <KpiTile
          label="Ca đang chờ xử lý"
          value={fmtCount(s.pendingCount)}
          sub="scheduled · in_progress · pending_read · reading"
          onClick={() => nav('/ris')}
        />
        <KpiTile
          label="Vật tư dưới định mức"
          value={fmtCount(s.lowStockCount)}
          sub="cần nhập thêm"
          invertDelta
          onClick={() => nav('/inventory')}
        />
        <KpiTile
          label="Lô sắp hết hạn"
          value={fmtCount(extras.expiringLots?.count)}
          sub="trong 30 ngày"
          invertDelta
          onClick={() => nav('/inventory')}
        />
      </PersonaRow>

      <div className="text-xs text-gray-400 text-right">
        Dữ liệu cập nhật {new Date(today.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

// ── Kho reports (R2c 2026-04-24) ──────────────────────────────────────────
// Two reports share the inventory data layer — Tiêu thụ vật tư (aggregated
// consumption view) and Sổ kho (raw transaction ledger). Both read from
// /api/inventory/transactions; only the chrome differs.

const TX_TYPE_LABELS = {
  import: 'Nhập kho', export: 'Xuất kho', adjustment: 'Điều chỉnh',
  auto_deduct: 'Trừ tự động', transfer_out: 'Chuyển đi', transfer_in: 'Chuyển đến',
}
const TX_TYPE_CLS = {
  import: 'bg-teal-50 text-teal-700 border-teal-200',
  export: 'bg-orange-50 text-orange-700 border-orange-200',
  adjustment: 'bg-slate-50 text-slate-700 border-slate-200',
  auto_deduct: 'bg-purple-50 text-purple-700 border-purple-200',
  transfer_out: 'bg-amber-50 text-amber-700 border-amber-200',
  transfer_in: 'bg-blue-50 text-blue-700 border-blue-200',
}
// Types that increase on-hand stock vs decrease — used for the +/- delta sign
// on each ledger row.
const TX_INCOMING = new Set(['import', 'transfer_in'])

function useInventoryTransactions(filters) {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    const params = { limit: 500 }
    if (filters.dateFrom) params.dateFrom = filters.dateFrom
    if (filters.dateTo) params.dateTo = filters.dateTo
    if (filters.type) params.type = filters.type
    if (filters.supplyId) params.supplyId = filters.supplyId
    api.get('/inventory/transactions', { params })
      .then(r => setTxs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false))
  }, [filters.dateFrom, filters.dateTo, filters.type, filters.supplyId, filters.site])
  return { txs, loading }
}

// Sổ kho — the transaction ledger. Filter chips per transaction type (with
// counts), four-number summary, row-per-transaction table with color-coded
// type bullet, signed quantity delta, phiếu number. Row-click drills into
// /inventory with the transaction pre-selected (future polish).
function SoKhoReport() {
  const initial = presetRange('month')
  const [filters, setFilters] = useState({ preset: 'month', dateFrom: initial.from, dateTo: initial.to, site: '', type: '', supplyId: '' })
  const { txs, loading } = useInventoryTransactions(filters)

  const counts = {}
  let totalIn = 0, totalOut = 0, totalValue = 0
  for (const t of txs) {
    counts[t.type] = (counts[t.type] || 0) + 1
    const qty = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
    if (TX_INCOMING.has(t.type)) totalIn += qty; else totalOut += qty
    totalValue += t.totalAmount || 0
  }

  return (
    <>
      <ReportFilterBar filters={filters} setFilters={setFilters} />

      {/* Transaction-type filter chips (counts reflect the current date + site filter) */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Loại GD:</span>
        {[{ key: '', label: 'Tất cả', n: txs.length }].concat(
          Object.entries(TX_TYPE_LABELS).map(([k, label]) => ({ key: k, label, n: counts[k] || 0 }))
        ).map(chip => {
          const active = chip.key === filters.type
          const cls = active
            ? 'px-3 py-1 rounded-full bg-blue-600 text-white'
            : 'px-3 py-1 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200'
          return (
            <button key={chip.key} onClick={() => setFilters(f => ({ ...f, type: chip.key }))}
              className={`text-xs font-semibold transition-colors ${cls}`}>
              {chip.label} <span className="opacity-70">({chip.n})</span>
            </button>
          )
        })}
      </div>

      {/* Summary strip — 4 numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Tổng giao dịch', value: fmtCount(txs.length) },
          { label: 'Tổng nhập',      value: fmtCount(totalIn) },
          { label: 'Tổng xuất',      value: fmtCount(totalOut) },
          { label: 'Tổng giá trị',   value: fmtVND(totalValue) + ' đ' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className="text-xl font-semibold text-gray-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Phiếu</th>
              <th className="px-4 py-3">Kho</th>
              <th className="px-4 py-3">Lý do / ghi chú</th>
              <th className="px-4 py-3 text-right">Dòng VT</th>
              <th className="px-4 py-3 text-right">Biến động</th>
              <th className="px-4 py-3 text-right">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : txs.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Không có giao dịch trong kỳ.</td></tr>
            : txs.map(t => {
              const qty = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
              const incoming = TX_INCOMING.has(t.type)
              const sign = incoming ? '+' : '−'
              const signCls = incoming ? 'text-emerald-700' : 'text-rose-600'
              return (
                <tr key={t._id} className="border-t border-gray-100 hover:bg-blue-50/50">
                  <td className="px-4 py-2.5 text-xs text-gray-500">{t.createdAt?.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${TX_TYPE_CLS[t.type] || 'bg-gray-50 border-gray-200'}`}>
                      {TX_TYPE_LABELS[t.type] || t.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{t.transactionNumber}</td>
                  <td className="px-4 py-2.5 text-gray-700">{t.warehouseName || t.warehouseId || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 truncate max-w-xs">{t.reason || t.supplierName || t.counterpartyWarehouseName || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{(t.items || []).length}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${signCls}`}>{sign}{qty}</td>
                  <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">{fmtVND(t.totalAmount || 0)} đ</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400 mt-2 text-right">
        {txs.length > 0 && `Hiển thị ${txs.length} giao dịch gần nhất`}
      </div>
    </>
  )
}

// Tiêu thụ vật tư — consumption aggregated by supply (or by warehouse / time
// depending on dimension). R2c ships with group-by supply as the default;
// group-by warehouse / time derive from the same transaction stream.
const TIEU_THU_DIMENSIONS = [
  { key: 'supply',    label: 'Vật tư' },
  { key: 'warehouse', label: 'Kho' },
  { key: 'type',      label: 'Loại giao dịch' },
]
function TieuThuVatTuReport() {
  const initial = presetRange('month')
  const [dim, setDim] = useState('supply')
  const [filters, setFilters] = useState({ preset: 'month', dateFrom: initial.from, dateTo: initial.to, site: '' })
  // For consumption we pre-filter to outgoing types (export + auto_deduct).
  const { txs, loading } = useInventoryTransactions({ ...filters, type: '' })
  const outgoing = txs.filter(t => !TX_INCOMING.has(t.type) && t.type !== 'adjustment')

  // Aggregate by the selected dimension.
  const agg = new Map()
  for (const t of outgoing) {
    for (const it of t.items || []) {
      let k, label
      if (dim === 'supply')    { k = it.supplyId || it.supplyCode;  label = it.supplyName || it.supplyCode || '?' }
      else if (dim === 'warehouse') { k = t.warehouseId;            label = t.warehouseName || t.warehouseId || '?' }
      else                     { k = t.type;                        label = TX_TYPE_LABELS[t.type] || t.type }
      if (!agg.has(k)) agg.set(k, { key: k, label, qty: 0, value: 0, txCount: 0 })
      const row = agg.get(k)
      row.qty += it.quantity || 0
      row.value += (it.quantity || 0) * (it.unitPrice || 0)
      row.txCount += 1
    }
  }
  const rows = [...agg.values()].sort((a, b) => b.qty - a.qty)
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.value, 0)

  return (
    <>
      <ReportFilterBar filters={filters} setFilters={setFilters} />
      <DimensionBar dimensions={TIEU_THU_DIMENSIONS} primary={dim} onPrimary={setDim} />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Tổng dòng', value: fmtCount(rows.length) },
          { label: 'Tổng lượng tiêu thụ', value: fmtCount(totalQty) },
          { label: 'Tổng giá trị', value: fmtVND(totalValue) + ' đ' },
          { label: 'Số giao dịch', value: fmtCount(outgoing.length) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className="text-xl font-semibold text-gray-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
              <th className="px-4 py-3">{TIEU_THU_DIMENSIONS.find(d => d.key === dim)?.label || 'Nhóm'}</th>
              <th className="px-4 py-3 text-right">Số giao dịch</th>
              <th className="px-4 py-3 text-right">Lượng tiêu thụ</th>
              <th className="px-4 py-3 text-right">Tổng giá trị</th>
              <th className="px-4 py-3">Tỉ trọng</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Không có tiêu thụ trong kỳ.</td></tr>
            : rows.map(r => {
              const pct = totalQty > 0 ? Math.round((r.qty / totalQty) * 100) : 0
              return (
                <tr key={r.key} className="border-t border-gray-100 hover:bg-blue-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.label}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{r.txCount}</td>
                  <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums font-semibold">{fmtCount(r.qty)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtVND(r.value)} đ</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded bg-blue-100 flex-1 max-w-[120px]">
                        <div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-8">{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function Reports() {
  const { auth } = useAuth()
  const { reportKey } = useParams()
  const activeKey = reportKey || ''

  useEffect(() => {
    if (activeKey) try { localStorage.setItem(LAST_REPORT_KEY, activeKey) } catch {}
  }, [activeKey])

  if (!activeKey) {
    let remembered = null
    try { remembered = localStorage.getItem(LAST_REPORT_KEY) } catch {}
    const valid = remembered && (remembered === TOP_LEVEL.key || REPORT_TO_GROUP[remembered])
    return <Navigate to={`/reports/${valid ? remembered : TOP_LEVEL.key}`} replace />
  }

  // Breadcrumb
  const top = activeKey === TOP_LEVEL.key ? TOP_LEVEL : null
  const groupInfo = REPORT_TO_GROUP[activeKey]
  const breadcrumb = top
    ? <b className="text-gray-700">Tổng Quan</b>
    : groupInfo
      ? <>{groupInfo.group.label} · <b className="text-gray-700">{groupInfo.item.label}</b></>
      : 'Không tìm thấy'

  const renderContent = () => {
    if (activeKey === TOP_LEVEL.key)        return <TongQuan />
    if (activeKey === 'lam-sang-overview')  return <DashboardClinical />
    if (activeKey === 'van-hanh-overview')  return <DashboardOps />
    if (activeKey === 'ca-chup-doc')        return <CaChupReport />
    if (activeKey === 'doanh-thu')          return <DoanhThuReport />
    if (activeKey === 'so-kho')             return <SoKhoReport />
    if (activeKey === 'tieu-thu-vat-tu')    return <TieuThuVatTuReport />
    return <div className="text-gray-400 text-sm p-4">Báo cáo không tồn tại.</div>
  }

  return (
    <div>
      <ReportPageHeader breadcrumb={breadcrumb} userName={auth?.displayName || auth?.username} />
      {renderContent()}
    </div>
  )
}
