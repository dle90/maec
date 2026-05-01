// Shared Báo cáo tree config — consumed by both the main sidebar (Layout)
// and the reports page (Reports) so nav + content agree on structure.
//
// R1 (2026-04-24) consolidates 15 previous reports + 3 persona dashboards
// into a single Báo cáo surface:
//   - 4 top-level groups (Tổng Quan / Lâm sàng / Vận Hành / Tài Chính)
//   - 7 leaf surfaces total (down from 18)
//   - Each persona group has a Tổng quan landing (re-using old
//     /dashboard/{clinical,ops,finance} pages wrapped in new chrome)
//   - 2 unified detail reports (Ca chụp/Ca đọc + Doanh thu) with a
//     group-by dimension picker that dispatches to the existing per-dim
//     renderers from RadiologyReports.jsx + Reports.jsx.

export const REPORT_GROUPS = [
  {
    key: 'lam-sang',
    label: 'Lâm sàng',
    items: [
      { key: 'lam-sang-overview', label: 'Tổng quan', icon: '🩺' },
      { key: 'ca-chup-doc',       label: 'Ca chụp / Ca đọc', icon: '🩻' },
    ],
  },
  {
    key: 'van-hanh',
    label: 'Vận Hành',
    items: [
      { key: 'van-hanh-overview', label: 'Tổng quan',      icon: '⚙️' },
      { key: 'tieu-thu-vat-tu',   label: 'Tiêu thụ vật tư', icon: '📦' },
      { key: 'so-kho',            label: 'Sổ kho',         icon: '📘' },
    ],
  },
  {
    key: 'tai-chinh',
    label: 'Tài Chính',
    items: [
      { key: 'doanh-thu', label: 'Doanh thu', icon: '💰' },
    ],
  },
]

// Tổng Quan is a leaf at the very top — executive roll-up across all 3
// personas. R1 ships as a placeholder tile grid; R2 fills it with real KPIs.
export const TOP_LEVEL = { key: 'tong-quan', label: 'Tổng Quan', icon: '📊' }

// Flat lookup: { reportKey → { group, item } } for breadcrumb / IA.
export const REPORT_TO_GROUP = Object.fromEntries(
  REPORT_GROUPS.flatMap(g => g.items.map(i => [i.key, { group: g, item: i }]))
)

export const DEFAULT_REPORT_KEY = TOP_LEVEL.key

// Dimension pickers per unified report. Each dimension maps to the legacy
// sub-report key so the unified page can dispatch to the existing renderer
// (RevenueDetailReport, CasesByMachineReport, etc.) without rewriting them.
// As we consolidate server endpoints we can drop the legacy mapping.
export const CA_CHUP_DIMENSIONS = [
  { key: 'cases-by-time',                label: 'Thời gian' },
  { key: 'cases-by-machine',             label: 'Máy' },
  { key: 'cases-by-machine-group',       label: 'Nhóm máy' },
  { key: 'cases-by-radiologist',         label: 'BS đọc' },
  { key: 'cases-by-radiologist-modality',label: 'BS × Modality' },
  { key: 'services-detail',              label: 'Dịch vụ' },
  { key: 'patient-list',                 label: 'Bệnh nhân' },
]

export const DOANH_THU_DIMENSIONS = [
  { key: 'revenue-detail',    label: 'Chi tiết' },
  { key: 'clinic-revenue',    label: 'Chi nhánh' },
  { key: 'customer-detail',   label: 'Khách hàng' },
  { key: 'referral-revenue',  label: 'Đối tác GT' },
  { key: 'promotion-detail',  label: 'Khuyến mãi' },
  { key: 'refund-exchange',   label: 'Hoàn trả / đổi' },
  { key: 'e-invoice',         label: 'Hóa đơn điện tử' },
]
