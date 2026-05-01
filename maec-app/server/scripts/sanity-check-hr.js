/**
 * Sanity check: test HR & RBAC APIs
 * Run: node scripts/sanity-check-hr.js
 * Requires: server running on localhost:3001, seed-hr.js already run
 */
const http = require('http')

const BASE = 'http://localhost:3001'
let TOKEN = ''
let pass = 0, fail = 0

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' },
    }
    if (token || TOKEN) opts.headers['Authorization'] = `Bearer ${token || TOKEN}`
    const req = http.request(opts, res => {
      let data = ''; res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function check(label, condition) {
  if (condition) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

async function run() {
  console.log('═══════════════════════════════════════')
  console.log('  SANITY CHECK — HR & RBAC')
  console.log('═══════════════════════════════════════\n')

  // ── Admin login ───────────────────────────────────────
  console.log('1. LOGIN (enhanced token)')
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'maec2026' })
  check('Login returns 200', login.status === 200)
  check('Token has permissions', Array.isArray(login.data.permissions))
  check('Admin has system.admin perm', (login.data.permissions || []).includes('system.admin'))
  TOKEN = login.data.token

  // Test non-admin login has permissions too
  const nvLogin = await request('POST', '/api/auth/login', { username: 'nv_hd1', password: 'maec2026' })
  check('Nhanvien login has permissions', Array.isArray(nvLogin.data.permissions))
  check('Nhanvien has ris.view', (nvLogin.data.permissions || []).includes('ris.view'))
  check('Nhanvien lacks system.admin', !(nvLogin.data.permissions || []).includes('system.admin'))
  check('Nhanvien has departmentId', !!nvLogin.data.departmentId)

  // ── Departments ───────────────────────────────────────
  console.log('\n2. DEPARTMENTS')
  const depts = await request('GET', '/api/hr/departments')
  check('List departments returns 200', depts.status === 200)
  check('Departments is array', Array.isArray(depts.data))
  check('Has 16+ departments', depts.data.length >= 16)

  const branchDepts = depts.data.filter(d => d.type === 'branch')
  check('Has branch type departments', branchDepts.length >= 10)

  // Create a department
  const newDept = await request('POST', '/api/hr/departments', { code: 'TEST', name: 'Test Dept', type: 'hq' })
  check('Create department returns 201', newDept.status === 201)
  const testDeptId = newDept.data.department?._id

  // Update it
  if (testDeptId) {
    const upDept = await request('PUT', `/api/hr/departments/${testDeptId}`, { description: 'Updated' })
    check('Update department returns 200', upDept.status === 200)

    // Delete (soft)
    const delDept = await request('DELETE', `/api/hr/departments/${testDeptId}`)
    check('Delete department returns 200', delDept.status === 200)
  }

  // Test nhanvien cannot create department
  const nvDeptCreate = await request('POST', '/api/hr/departments', { code: 'FAIL', name: 'Should Fail' }, nvLogin.data.token)
  check('Nhanvien cannot create department (403)', nvDeptCreate.status === 403)

  // ── Employees ─────────────────────────────────────────
  console.log('\n3. EMPLOYEES')
  const emps = await request('GET', '/api/hr/employees')
  check('List employees returns 200', emps.status === 200)
  check('Employees is array', Array.isArray(emps.data))
  check('Has 20+ employees', emps.data.length >= 20)

  const firstEmp = emps.data[0]
  if (firstEmp) {
    check('Employee has _id (mã NV)', !!firstEmp._id)
    check('Employee has displayName', !!firstEmp.displayName)
    check('Employee has departmentId', !!firstEmp.departmentId || firstEmp.departmentId === '')
  }

  // Search employees
  const searchEmps = await request('GET', '/api/hr/employees?q=Nguy')
  check('Search employees works', searchEmps.status === 200 && searchEmps.data.length >= 1)

  // Filter by department
  const filteredEmps = await request('GET', '/api/hr/employees?departmentId=DEPT-HD')
  check('Filter by department works', filteredEmps.status === 200)

  // Create employee
  const testEmpCode = `TEST-${Date.now()}`
  const newEmp = await request('POST', '/api/hr/employees', {
    _id: testEmpCode, password: 'test1234',
    displayName: 'Test NV Sanity', position: 'Kỹ thuật viên', departmentId: 'DEPT-HD',
    phone: '0999888000', joinDate: '2026-04-01',
  })
  check('Create employee returns 201', newEmp.status === 201)
  check('Employee has _id matching payload', newEmp.data.employee?._id === testEmpCode)
  const testEmpId = newEmp.data.employee?._id

  // Update employee
  if (testEmpId) {
    const upEmp = await request('PUT', `/api/hr/employees/${testEmpId}`, { notes: 'Updated via test' })
    check('Update employee returns 200', upEmp.status === 200)
  }

  // ── Roles & Permissions ───────────────────────────────
  console.log('\n4. ROLES & PERMISSIONS')
  const roles = await request('GET', '/api/hr/roles')
  check('List roles returns 200', roles.status === 200)
  check('Has 6 roles', roles.data.length === 6)

  const adminRole = roles.data.find(r => r._id === 'admin')
  check('Admin role has all permissions', adminRole && adminRole.permissions.length >= 20)

  const bacsRole = roles.data.find(r => r._id === 'bacsi')
  check('Bacsi role has ris.view', bacsRole && bacsRole.permissions.includes('ris.view'))
  check('Bacsi role lacks billing.manage', bacsRole && !bacsRole.permissions.includes('billing.manage'))

  const permDefs = await request('GET', '/api/hr/permissions')
  check('Permission defs returns 200', permDefs.status === 200)
  check('Has permissions object', !!permDefs.data.permissions)
  check('Has groups array', Array.isArray(permDefs.data.groups))

  // Update a role's permissions
  const updateRole = await request('PUT', '/api/hr/roles/guest', {
    permissions: ['ris.view'],
  })
  check('Update guest role returns 200', updateRole.status === 200)

  // Revert guest
  await request('PUT', '/api/hr/roles/guest', { permissions: [] })

  // ── Users endpoint ────────────────────────────────────
  console.log('\n5. USERS')
  const users = await request('GET', '/api/hr/users')
  check('List users returns 200', users.status === 200)
  check('Users have departmentId field', users.data.some(u => u.departmentId))

  // ── Backward compat: existing sanity check endpoints ──
  console.log('\n6. BACKWARD COMPAT')
  const risStudies = await request('GET', '/api/ris/studies?limit=5')
  check('RIS studies still work', risStudies.status === 200)

  const regPatients = await request('GET', '/api/registration/patients?limit=5')
  check('Registration patients still work', regPatients.status === 200)

  // ── Summary ───────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log(`  RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`)
  console.log('═══════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
