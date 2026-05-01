// Shared Danh mục tree config — consumed by both the main sidebar (Layout)
// and the catalog page (Catalogs) so nav + content agree on structure.
//
// When adding a new catalog:
//   1. Add it here under the right group
//   2. Add CATALOG_FIELDS entry (or custom render branch) in Catalogs.jsx

export const CATALOG_GROUPS = [
  {
    key: 'partners',
    label: 'Đối tác',
    color: 'blue',
    items: [
      { key: 'customer-sources',   label: 'Nguồn khách hàng',    icon: '📥' },
      { key: 'referral-doctors',   label: 'Bác sĩ giới thiệu',   icon: '👨‍⚕️' },
      { key: 'partner-facilities', label: 'Cơ sở y tế đối tác',  icon: '🏥' },
      { key: 'commission-groups',  label: 'Nhóm hoa hồng',       icon: '📋' },
      { key: 'commission-rules',   label: 'Hoa hồng',            icon: '💰' },
    ],
  },
  {
    key: 'services',
    label: 'Khám / Kính / Thuốc',
    color: 'teal',
    items: [
      { key: 'services',         label: 'Dịch vụ (Khám)',     icon: '📄' },
      { key: 'packages',         label: 'Gói khám',           icon: '📦' },
      { key: 'kinh',             label: 'Kính',               icon: '👓' },
      { key: 'thuoc',            label: 'Thuốc',              icon: '💊' },
      { key: 'service-types',    label: 'Loại dịch vụ',       icon: '📂' },
      { key: 'tax-groups',       label: 'Nhóm thuế dịch vụ',  icon: '📊' },
      { key: 'specialties',      label: 'Chuyên khoa',        icon: '🩺' },
      { key: 'report-templates', label: 'Mẫu kết quả',        icon: '📝' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    color: 'rose',
    items: [
      { key: 'promotions',  label: 'Chương trình khuyến mãi', icon: '🎁' },
      { key: 'promo-codes', label: 'Mã khuyến mãi',           icon: '🏷️' },
    ],
  },
  {
    key: 'references',
    label: 'Hồ sơ & Tham chiếu',
    color: 'purple',
    items: [
      { key: 'hr-employees',   label: 'Nhân viên',             icon: '👤' },
      { key: 'hr-departments', label: 'Phòng ban / Chi nhánh', icon: '🏢' },
      { key: 'hr-permissions', label: 'Ma trận quyền',         icon: '🔐' },
      { key: 'patients',       label: 'Bệnh nhân',             icon: '🧑' },
    ],
  },
  {
    key: 'inventory',
    label: 'Kho',
    color: 'amber',
    items: [
      { key: 'supplies',               label: 'Vật tư',                    icon: '📦' },
      { key: 'supply-categories',      label: 'Nhóm vật tư',               icon: '🗂️' },
      { key: 'suppliers',              label: 'Nhà cung cấp',              icon: '🏭' },
      { key: 'supply-service-mapping', label: 'Liên kết vật tư – dịch vụ', icon: '📏' },
    ],
  },
]

// Tailwind class fragments keyed by group color — small colored dot next to
// group headers in the sidebar tree, and active-state accents on catalog
// link rows inside the rail when we want the group color to show through.
export const GROUP_DOT_CLS = {
  blue:   'bg-blue-400',
  teal:   'bg-teal-400',
  rose:   'bg-rose-400',
  purple: 'bg-purple-400',
  amber:  'bg-amber-400',
}

// Flat `{ catalogKey → group }` lookup for breadcrumb / auto-expand logic.
export const CATALOG_TO_GROUP = Object.fromEntries(
  CATALOG_GROUPS.flatMap(g => g.items.map(i => [i.key, g]))
)

// First catalog in the first group — the default destination when landing
// on /catalogs with no param and no remembered last-visited.
export const DEFAULT_CATALOG_KEY = CATALOG_GROUPS[0].items[0].key
