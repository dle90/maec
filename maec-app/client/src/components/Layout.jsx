import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { logoutUser } from '../api'
import GlobalSearch from './GlobalSearch'
import NotificationBell from './NotificationBell'
import { CATALOG_GROUPS, CATALOG_TO_GROUP } from '../config/catalogGroups'
import { REPORT_GROUPS, REPORT_TO_GROUP, TOP_LEVEL as REPORT_TOP_LEVEL } from '../config/reportGroups'

// Top 3 items are headerless (rendered as direct nav items).
// Everything else lives under collapsed "Khác" — pull out as needed.
const NAV = [
  {
    group: 'shortcut-registration', headerless: true,
    items: [{ path: '/registration', label: 'Đăng ký', icon: '🏥', workflowOnly: true }]
  },
  {
    group: 'shortcut-kham', headerless: true,
    items: [{ path: '/kham', label: 'Khám', icon: '🩺', workflowOnly: true }]
  },
  {
    group: 'shortcut-thungan', headerless: true,
    items: [{ path: '/thu-ngan', label: 'Thu ngân', icon: '💵', workflowOnly: true }]
  },
  {
    group: 'Danh mục',
    items: [
      { path: '/catalogs/services', label: 'Dịch vụ khám', icon: '📄', workflowOnly: true },
      { path: '/catalogs/kinh',     label: 'Kính',         icon: '👓', workflowOnly: true },
      { path: '/catalogs/thuoc',    label: 'Thuốc',        icon: '💊', workflowOnly: true },
    ]
  },
  {
    group: 'Khác',
    defaultCollapsed: true,
    children: [
      {
        group: 'HIS',
        children: [
          {
            group: 'Tiếp đón',
            items: [
              { path: '/billing',      label: 'Phiếu thu (legacy)', icon: '💳', workflowOnly: true },
            ]
          },
          {
            group: 'Vận hành',
            items: [
              { path: '/inventory', label: 'Quản lý kho', icon: '📦', workflowOnly: true },
            ]
          },
          { catalogTree: true, group: 'Danh mục' },
          { reportTree: true,  group: 'Báo cáo' },
          {
            group: 'Quản lý',
            items: [
              { path: '/audit-log', label: 'Nhật ký hệ thống', icon: '📜', perm: 'audit.view' },
            ]
          },
        ]
      },
      {
        group: 'Khám bệnh (legacy RIS)',
        items: [
          { path: '/ris', label: 'Lượt khám (legacy)', icon: '👁️', workflowOnly: true },
        ]
      },
      {
        group: 'Phân hệ phụ trợ',
        children: [
          {
            group: 'Tài chính',
            perm: 'financials.view',
            items: [
              { path: '/actuals',   label: 'Nhập số liệu',          icon: '✏️', perm: 'financials.manage' },
              { path: '/pl',        label: 'Kết quả kinh doanh',    icon: '📋', perm: 'financials.view' },
              { path: '/cf',        label: 'Dòng tiền',             icon: '💰', perm: 'financials.view' },
              { path: '/bs',        label: 'Bảng cân đối kế toán',  icon: '⚖️', perm: 'financials.view' },
              { path: '/breakeven', label: 'Điểm hòa vốn',          icon: '📈', perm: 'financials.view' },
            ]
          },
          {
            group: 'CRM',
            items: [
              { path: '/crm',       label: 'Phân tích KH', icon: '👥' },
              { path: '/kpi-sales', label: 'KPI Sales',    icon: '🎯' },
              { path: '/marketing', label: 'Marketing',    icon: '📣' }
            ]
          },
          {
            group: 'Cổng công khai',
            items: [
              { path: '/booking',        label: 'Đặt lịch khám',  icon: '📅', external: true },
              { path: '/patient-login',  label: 'Cổng bệnh nhân', icon: '🧑',  external: true },
              { path: '/partner-login',  label: 'Cổng đối tác',   icon: '🤝', external: true },
            ]
          },
        ]
      },
      {
        group: 'Inactive',
        defaultCollapsed: true,
        items: [
          { path: '/workflow',        label: 'Công việc',          icon: '✅', workflowOnly: true },
          { path: '/today',           label: 'Hôm nay (live)',     icon: '📡', workflowOnly: true },
          { path: '/',                label: 'Dashboard',          icon: '📊' },
          { path: '/sites',           label: 'Danh sách Site',     icon: '📍' },
        ]
      },
    ]
  },
]

const ROLE_LABELS = {
  admin:       { label: 'Admin',        cls: 'bg-yellow-800 text-yellow-200' },
  guest:       { label: 'Guest',        cls: 'bg-blue-800 text-blue-300' },
  nhanvien:    { label: 'Nhân viên',    cls: 'bg-blue-800 text-blue-200' },
  truongphong: { label: 'Trưởng phòng', cls: 'bg-indigo-800 text-indigo-200' },
  giamdoc:     { label: 'Giám đốc',     cls: 'bg-purple-800 text-purple-200' },
  bacsi:       { label: 'Bác sĩ',       cls: 'bg-teal-800 text-teal-200' },
}

// ── Collapsible Danh mục tree ───────────────────────────────────────────────
// The catalog surface is wide (5 groups × 3-5 catalogs each). Keeping every
// catalog as a permanent sidebar row made the menu feel dense on every page
// where the admin wasn't even managing catalogs. Notion-style collapsible tree
// hides the detail by default while keeping it one click away. Group-level
// expansion state persists in localStorage so each admin's preferred layout
// survives refreshes, and the group containing the active catalog auto-expands
// so a deep-link arrival always shows its own node highlighted in context.

const CATALOG_TREE_LS_KEY = 'maec_catalog_tree_expanded'
const CATALOG_COUNTS_TTL_MS = 60_000

// Counts source is the /api/catalogs/summary endpoint. We wrap it in a module-
// level promise so the first sidebar render kicks off a single fetch and all
// consumers share the result.
function useCatalogCounts() {
  const [counts, setCounts] = React.useState(() => loadCachedCounts())
  React.useEffect(() => {
    let cancelled = false
    api.get('/catalogs/summary').then(r => {
      if (cancelled) return
      const c = r.data?.counts || {}
      setCounts(c)
      try { localStorage.setItem('maec_catalog_counts', JSON.stringify({ t: Date.now(), c })) } catch {}
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  return counts
}
function loadCachedCounts() {
  try {
    const raw = localStorage.getItem('maec_catalog_counts')
    if (!raw) return {}
    const { t, c } = JSON.parse(raw)
    if (Date.now() - t > CATALOG_COUNTS_TTL_MS) return c || {}
    return c || {}
  } catch { return {} }
}

function CatalogTree({ hasPerm, indent = 0 }) {
  const location = useLocation()
  const counts = useCatalogCounts()

  const activeKey = (() => {
    const m = location.pathname.match(/^\/catalogs\/([^/?#]+)/)
    return m ? m[1] : null
  })()
  const activeGroupKey = activeKey ? CATALOG_TO_GROUP[activeKey]?.key : null

  const [expanded, setExpanded] = React.useState(() => {
    try {
      const raw = localStorage.getItem(CATALOG_TREE_LS_KEY)
      if (raw) return new Set(JSON.parse(raw))
    } catch {}
    // Default: open only the group containing the active catalog (if any)
    return new Set(activeGroupKey ? [activeGroupKey] : [])
  })

  // When the active catalog changes (e.g. user clicks elsewhere, then uses
  // browser back), ensure its group is expanded so the highlighted row is
  // visible without an extra click. We don't auto-collapse other groups.
  React.useEffect(() => {
    if (!activeGroupKey) return
    setExpanded(prev => {
      if (prev.has(activeGroupKey)) return prev
      const next = new Set(prev); next.add(activeGroupKey); return next
    })
  }, [activeGroupKey])

  React.useEffect(() => {
    try { localStorage.setItem(CATALOG_TREE_LS_KEY, JSON.stringify([...expanded])) } catch {}
  }, [expanded])

  const canSeeCatalogs = hasPerm ? hasPerm('catalogs.view') || hasPerm('catalogs.manage') || hasPerm('partners.manage') || hasPerm('inventory.manage') || hasPerm('hr.view') || hasPerm('hr.manage') : true
  if (!canSeeCatalogs) return null

  const toggleGroup = (key) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div>
      {CATALOG_GROUPS.map(g => {
        const isOpen = expanded.has(g.key)
        const isActiveGroup = g.key === activeGroupKey
        const groupTotal = g.items.reduce((s, i) => s + (counts[i.key] || 0), 0)
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className={`w-full flex items-center pr-4 py-1.5 text-sm transition-colors ${isActiveGroup ? 'text-white' : 'text-blue-200 hover:text-white hover:bg-blue-800'}`}
              style={{ paddingLeft: `${16 + indent}px` }}
            >
              <span className="mr-1.5 text-[10px] w-3 inline-block opacity-70">{isOpen ? '▾' : '▸'}</span>
              <span className="flex-1 text-left font-medium">{g.label}</span>
              {groupTotal > 0 && <span className="text-[10px] text-blue-400/70 tabular-nums">{groupTotal}</span>}
            </button>
            {isOpen && g.items.map(it => {
              const isActive = it.key === activeKey
              const c = counts[it.key]
              return (
                <NavLink
                  key={it.key}
                  to={`/catalogs/${it.key}`}
                  className={`flex items-center pr-4 py-1.5 text-sm transition-colors ${isActive ? 'bg-blue-700 text-white font-medium border-r-2 border-blue-300' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}
                  style={{ paddingLeft: `${36 + indent}px` }}
                >
                  <span className="mr-2 text-xs">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {c != null && <span className={`text-[10px] tabular-nums ${isActive ? 'text-blue-200' : 'text-blue-400/70'}`}>{c}</span>}
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Collapsible Báo cáo tree ───────────────────────────────────────────────
// 4 top-level entries: Tổng Quan (leaf) + 3 persona groups (Lâm sàng /
// Vận Hành / Tài Chính) that expand to their sub-reports. Expansion persists
// in localStorage and auto-opens the group containing the active report.
// Same shape as CatalogTree — factored only because report data shape
// differs enough (has a leaf at top level) that sharing was awkward.
const REPORT_TREE_LS_KEY = 'maec_report_tree_expanded'

function ReportTree({ hasPerm, isFinancialsUser, indent = 0 }) {
  const location = useLocation()

  const activeKey = (() => {
    const m = location.pathname.match(/^\/reports\/([^/?#]+)/)
    return m ? m[1] : null
  })()
  const activeGroupKey = activeKey ? REPORT_TO_GROUP[activeKey]?.group?.key : null

  const [expanded, setExpanded] = React.useState(() => {
    try {
      const raw = localStorage.getItem(REPORT_TREE_LS_KEY)
      if (raw) return new Set(JSON.parse(raw))
    } catch {}
    return new Set(activeGroupKey ? [activeGroupKey] : ['lam-sang'])
  })

  React.useEffect(() => {
    if (!activeGroupKey) return
    setExpanded(prev => {
      if (prev.has(activeGroupKey)) return prev
      const next = new Set(prev); next.add(activeGroupKey); return next
    })
  }, [activeGroupKey])

  React.useEffect(() => {
    try { localStorage.setItem(REPORT_TREE_LS_KEY, JSON.stringify([...expanded])) } catch {}
  }, [expanded])

  const canView = hasPerm ? (hasPerm('reports.view') || hasPerm('rad-reports.view') || isFinancialsUser) : true
  if (!canView) return null

  const toggleGroup = (key) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const isActiveTopLevel = activeKey === REPORT_TOP_LEVEL.key

  return (
    <div>
      {/* Top-level: Tổng Quan leaf */}
      <NavLink
        to={`/reports/${REPORT_TOP_LEVEL.key}`}
        className={`flex items-center pr-4 py-1.5 text-sm transition-colors ${isActiveTopLevel ? 'bg-blue-700 text-white font-medium border-r-2 border-blue-300' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}
        style={{ paddingLeft: `${16 + indent}px` }}
      >
        <span className="mr-2 text-xs">{REPORT_TOP_LEVEL.icon}</span>
        <span className="flex-1 truncate">{REPORT_TOP_LEVEL.label}</span>
      </NavLink>
      {/* Persona groups */}
      {REPORT_GROUPS.map(g => {
        const isOpen = expanded.has(g.key)
        const isActiveGroup = g.key === activeGroupKey
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className={`w-full flex items-center pr-4 py-1.5 text-sm transition-colors ${isActiveGroup ? 'text-white' : 'text-blue-200 hover:text-white hover:bg-blue-800'}`}
              style={{ paddingLeft: `${16 + indent}px` }}
            >
              <span className="mr-1.5 text-[10px] w-3 inline-block opacity-70">{isOpen ? '▾' : '▸'}</span>
              <span className="flex-1 text-left font-medium">{g.label}</span>
            </button>
            {isOpen && g.items.map(it => {
              const isActive = it.key === activeKey
              return (
                <NavLink
                  key={it.key}
                  to={`/reports/${it.key}`}
                  className={`flex items-center pr-4 py-1.5 text-sm transition-colors ${isActive ? 'bg-blue-700 text-white font-medium border-r-2 border-blue-300' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}
                  style={{ paddingLeft: `${36 + indent}px` }}
                >
                  <span className="mr-2 text-xs">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default function Layout({ children }) {
  const { auth, logout, hasPerm } = useAuth()
  const isAdmin = auth?.role === 'admin'
  // Legacy flags kept as fallback for items that haven't migrated to `perm` yet.
  const isFinancialsUser = hasPerm('financials.view') || auth?.role === 'giamdoc'
  const isWorkflowUser = auth?.role && auth.role !== 'guest'
  const [sidebarOpen, setSidebarOpen] = React.useState(true)
  const [collapsed, setCollapsed] = React.useState(() => {
    const init = {}
    const walk = (nodes, parentKey) => {
      for (const n of nodes) {
        const key = `${parentKey}/${n.group}`
        if (n.defaultCollapsed) init[key] = true
        if (n.children) walk(n.children, key)
      }
    }
    walk(NAV, '')
    return init
  })
  const toggleSub = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }))
  const filterItems = (items) => items.filter(item => {
    if (item.perm && !hasPerm(item.perm)) return false
    if (item.adminOnly && !isAdmin) return false
    if (item.financialsOnly && !isFinancialsUser) return false
    if (item.workflowOnly && !isWorkflowUser) return false
    return true
  })
  const renderLink = (item, depth) => {
    if (item.external) {
      return (
        <a
          key={item.path}
          href={item.path}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center pr-4 py-2 text-sm transition-colors duration-150 text-blue-200 hover:bg-blue-800 hover:text-white"
          style={{ paddingLeft: `${16 + depth * 14}px` }}
        >
          <span className="mr-2 text-xs">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          <span className="text-[10px] opacity-60 ml-2">↗</span>
        </a>
      )
    }
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/'}
        className={({ isActive }) =>
          `flex items-center pr-4 py-2 text-sm transition-colors duration-150 ${
            isActive
              ? 'bg-blue-700 text-white font-medium border-r-2 border-blue-300'
              : 'text-blue-200 hover:bg-blue-800 hover:text-white'
          }`
        }
        style={{ paddingLeft: `${16 + depth * 14}px` }}
      >
        <span className="mr-2 text-xs">{item.icon}</span>
        {item.label}
      </NavLink>
    )
  }
  const renderNode = (section, depth, parentKey) => {
    if (section.perm && !hasPerm(section.perm)) return null
    if (section.financialsOnly && !isFinancialsUser) return null
    if (section.workflowOnly && !isWorkflowUser) return null
    if (section.adminOnly && !isAdmin) return null
    const key = `${parentKey}/${section.group}`
    const isTop = depth === 0

    let content = null
    if (section.catalogTree) {
      if (!isWorkflowUser) return null
      content = <CatalogTree hasPerm={hasPerm} indent={depth * 14} />
    } else if (section.reportTree) {
      if (!isWorkflowUser) return null
      content = <ReportTree hasPerm={hasPerm} isFinancialsUser={isFinancialsUser} indent={depth * 14} />
    } else if (section.children) {
      const rendered = section.children
        .map(c => renderNode(c, depth + 1, key))
        .filter(Boolean)
      if (rendered.length === 0) return null
      content = rendered
    } else {
      const visibleItems = filterItems(section.items || [])
      if (visibleItems.length === 0) return null
      content = visibleItems.map(item => renderLink(item, depth + 1))
    }

    const isOpen = collapsed[key] === undefined ? !section.defaultCollapsed : !collapsed[key]

    // Headerless sections (used for top-level shortcut items like Đăng ký /
    // Khám / Thu ngân) skip the section button and render items directly.
    if (section.headerless) {
      return <div key={key}>{content}</div>
    }

    const headerClass = isTop
      ? 'w-full flex items-center py-1 text-blue-400 text-xs font-semibold uppercase tracking-wider hover:text-blue-200 transition-colors'
      : 'w-full flex items-center py-1.5 text-xs text-blue-300 hover:text-white hover:bg-blue-800 transition-colors'

    return (
      <div key={key} className={isTop ? 'mb-2' : ''}>
        <button
          type="button"
          onClick={() => toggleSub(key)}
          className={headerClass}
          style={{ paddingLeft: `${16 + depth * 14}px`, paddingRight: '16px' }}
        >
          <span className="mr-1.5 text-[10px] w-3 inline-block">{isOpen ? '▾' : '▸'}</span>
          <span className={isTop ? '' : 'font-medium'}>{section.group}</span>
        </button>
        {isOpen && content}
      </div>
    )
  }

  const handleLogout = async () => {
    try { await logoutUser() } catch {}
    logout()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-0'} flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden transition-all duration-200`} style={{ backgroundColor: '#1e3a5f' }}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-blue-800">
          <div className="text-white font-bold text-base tracking-wide leading-tight">Minh Anh<br /><span className="text-blue-300 font-medium text-xs">Eye Clinic</span></div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {NAV.map(section => renderNode(section, 0, ''))}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-3 border-t border-blue-800 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-blue-200 text-xs font-medium truncate">{auth?.displayName || auth?.username}</span>
            {(() => {
              const rc = ROLE_LABELS[auth?.role] || ROLE_LABELS.guest
              return <span className={`ml-auto text-xs px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${rc.cls}`}>{rc.label}</span>
            })()}
          </div>
          {auth?.department && (
            <div className="text-blue-400 text-xs px-0.5">{auth.department}</div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-xs text-blue-300 hover:text-white hover:bg-blue-800 px-2 py-1.5 rounded text-left transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              title={sidebarOpen ? 'Ẩn menu' : 'Hiện menu'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-800">Phòng khám Mắt Minh Anh</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className="text-xs flex items-center gap-2 px-2.5 py-1 rounded border border-gray-200 hover:border-gray-300 text-gray-500 hover:bg-gray-50"
              title="Tìm kiếm (Ctrl+K)"
            >
              🔍 <span>Tìm kiếm</span> <kbd className="bg-gray-100 px-1 rounded text-[10px]">Ctrl+K</kbd>
            </button>
            <NotificationBell />
            {!isAdmin && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Chế độ xem</span>
            )}
            <span className="text-sm text-gray-500">Đơn vị: VND triệu</span>
            <div className="w-2 h-2 rounded-full bg-green-500" title="Server online"></div>
          </div>
        </header>

        {/* Cmd+K palette (rendered globally; portals out via fixed positioning) */}
        <GlobalSearch />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
