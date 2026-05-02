// Verify the catalogCRUD _id fix: POST a new package with a user-friendly
// `code`, PUT to update by code (used to silently 404), DELETE by code.
// Cleans up. Uses _TESTBE_* prefix.
const ROOT = 'http://localhost:3001'

async function login() {
  const r = await fetch(ROOT + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'maec2026' }),
  })
  const d = await r.json()
  if (!d.token) throw new Error('login: ' + JSON.stringify(d))
  return d.token
}

async function api(method, path, token, body) {
  const r = await fetch(ROOT + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: r.status, data }
}

;(async () => {
  const token = await login()
  const code = '_TESTBE_PKG_' + Date.now()

  // 1) POST — create a package
  const c = await api('POST', '/api/catalogs/packages', token, {
    code,
    name: '_TESTBE_ Audit package',
    basePrice: 100000,
  })
  if (c.status !== 201) throw new Error('POST failed: ' + JSON.stringify(c))
  if (c.data._id !== code) throw new Error(`_id should equal code, got ${c.data._id}`)
  console.log(`✓ POST: _id=${c.data._id} (== code=${code})`)

  // 2) PUT — update by code (the bug: previously 404'd because _id was timestamp)
  const u = await api('PUT', `/api/catalogs/packages/${code}`, token, {
    name: '_TESTBE_ Audit package (updated)',
  })
  if (u.status !== 200) throw new Error('PUT failed: ' + JSON.stringify(u))
  if (u.data.name !== '_TESTBE_ Audit package (updated)') throw new Error('PUT did not persist update')
  console.log(`✓ PUT by code succeeded: ${u.data.name}`)

  // 3) GET — confirm the row reads back
  const g = await api('GET', `/api/catalogs/packages?q=Audit`, token)
  if (g.status !== 200) throw new Error('GET failed: ' + JSON.stringify(g))
  const found = g.data.find(p => p.code === code)
  if (!found) throw new Error('GET did not return the new package')
  console.log(`✓ GET: found ${found.code} via search`)

  // 4) DELETE by code
  const d = await api('DELETE', `/api/catalogs/packages/${code}`, token)
  if (d.status !== 200) throw new Error('DELETE failed: ' + JSON.stringify(d))
  console.log(`✓ DELETE by code succeeded`)

  // 5) Confirm gone
  const g2 = await api('GET', `/api/catalogs/packages?q=Audit`, token)
  if (g2.data.some(p => p.code === code)) throw new Error('package still present after DELETE')
  console.log(`✓ Cleanup confirmed: 0 _TESTBE_* packages remain`)

  console.log('\nAll catalogCRUD assertions passed.')
})().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
