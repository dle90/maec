/**
 * Seed HR data: Departments, RolePermissions (+ backfill departmentId/position on User)
 * Run: node scripts/seed-hr.js
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const Department = require('../models/Department')
const RolePermission = require('../models/RolePermission')
const User = require('../models/User')
const { ROLE_CATALOG } = require('../shared/permissions')

const now = () => new Date().toISOString()

async function seed() {
  console.log('Seeding HR data...\n')

  // ═══════════════════════════════════════════════════════
  // DEPARTMENTS
  // ═══════════════════════════════════════════════════════
  const departments = [
    // Branch sites
    { _id: 'DEPT-HD', code: 'HD', name: 'Hải Dương', type: 'branch', headUserId: 'tp_hd', headName: 'TP. Hải Dương' },
    { _id: 'DEPT-CM', code: 'CM', name: 'Cà Mau', type: 'branch', headUserId: 'tp_cm', headName: 'TP. Cà Mau' },
    { _id: 'DEPT-TH', code: 'TH', name: 'Thanh Hóa', type: 'branch', headUserId: 'tp_th', headName: 'TP. Thanh Hóa' },
    { _id: 'DEPT-DN', code: 'DN', name: 'Đà Nẵng', type: 'branch' },
    { _id: 'DEPT-HN', code: 'HN', name: 'Hà Nội', type: 'branch' },
    { _id: 'DEPT-HCM', code: 'HCM', name: 'TP. HCM', type: 'branch' },
    { _id: 'DEPT-HP', code: 'HP', name: 'Hải Phòng', type: 'branch' },
    { _id: 'DEPT-HUE', code: 'HUE', name: 'Huế', type: 'branch' },
    { _id: 'DEPT-NT', code: 'NT', name: 'Nha Trang', type: 'branch' },
    { _id: 'DEPT-CT', code: 'CT', name: 'Cần Thơ', type: 'branch' },
    { _id: 'DEPT-BD', code: 'BD', name: 'Bình Dương', type: 'branch' },
    { _id: 'DEPT-DONGNAI', code: 'DONGNAI', name: 'Đồng Nai', type: 'branch' },
    // HQ departments
    { _id: 'DEPT-OPS', code: 'OPS', name: 'Vận hành', type: 'hq', headUserId: 'tp_ops', headName: 'TP. Vận hành' },
    { _id: 'DEPT-HR', code: 'HR', name: 'Nhân sự', type: 'hq', headUserId: 'tp_hr', headName: 'TP. Nhân sự' },
    { _id: 'DEPT-ACC', code: 'ACC', name: 'Kế toán', type: 'hq', headUserId: 'tp_acc', headName: 'TP. Kế toán' },
    { _id: 'DEPT-RAD', code: 'RAD', name: 'Điện quang', type: 'hq' },
  ]

  for (const d of departments) {
    await Department.findByIdAndUpdate(d._id, {
      parentId: '', phone: '', address: '', description: '', status: 'active',
      headUserId: '', headName: '', // defaults
      ...d,
      createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${departments.length} phòng ban / chi nhánh`)

  // Department name → ID mapping
  const deptMap = {
    'Hải Dương': 'DEPT-HD', 'Cà Mau': 'DEPT-CM', 'Thanh Hóa': 'DEPT-TH',
    'Đà Nẵng': 'DEPT-DN', 'Hà Nội': 'DEPT-HN', 'TP. HCM': 'DEPT-HCM',
    'Hải Phòng': 'DEPT-HP', 'Huế': 'DEPT-HUE', 'Nha Trang': 'DEPT-NT',
    'Cần Thơ': 'DEPT-CT', 'Bình Dương': 'DEPT-BD', 'Đồng Nai': 'DEPT-DONGNAI',
    'Ops': 'DEPT-OPS', 'HR': 'DEPT-HR', 'Kế toán': 'DEPT-ACC', 'Điện quang': 'DEPT-RAD',
  }
  const deptNameMap = {}
  departments.forEach(d => { deptNameMap[d._id] = d.name })

  // ═══════════════════════════════════════════════════════
  // BACKFILL Users: departmentId + default position/employmentStatus
  // ═══════════════════════════════════════════════════════
  const positionMap = {
    admin: 'Quản trị viên', guest: 'Khách',
    nhanvien: 'Nhân viên', truongphong: 'Trưởng phòng',
    giamdoc: 'Giám đốc', bacsi: 'Bác sĩ điện quang',
  }
  const users = await User.find({}).lean()
  let updatedUsers = 0
  for (const u of users) {
    const $set = {}
    if (u.department && deptMap[u.department] && !u.departmentId) $set.departmentId = deptMap[u.department]
    if (!u.position) $set.position = positionMap[u.role] || 'Nhân viên'
    if (!u.employmentStatus) $set.employmentStatus = 'active'
    if (Object.keys($set).length > 0) {
      await User.findByIdAndUpdate(u._id, { $set })
      updatedUsers++
    }
  }
  console.log(`✓ ${updatedUsers} tài khoản đã backfill departmentId/position/employmentStatus`)

  // ═══════════════════════════════════════════════════════
  // ROLE PERMISSIONS
  // ═══════════════════════════════════════════════════════
  for (const [roleId, cfg] of Object.entries(ROLE_CATALOG)) {
    await RolePermission.findByIdAndUpdate(roleId, {
      _id: roleId,
      label: cfg.label,
      description: cfg.description || '',
      scope: cfg.scope || 'group',
      permissions: cfg.permissions || [],
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${Object.keys(ROLE_CATALOG).length} vai trò (system roles seeded)`)

  // ═══════════════════════════════════════════════════════
  console.log('\n✅ Seed HR data hoàn tất!')
  console.log(`\n📋 Tổng: ${departments.length} phòng ban, ${updatedUsers} tài khoản backfilled, ${Object.keys(ROLE_CATALOG).length} vai trò`)
  process.exit(0)
}

setTimeout(seed, 2000)
