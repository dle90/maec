import React, { useEffect, useState } from 'react'
import { getAnnualPL } from '../api'

const fmt = (v) => {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (isNaN(n)) return '-'
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

const SITES = ['Hải Dương','Cà Mau','Thanh Hóa','Thái Nguyên','Thái Bình','Yết Kiêu','Nha Trang','Thạch Thất','Sóc Sơn']

export default function SitePL() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedSite, setSelectedSite] = useState(SITES[0])

  useEffect(() => {
    getAnnualPL().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Đang tải...</div>
  if (!data) return <div className="text-red-500 p-4">Lỗi tải dữ liệu</div>

  const rows = data.rows || []
  const revRow = rows.find(r => r.id === 'rev_total')
  const siteRev = Number(revRow?.values?.[selectedSite]) || 0

  const getVal = (id) => Number(rows.find(r => r.id === id)?.values?.[selectedSite]) || 0

  const sections = [
    {
      title: 'DOANH THU',
      items: [
        { label: 'MRI', id: 'rev_mri' },
        { label: 'CT', id: 'rev_ct' },
        { label: 'Mammo X-Quang', id: 'rev_mammo' },
        { label: 'X-Quang', id: 'rev_xq' },
        { label: 'Siêu âm', id: 'rev_ua' },
        { label: 'Tổng CĐHA', id: 'rev_cdha_total', isSubtotal: true },
        { label: 'Tổng Khác', id: 'rev_other', isSubtotal: true },
        { label: 'Tổng Doanh thu', id: 'rev_total', isTotal: true },
      ]
    },
    {
      title: 'BIẾN PHÍ',
      items: [
        { label: 'Vật tư tiêu hao', id: 'vc_vt' },
        { label: 'Chi phí đọc KQ online', id: 'vc_read' },
        { label: 'Tiền thuốc', id: 'vc_drug' },
        { label: 'Tư vấn chuyên môn', id: 'vc_consult' },
        { label: 'Thưởng HQKD', id: 'vc_bonus' },
        { label: 'Marketing', id: 'vc_mkt' },
        { label: 'Tổng Biến phí', id: 'vc_total', isSubtotal: true },
        { label: 'Lãi trên biến phí', id: 'cm', isTotal: true },
      ]
    },
    {
      title: 'ĐỊNH PHÍ',
      items: [
        { label: 'Chi phí nhân sự', id: 'fc_staff' },
        { label: 'Chi phí thuê địa điểm', id: 'fc_rent' },
        { label: 'Chi phí bảo dưỡng', id: 'fc_maintenance' },
        { label: 'Chi phí vận hành', id: 'fc_ops' },
        { label: 'Chi phí khác', id: 'fc_other' },
        { label: 'Tổng Định phí', id: 'fc_total', isSubtotal: true },
        { label: 'EBITDA tại chi nhánh', id: 'ebitda_site', isTotal: true },
      ]
    },
    {
      title: 'KẾT QUẢ CUỐI CÙNG',
      items: [
        { label: 'Chi phí lãi vay', id: 'interest' },
        { label: 'Khấu hao máy CĐHA', id: 'dep_machine' },
        { label: 'Khấu hao khác', id: 'dep_other' },
        { label: 'Lợi nhuận trước thuế', id: 'ebt', isTotal: true },
        { label: 'Chi phí thuế TNDN', id: 'tax' },
        { label: 'Lợi nhuận/(Lỗ) sau thuế', id: 'pat', isTotal: true },
      ]
    }
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">P&L Chi nhánh - Năm 2025</h2>
          <p className="text-xs text-gray-500 mt-0.5">Đơn vị: VND triệu</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 font-medium">Chọn chi nhánh:</label>
          <select
            value={selectedSite}
            onChange={e => setSelectedSite(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Site info card */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Doanh thu', id: 'rev_total' },
            { label: 'EBITDA', id: 'ebitda_site' },
            { label: 'Lợi nhuận trước thuế', id: 'ebt' },
            { label: 'Lợi nhuận sau thuế', id: 'pat' }
          ].map(kpi => {
            const val = getVal(kpi.id)
            return (
              <div key={kpi.id} className="text-center">
                <div className="text-xs text-gray-600">{kpi.label}</div>
                <div className={`text-lg font-bold ${val < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                  {fmt(val)}
                </div>
                <div className="text-xs text-gray-400">tr. VND</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#1e3a5f' }}>
              <th className="text-left px-4 py-3 text-white font-medium" style={{ width: '50%' }}>Chỉ tiêu</th>
              <th className="text-right px-4 py-3 text-white font-medium">{selectedSite}</th>
              <th className="text-right px-4 py-3 text-white font-medium">% Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <React.Fragment key={section.title}>
                <tr>
                  <td colSpan={3} className="px-4 py-2 bg-gray-100 font-bold text-gray-700 text-xs uppercase tracking-wide">
                    {section.title}
                  </td>
                </tr>
                {section.items.map(item => {
                  const val = getVal(item.id)
                  const pct = siteRev > 0 ? (val / siteRev * 100) : 0
                  const rowBg = item.isTotal ? 'bg-blue-50' : item.isSubtotal ? 'bg-gray-50' : 'bg-white'
                  const fontW = item.isTotal || item.isSubtotal ? 'font-semibold' : ''
                  const valColor = val < 0 ? 'text-red-600' : item.isTotal ? 'text-blue-700' : 'text-gray-700'

                  return (
                    <tr key={item.id} className={`${rowBg} border-b border-gray-100 hover:bg-yellow-50`}>
                      <td className={`px-4 py-2 ${fontW} text-gray-700`} style={{ paddingLeft: item.isTotal || item.isSubtotal ? '16px' : '32px' }}>
                        {item.label}
                      </td>
                      <td className={`px-4 py-2 text-right ${fontW} ${valColor}`}>
                        {fmt(val)}
                      </td>
                      <td className={`px-4 py-2 text-right text-gray-500 ${fontW}`}>
                        {siteRev > 0 ? pct.toFixed(1) + '%' : '-'}
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 italic text-center">
        Dữ liệu từ báo cáo hợp nhất năm 2025. Để chỉnh sửa, vui lòng sử dụng trang P&L Năm.
      </div>
    </div>
  )
}
