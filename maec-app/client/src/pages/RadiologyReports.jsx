import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

function SummaryStrip({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500 uppercase">{s.label}</div>
          <div className={`text-xl font-bold mt-1 ${s.color || 'text-gray-800'}`}>{s.value}</div>
          {s.sub && <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, height = 220 }) {
  return (
    <div className="bg-white rounded-lg border p-3 mb-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Operational radiology reports — RIS analytics
// (separate from financial reports in /reports)
// ──────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('vi-VN')
}
const today = () => new Date().toISOString().slice(0, 10)
const monthAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const REPORT_MENU = [
  { key: 'cases-by-machine',             label: 'Số ca theo máy',                       icon: '🖥️' },
  { key: 'cases-by-machine-group',       label: 'Số ca theo nhóm máy (modality)',       icon: '📦' },
  { key: 'cases-by-radiologist',         label: 'Số ca theo bác sỹ đọc',                icon: '👨‍⚕️' },
  { key: 'cases-by-radiologist-modality', label: 'Bác sỹ đọc × loại máy (cross-tab)',   icon: '📋' },
  { key: 'cases-by-time',                label: 'Thống kê theo thời gian',              icon: '🕒' },
  { key: 'services-detail',              label: 'Chi tiết dịch vụ ca theo máy',         icon: '📄' },
  { key: 'patient-list',                 label: 'DS bệnh nhân đã đọc kết quả',          icon: '🧑' },
]

const MODALITIES = [
  { v: '', label: 'Tất cả' },
  { v: 'CT', label: 'CT' },
  { v: 'MRI', label: 'MRI' },
  { v: 'XR', label: 'X-Quang' },
  { v: 'US', label: 'Siêu âm' },
]

// ── Filter bar ────────────────────────────────────────────────
export function FilterBar({ filters, setFilters, granularityToggle = false }) {
  const upd = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  return (
    <div className="flex items-center gap-3 mb-3 flex-wrap bg-white rounded-lg border p-3">
      <div className="text-sm text-gray-600">Từ ngày:</div>
      <input type="date" className="border rounded px-2 py-1.5 text-sm" value={filters.dateFrom || ''} onChange={e => upd('dateFrom', e.target.value)} />
      <span className="text-gray-400">-</span>
      <div className="text-sm text-gray-600">Đến ngày:</div>
      <input type="date" className="border rounded px-2 py-1.5 text-sm" value={filters.dateTo || ''} onChange={e => upd('dateTo', e.target.value)} />
      <select className="border rounded px-2 py-1.5 text-sm" value={filters.modality || ''} onChange={e => upd('modality', e.target.value)}>
        {MODALITIES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
      </select>
      <input
        type="text" placeholder="Mã máy/site"
        className="border rounded px-2 py-1.5 text-sm w-32"
        value={filters.site || ''} onChange={e => upd('site', e.target.value)}
      />
      {granularityToggle && (
        <select className="border rounded px-2 py-1.5 text-sm" value={filters.granularity || 'hour'} onChange={e => upd('granularity', e.target.value)}>
          <option value="hour">Theo giờ</option>
          <option value="day">Theo ngày</option>
          <option value="weekday">Theo thứ trong tuần</option>
        </select>
      )}
    </div>
  )
}

// ── Reusable table with sticky header ─────────────────────────
function ReportTable({ columns, rows, loading, footerRow }) {
  return (
    <div className="bg-white rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10 bg-[#1e3a5f] text-white text-left">
          <tr>
            {columns.map(c => (
              <th key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
          ) : rows.map((row, i) => (
            <tr key={row._id || row.patientId || row.radiologist || row.site || row.modality || row.bucket || i} className="border-t hover:bg-blue-50/50">
              {columns.map(c => {
                const val = c.render ? c.render(row, i) : (row[c.key] ?? '-')
                return (
                  <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${c.cls || 'text-gray-700'}`}>
                    {val}
                  </td>
                )
              })}
            </tr>
          ))}
          {footerRow && (
            <tr className="bg-gray-50 border-t font-semibold">
              {columns.map(c => (
                <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} text-gray-800`}>
                  {footerRow[c.key] ?? ''}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Per-report components ─────────────────────────────────────

function useReportLoader(endpoint, filters) {
  const [data, setData] = useState({ rows: [] })
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(endpoint, { params: filters })
      setData(r.data || { rows: [] })
    } catch {
      setData({ rows: [] })
    }
    setLoading(false)
  }, [endpoint, JSON.stringify(filters)])
  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}

export function CasesByMachineReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/cases-by-machine', filters)
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'site', label: 'Máy / Site', cls: 'font-medium' },
    { key: 'count', label: 'Số ca', align: 'right', cls: 'font-mono text-blue-700' },
    { key: 'modalityBreakdown', label: 'Phân loại modality', cls: 'text-gray-500 text-xs' },
    { key: 'percent', label: '% tổng', align: 'right', render: r => r.percent + '%', cls: 'font-mono text-gray-500' },
  ]
  const total = data.rows.reduce((s, r) => s + r.count, 0)
  const top = data.rows[0]
  return (
    <>
      <SummaryStrip stats={[
        { label: 'Tổng ca', value: total, color: 'text-blue-700' },
        { label: 'Số máy/site', value: data.rows.length },
        { label: 'Site cao nhất', value: top?.site || '-', sub: top ? `${top.count} ca · ${top.percent}%` : '' },
        { label: 'TB / site', value: data.rows.length ? Math.round(total / data.rows.length) : 0 },
      ]} />
      <ChartCard title="Số ca theo máy / site">
        <BarChart data={data.rows.slice(0, 12)}>
          <XAxis dataKey="site" stroke="#9ca3af" fontSize={11} angle={-15} textAnchor="end" height={60} />
          <YAxis stroke="#9ca3af" fontSize={11} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ReportTable columns={cols} rows={data.rows} loading={loading} footerRow={{ site: 'TỔNG', count: total, percent: '100.0%' }} />
    </>
  )
}

export function CasesByMachineGroupReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/cases-by-machine-group', filters)
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'modality', label: 'Nhóm máy (Modality)', cls: 'font-medium' },
    { key: 'count', label: 'Số ca', align: 'right', cls: 'font-mono text-blue-700' },
    { key: 'siteCount', label: 'Số site', align: 'right', cls: 'font-mono' },
    { key: 'radiologistCount', label: 'Số BS đọc', align: 'right', cls: 'font-mono' },
    { key: 'percent', label: '% tổng', align: 'right', render: r => r.percent + '%', cls: 'font-mono text-gray-500' },
  ]
  const total = data.rows.reduce((s, r) => s + r.count, 0)
  return (
    <>
      <SummaryStrip stats={[
        { label: 'Tổng ca', value: total, color: 'text-blue-700' },
        { label: 'Số nhóm máy', value: data.rows.length },
        { label: 'Top modality', value: data.rows[0]?.modality || '-', sub: data.rows[0] ? `${data.rows[0].count} ca` : '' },
        { label: 'Tổng site phủ', value: data.rows.reduce((s, r) => s + r.siteCount, 0) },
      ]} />
      <ChartCard title="Tỷ lệ theo nhóm máy" height={240}>
        <PieChart>
          <Pie data={data.rows} dataKey="count" nameKey="modality" cx="50%" cy="50%" outerRadius={80} label={r => `${r.modality}: ${r.count}`}>
            {data.rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12 }} />
        </PieChart>
      </ChartCard>
      <ReportTable columns={cols} rows={data.rows} loading={loading} footerRow={{ modality: 'TỔNG', count: total, percent: '100.0%' }} />
    </>
  )
}

export function CasesByRadiologistReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/cases-by-radiologist', filters)
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'radiologist', label: 'Tài khoản', cls: 'font-mono text-xs' },
    { key: 'radiologistName', label: 'Tên BS đọc', cls: 'font-medium' },
    { key: 'count', label: 'Số ca đọc', align: 'right', cls: 'font-mono text-blue-700' },
    { key: 'modalityBreakdown', label: 'Phân loại', cls: 'text-gray-500 text-xs' },
    { key: 'avgTurnaroundHours', label: 'TAT trung bình (giờ)', align: 'right', cls: 'font-mono text-gray-600' },
    { key: 'percent', label: '% tổng', align: 'right', render: r => r.percent + '%', cls: 'font-mono text-gray-500' },
  ]
  const total = data.rows.reduce((s, r) => s + r.count, 0)
  const tatValues = data.rows.map(r => parseFloat(r.avgTurnaroundHours)).filter(n => !isNaN(n))
  const avgTat = tatValues.length ? (tatValues.reduce((s, n) => s + n, 0) / tatValues.length).toFixed(1) : '-'
  return (
    <>
      <SummaryStrip stats={[
        { label: 'Tổng ca đọc', value: total, color: 'text-blue-700' },
        { label: 'Số BS hoạt động', value: data.rows.length },
        { label: 'Top BS', value: data.rows[0]?.radiologistName || '-', sub: data.rows[0] ? `${data.rows[0].count} ca` : '' },
        { label: 'TAT trung bình', value: avgTat + 'h', color: 'text-amber-700' },
      ]} />
      <ChartCard title="Top 12 bác sĩ đọc theo số ca">
        <BarChart data={data.rows.slice(0, 12)} layout="vertical" margin={{ left: 80 }}>
          <XAxis type="number" stroke="#9ca3af" fontSize={11} />
          <YAxis type="category" dataKey="radiologistName" stroke="#9ca3af" fontSize={10} width={120} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>
      <ReportTable columns={cols} rows={data.rows} loading={loading} footerRow={{ radiologistName: 'TỔNG', count: total, percent: '100.0%' }} />
    </>
  )
}

export function CasesByRadiologistModalityReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/cases-by-radiologist-modality', filters)
  const modalities = data.modalities || []
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'radiologistName', label: 'Bác sỹ đọc', cls: 'font-medium' },
    ...modalities.map(m => ({ key: 'm_' + m, label: m, align: 'right', cls: 'font-mono text-blue-700' })),
    { key: 'total', label: 'Tổng', align: 'right', cls: 'font-mono text-gray-800 font-semibold' },
  ]
  // Footer row: column totals
  const totals = { radiologistName: 'TỔNG' }
  modalities.forEach(m => {
    totals['m_' + m] = data.rows.reduce((s, r) => s + (r['m_' + m] || 0), 0)
  })
  totals.total = data.rows.reduce((s, r) => s + r.total, 0)
  return <ReportTable columns={cols} rows={data.rows} loading={loading} footerRow={totals} />
}

export function CasesByTimeReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/cases-by-time', filters)
  const max = Math.max(1, ...data.rows.map(r => r.count))
  const cols = [
    { key: 'bucket', label: filters.granularity === 'day' ? 'Ngày' : filters.granularity === 'weekday' ? 'Thứ' : 'Khung giờ', cls: 'font-mono' },
    { key: 'count', label: 'Số ca', align: 'right', cls: 'font-mono text-blue-700' },
    {
      key: 'bar',
      label: 'Phân bổ',
      render: r => (
        <div className="w-full bg-gray-100 rounded h-3 overflow-hidden">
          <div className="bg-blue-500 h-3" style={{ width: `${(r.count / max * 100).toFixed(1)}%` }} />
        </div>
      ),
    },
  ]
  const total = data.rows.reduce((s, r) => s + r.count, 0)
  const peak = data.rows.reduce((p, r) => r.count > (p?.count || 0) ? r : p, null)
  return (
    <>
      <SummaryStrip stats={[
        { label: 'Tổng ca', value: total, color: 'text-blue-700' },
        { label: 'Số khung giờ có ca', value: data.rows.length },
        { label: 'Khung cao điểm', value: peak?.bucket || '-', sub: peak ? `${peak.count} ca` : '', color: 'text-amber-700' },
        { label: 'TB / khung', value: data.rows.length ? Math.round(total / data.rows.length) : 0 },
      ]} />
      <ChartCard title={`Phân bổ ${filters.granularity === 'day' ? 'theo ngày' : filters.granularity === 'weekday' ? 'theo thứ' : 'theo giờ'}`}>
        <LineChart data={data.rows}>
          <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={11} />
          <YAxis stroke="#9ca3af" fontSize={11} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
      <ReportTable columns={cols} rows={data.rows} loading={loading} footerRow={{ bucket: 'TỔNG', count: total }} />
    </>
  )
}

export function ServicesDetailReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/services-detail', { ...filters, includeAll: 1 })
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'studyDate', label: 'Ngày chụp', render: r => fmtDate(r.studyDate) },
    { key: 'patientId', label: 'PID', cls: 'font-mono text-xs' },
    { key: 'patientName', label: 'Bệnh nhân', cls: 'font-medium' },
    { key: 'gender', label: 'GT', align: 'center' },
    { key: 'modality', label: 'Loại', cls: 'font-mono' },
    { key: 'bodyPart', label: 'Bộ phận' },
    { key: 'site', label: 'Site' },
    { key: 'priority', label: 'Ưu tiên' },
    { key: 'status', label: 'Trạng thái', cls: 'text-xs' },
    { key: 'technicianName', label: 'KTV' },
    { key: 'radiologistName', label: 'BS đọc' },
    { key: 'reportedAt', label: 'Đọc xong', render: r => fmtDate(r.reportedAt) },
    { key: 'imageCount', label: 'Ảnh', align: 'right', cls: 'font-mono text-gray-500' },
  ]
  return <ReportTable columns={cols} rows={data.rows} loading={loading} />
}

export function PatientListReport({ filters }) {
  const { data, loading } = useReportLoader('/reports/rad/patient-list', filters)
  const cols = [
    { key: 'stt', label: 'STT', render: (_, i) => i + 1, cls: 'text-gray-400' },
    { key: 'patientId', label: 'Mã BN', cls: 'font-mono text-xs' },
    { key: 'patientName', label: 'Tên bệnh nhân', cls: 'font-medium' },
    { key: 'gender', label: 'GT', align: 'center' },
    { key: 'dob', label: 'Năm sinh', render: r => (r.dob || '').slice(0, 4) || '-' },
    { key: 'studyCount', label: 'Số ca', align: 'right', cls: 'font-mono text-blue-700' },
    { key: 'modalities', label: 'Modalities', cls: 'text-xs text-gray-500' },
    { key: 'lastStudyDate', label: 'Lần chụp gần nhất', render: r => fmtDate(r.lastStudyDate) },
    { key: 'lastRadiologist', label: 'BS đọc gần nhất' },
  ]
  return <ReportTable columns={cols} rows={data.rows} loading={loading} />
}

// ══════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function RadiologyReports() {
  const { reportKey } = useParams()
  const activeKey = reportKey || 'cases-by-machine'
  const activeMenu = REPORT_MENU.find(i => i.key === activeKey)
  const [filters, setFilters] = useState({ dateFrom: monthAgo(), dateTo: today(), modality: '', site: '', granularity: 'hour' })

  const renderReport = () => {
    switch (activeKey) {
      case 'cases-by-machine':              return <CasesByMachineReport filters={filters} />
      case 'cases-by-machine-group':        return <CasesByMachineGroupReport filters={filters} />
      case 'cases-by-radiologist':          return <CasesByRadiologistReport filters={filters} />
      case 'cases-by-radiologist-modality': return <CasesByRadiologistModalityReport filters={filters} />
      case 'cases-by-time':                 return <CasesByTimeReport filters={filters} />
      case 'services-detail':               return <ServicesDetailReport filters={filters} />
      case 'patient-list':                  return <PatientListReport filters={filters} />
      default:                              return <div className="text-gray-400 text-sm p-4">Chọn báo cáo</div>
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{activeMenu?.icon} {activeMenu?.label || 'Báo cáo vận hành'}</h3>
      <FilterBar filters={filters} setFilters={setFilters} granularityToggle={activeKey === 'cases-by-time'} />
      {renderReport()}
    </div>
  )
}

export { REPORT_MENU as RAD_REPORT_MENU }
