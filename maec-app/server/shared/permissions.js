/**
 * Canonical permission definitions for RBAC
 * Keys are used in RolePermission.permissions[] arrays
 * Values are Vietnamese labels for the UI
 */
const PERMISSIONS = {
  // Lâm sàng / workflow
  'registration.view': 'Xem đăng ký',
  'registration.manage': 'Quản lý đăng ký',
  'ris.view': 'Xem ca chụp (RIS)',
  'ris.manage': 'Quản lý ca chụp',
  'teleradiology.view': 'Xem đọc phim',
  'teleradiology.manage': 'Quản lý đọc phim',
  'tasks.view': 'Xem công việc',
  'tasks.manage': 'Quản lý công việc',
  'consumables.record': 'Ghi nhận vật tư tiêu hao',
  // Viện phí
  'billing.view': 'Xem viện phí',
  'billing.manage': 'Quản lý viện phí',
  'billing.refund': 'Hoàn tiền',
  // Kho
  'inventory.view': 'Xem kho',
  'inventory.manage': 'Quản lý kho',
  // Báo cáo
  'reports.view': 'Xem báo cáo chung',
  'rad-reports.view': 'Xem BC điện quang',
  'kpi-sales.view': 'Xem KPI NVKD',
  // Đối tác / giới thiệu
  'referral.view': 'Xem nguồn giới thiệu',
  'partners.manage': 'Quản lý đối tác',
  // Tài chính
  'financials.view': 'Xem tài chính',
  'financials.manage': 'Nhập số liệu tài chính',
  // CRM / Marketing
  'crm.view': 'Xem CRM',
  'marketing.view': 'Xem marketing',
  // Danh mục
  'catalogs.view': 'Xem danh mục',
  'catalogs.manage': 'Quản lý danh mục',
  // Nhân sự
  'hr.view': 'Xem nhân sự',
  'hr.manage': 'Quản lý nhân sự',
  'audit.view': 'Xem nhật ký hệ thống',
  // Hệ thống
  'system.admin': 'Quản trị hệ thống',
}

/**
 * Group permissions for the UI matrix display
 */
const PERMISSION_GROUPS = [
  { key: 'clinical', label: 'Lâm sàng', perms: ['registration.view', 'registration.manage', 'ris.view', 'ris.manage', 'teleradiology.view', 'teleradiology.manage', 'tasks.view', 'tasks.manage', 'consumables.record'] },
  { key: 'billing', label: 'Viện phí', perms: ['billing.view', 'billing.manage', 'billing.refund'] },
  { key: 'inventory', label: 'Kho', perms: ['inventory.view', 'inventory.manage'] },
  { key: 'reports', label: 'Báo cáo', perms: ['reports.view', 'rad-reports.view', 'kpi-sales.view'] },
  { key: 'partners', label: 'Đối tác', perms: ['referral.view', 'partners.manage'] },
  { key: 'financials', label: 'Tài chính', perms: ['financials.view', 'financials.manage'] },
  { key: 'crm', label: 'CRM & Marketing', perms: ['crm.view', 'marketing.view'] },
  { key: 'catalogs', label: 'Danh mục', perms: ['catalogs.view', 'catalogs.manage'] },
  { key: 'hr', label: 'Nhân sự', perms: ['hr.view', 'hr.manage', 'audit.view'] },
  { key: 'system', label: 'Hệ thống', perms: ['system.admin'] },
]

/**
 * Role catalog — 10 named roles + 4 legacy ones kept for backwards compat.
 * Each role has: label (Vietnamese), scope (group|site), default permissions, isSystem (seeded).
 */
const ROLE_CATALOG = {
  // ── Group-scope roles (org-wide) ────────────────────────────────────────
  admin: {
    label: 'Admin',
    scope: 'group',
    description: 'Toàn quyền hệ thống',
    permissions: Object.keys(PERMISSIONS),
  },
  giamdoc: {
    label: 'Giám đốc',
    scope: 'group',
    description: 'Giám đốc cấp tập đoàn — xem mọi chi nhánh',
    permissions: [
      'ris.view', 'ris.manage', 'registration.view', 'registration.manage',
      'teleradiology.view', 'teleradiology.manage', 'tasks.view', 'tasks.manage',
      'billing.view', 'billing.manage', 'billing.refund',
      'inventory.view', 'inventory.manage',
      'reports.view', 'rad-reports.view', 'kpi-sales.view',
      'referral.view', 'partners.manage',
      'financials.view', 'financials.manage',
      'crm.view', 'marketing.view',
      'catalogs.view', 'catalogs.manage',
      'hr.view', 'audit.view',
    ],
  },
  ketoan: {
    label: 'Kế toán',
    scope: 'group',
    description: 'Kế toán — chỉ xem/nhập tài chính',
    permissions: [
      'financials.view', 'financials.manage',
      'billing.view', 'billing.refund',
      'reports.view', 'referral.view',
      'catalogs.view',
    ],
  },
  hr: {
    label: 'HR',
    scope: 'group',
    description: 'Quản lý nhân sự cấp tập đoàn',
    permissions: ['hr.view', 'hr.manage', 'audit.view', 'catalogs.view'],
  },
  bacsi: {
    label: 'Bác sĩ',
    scope: 'group',
    description: 'Bác sĩ chẩn đoán hình ảnh — đọc phim ở mọi chi nhánh',
    permissions: [
      'ris.view', 'teleradiology.view', 'teleradiology.manage',
      'tasks.view', 'rad-reports.view',
    ],
  },
  kinhdoanh: {
    label: 'Kinh doanh (NVKD)',
    scope: 'group',
    description: 'Nhân viên kinh doanh — phụ trách nguồn giới thiệu và KPI sales',
    permissions: [
      'registration.view', 'referral.view', 'kpi-sales.view',
      'partners.manage', 'catalogs.view', 'crm.view',
    ],
  },

  // ── Site-scope roles (per-branch) ───────────────────────────────────────
  gd_chinhanh: {
    label: 'Giám đốc chi nhánh',
    scope: 'site',
    description: 'Phụ trách toàn bộ hoạt động một chi nhánh',
    permissions: [
      'ris.view', 'ris.manage', 'registration.view', 'registration.manage',
      'teleradiology.view', 'tasks.view', 'tasks.manage',
      'billing.view', 'billing.manage',
      'inventory.view', 'inventory.manage',
      'reports.view', 'rad-reports.view',
      'consumables.record',
      'financials.view',
      'catalogs.view', 'hr.view',
    ],
  },
  letan: {
    label: 'Lễ tân',
    scope: 'site',
    description: 'Tiếp đón, đăng ký bệnh nhân, lập phiếu thu',
    permissions: [
      'registration.view', 'registration.manage',
      'billing.view', 'billing.manage',
      'referral.view', 'catalogs.view',
    ],
  },
  ktv: {
    label: 'Kỹ thuật viên',
    scope: 'site',
    description: 'Vận hành máy chụp, ghi nhận vật tư tiêu hao',
    permissions: [
      'ris.view', 'ris.manage', 'registration.view', 'tasks.view',
      'consumables.record', 'inventory.view',
    ],
  },
  nv_kho: {
    label: 'Nhân viên kho',
    scope: 'site',
    description: 'Quản lý kho vật tư, hóa chất, thiết bị',
    permissions: ['inventory.view', 'inventory.manage', 'catalogs.view'],
  },

  // ── Legacy roles (kept so existing User.role values keep working) ──────
  truongphong: {
    label: 'Trưởng phòng (legacy)',
    scope: 'site',
    description: 'Vai trò cũ — ánh xạ tương đương giám đốc chi nhánh',
    permissions: [
      'ris.view', 'ris.manage', 'registration.view', 'registration.manage',
      'teleradiology.view', 'tasks.view', 'tasks.manage',
      'billing.view', 'billing.manage',
      'inventory.view', 'inventory.manage',
      'catalogs.view', 'hr.view',
    ],
  },
  nhanvien: {
    label: 'Nhân viên (legacy)',
    scope: 'site',
    description: 'Vai trò cũ — dùng cho tài khoản chưa được gán vai trò chức năng',
    permissions: ['ris.view', 'registration.view', 'registration.manage', 'tasks.view', 'billing.view', 'inventory.view', 'catalogs.view'],
  },
  sale: {
    label: 'Sale (legacy)',
    scope: 'group',
    description: 'Vai trò cũ cho NVKD — di chuyển sang `kinhdoanh` khi có dịp',
    permissions: [
      'registration.view', 'referral.view', 'kpi-sales.view',
      'partners.manage', 'catalogs.view', 'crm.view',
    ],
  },
  guest: {
    label: 'Guest',
    scope: 'group',
    description: 'Chỉ xem',
    permissions: [],
  },
}

// Backwards-compat alias used by older code paths
const DEFAULT_ROLE_PERMISSIONS = Object.fromEntries(
  Object.entries(ROLE_CATALOG).map(([k, v]) => [k, v.permissions])
)

module.exports = { PERMISSIONS, PERMISSION_GROUPS, ROLE_CATALOG, DEFAULT_ROLE_PERMISSIONS }
