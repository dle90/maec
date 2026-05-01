// Warehouse scope resolution for inventory routes.
//
// Every inventory read/write is scoped to one warehouse OR, for supervisor/admin
// with explicit "all" intent, a set of warehouses the caller is entitled to see.
// nv_kho is always scoped to exactly one warehouse — their branch's.
//
// Usage in a route:
//   router.get('/foo', requireAuth, withWarehouseScope(), async (req, res) => {
//     const { ids, mode } = req.warehouseScope
//     // mode === 'one'  → ids is a single-element array
//     // mode === 'all'  → ids is every warehouse the caller can see
//   })

const Warehouse = require('../models/Warehouse')

const SUPERVISOR_ROLES = new Set(['admin', 'giamdoc', 'truongphong'])

async function listAccessibleWarehouses(user) {
  if (!user) return []
  // Admin + group-scope leads see everything.
  const isSuper = user.role === 'admin'
    || (user.permissions || []).includes('system.admin')
    || SUPERVISOR_ROLES.has(user.role)
  if (isSuper) {
    return Warehouse.find({ status: 'active' }).sort({ site: 1, name: 1 }).lean()
  }
  // Otherwise limit to warehouses at the user's sites. "Sites" includes the
  // user's primary department plus every site-scope role assignment.
  const siteIds = user.sites || []
  if (siteIds.length === 0) return []
  return Warehouse.find({ status: 'active', site: { $in: siteIds } }).sort({ site: 1, name: 1 }).lean()
}

function isSupervisor(user) {
  if (!user) return false
  if (user.role === 'admin') return true
  if ((user.permissions || []).includes('system.admin')) return true
  return SUPERVISOR_ROLES.has(user.role)
}

// Middleware: resolve req.warehouseScope based on ?warehouseId= query + user entitlement.
function withWarehouseScope() {
  return async (req, res, next) => {
    try {
      const accessible = await listAccessibleWarehouses(req.user)
      const accessibleIds = accessible.map(w => w._id)
      const requested = req.query.warehouseId

      if (requested) {
        if (!accessibleIds.includes(requested)) {
          return res.status(403).json({ error: 'Bạn không có quyền xem kho này' })
        }
        req.warehouseScope = { mode: 'one', ids: [requested], accessible, warehouse: accessible.find(w => w._id === requested) }
        return next()
      }

      // No explicit warehouseId. Supervisor → "all"; nv_kho-style user → first
      // (and only) accessible warehouse. If a non-supervisor somehow has multiple
      // warehouses accessible, they still need to pick one via ?warehouseId=.
      if (isSupervisor(req.user)) {
        req.warehouseScope = { mode: 'all', ids: accessibleIds, accessible }
        return next()
      }

      if (accessibleIds.length === 1) {
        req.warehouseScope = { mode: 'one', ids: accessibleIds, accessible, warehouse: accessible[0] }
        return next()
      }

      if (accessibleIds.length === 0) {
        return res.status(403).json({ error: 'Bạn chưa được gán kho nào' })
      }

      return res.status(400).json({ error: 'Vui lòng chọn kho (warehouseId)', accessible })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }
}

// Helper: pick the single branch warehouse for a given site. Used by auto-deduct
// to route a Study's consumable draw to the correct warehouse.
async function warehouseForSite(siteId) {
  if (!siteId) return null
  return Warehouse.findOne({ site: siteId, status: 'active' }).lean()
}

module.exports = { withWarehouseScope, listAccessibleWarehouses, warehouseForSite, isSupervisor }
