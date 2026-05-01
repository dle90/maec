/**
 * Seed the RolePermission collection with the canonical 11-role catalog
 * (admin, giamdoc, ketoan, hr, bacsi, gd_chinhanh, letan, ktv, nv_kho + legacy
 * truongphong/nhanvien/guest). Idempotent — safe to re-run.
 *
 * Usage: node scripts/seed-roles.js
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const RolePermission = require('../models/RolePermission')
const { ROLE_CATALOG } = require('../shared/permissions')

const now = () => new Date().toISOString()

async function seed() {
  console.log('Seeding RolePermission catalog...\n')
  for (const [roleId, cfg] of Object.entries(ROLE_CATALOG)) {
    const existing = await RolePermission.findById(roleId).lean()
    await RolePermission.findByIdAndUpdate(roleId, {
      _id: roleId,
      label: cfg.label,
      description: cfg.description || '',
      scope: cfg.scope || 'group',
      // Preserve any admin-customized permissions on re-seed; only set on create
      permissions: existing?.permissions?.length ? existing.permissions : (cfg.permissions || []),
      isSystem: true,
      createdAt: existing?.createdAt || now(),
      updatedAt: now(),
    }, { upsert: true })
    const action = existing ? 'UPDATE' : 'INSERT'
    const kept = existing?.permissions?.length ? ' (kept customized perms)' : ''
    console.log(`  ${action}  ${roleId.padEnd(14)} · ${cfg.scope.padEnd(5)} · ${cfg.label}${kept}`)
  }
  console.log(`\n✓ ${Object.keys(ROLE_CATALOG).length} vai trò`)
  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
