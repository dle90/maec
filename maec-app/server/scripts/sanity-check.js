/**
 * Sanity check: test all new API endpoints
 */
const http = require('http')

const BASE = 'http://localhost:3001'
let TOKEN = ''
let pass = 0, fail = 0

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' },
    }
    if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`
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
  console.log('  SANITY CHECK — LinkRad Phase 1')
  console.log('═══════════════════════════════════════\n')

  // ── Auth ───────────────────────────────────────────────
  console.log('1. AUTH')
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'linkrad2025' })
  check('Login returns 200', login.status === 200)
  check('Login returns token', !!login.data.token)
  TOKEN = login.data.token

  // ── Billing ────────────────────────────────────────────
  console.log('\n2. BILLING')
  const invList = await request('GET', '/api/billing/invoices?limit=10')
  check('GET /billing/invoices returns 200', invList.status === 200)
  check('Invoices array exists', Array.isArray(invList.data.invoices))
  check('Has sample invoices', invList.data.invoices.length > 0)

  const invDetail = await request('GET', '/api/billing/invoices/INV-SAMPLE-1')
  check('GET invoice detail returns 200', invDetail.status === 200)
  check('Invoice has items', invDetail.data.items?.length > 0)

  // Create new invoice
  const newInv = await request('POST', '/api/billing/invoices', {
    patientName: 'Test BN Sanity', phone: '0999999999', site: 'Test Site',
    items: [{ serviceName: 'Test DV', unitPrice: 500000, quantity: 1 }],
  })
  check('POST create invoice returns 201', newInv.status === 201)
  check('New invoice has invoiceNumber', !!newInv.data.invoiceNumber)

  // Pay the new invoice
  if (newInv.data._id) {
    const pay = await request('POST', `/api/billing/invoices/${newInv.data._id}/pay`, { amount: 500000, paymentMethod: 'cash' })
    check('POST pay invoice returns 200', pay.status === 200)
    check('Invoice status is paid', pay.data.invoice?.status === 'paid')
  }

  // Daily close
  const daily = await request('GET', '/api/billing/daily-close')
  check('GET daily-close returns 200', daily.status === 200)
  check('Daily close has totalCollected', daily.data.totalCollected !== undefined)

  // Revenue report
  const rev = await request('GET', '/api/billing/revenue-report')
  check('GET revenue-report returns 200', rev.status === 200)

  // ── Inventory ──────────────────────────────────────────
  console.log('\n3. INVENTORY')
  const supplies = await request('GET', '/api/inventory/supplies')
  check('GET supplies returns 200', supplies.status === 200)
  check('Has supplies', supplies.data.length > 0)

  const suppliers = await request('GET', '/api/inventory/suppliers')
  check('GET suppliers returns 200', suppliers.status === 200)
  check('Has suppliers', suppliers.data.length > 0)

  const categories = await request('GET', '/api/inventory/categories')
  check('GET categories returns 200', categories.status === 200)
  check('Has categories', categories.data.length > 0)

  const txs = await request('GET', '/api/inventory/transactions?type=import')
  check('GET import transactions returns 200', txs.status === 200)
  check('Has import transactions', txs.data.length > 0)

  const lots = await request('GET', '/api/inventory/lots')
  check('GET lots returns 200', lots.status === 200)
  check('Has lots', lots.data.length > 0)

  const warehouses = await request('GET', '/api/inventory/warehouses')
  check('GET warehouses returns 200', warehouses.status === 200)
  check('Has warehouses', warehouses.data.length > 0)

  const cancelReasons = await request('GET', '/api/inventory/cancel-reasons')
  check('GET cancel-reasons returns 200', cancelReasons.status === 200)
  check('Has cancel reasons', cancelReasons.data.length > 0)

  const hisMapping = await request('GET', '/api/inventory/his-mapping')
  check('GET his-mapping returns 200', hisMapping.status === 200)
  check('Has HIS mappings', hisMapping.data.length > 0)

  // Reports
  const stockReport = await request('GET', '/api/inventory/reports/stock')
  check('GET stock report returns 200', stockReport.status === 200)
  check('Stock report has supplies', stockReport.data.supplies?.length > 0)

  const balanceReport = await request('GET', '/api/inventory/reports/balance')
  check('GET balance report returns 200', balanceReport.status === 200)

  const importReport = await request('GET', '/api/inventory/reports/import')
  check('GET import report returns 200', importReport.status === 200)

  const exportReport = await request('GET', '/api/inventory/reports/export')
  check('GET export report returns 200', exportReport.status === 200)

  const expiring = await request('GET', '/api/inventory/reports/expiring?days=60')
  check('GET expiring lots returns 200', expiring.status === 200)

  // Stock card
  if (supplies.data.length > 0) {
    const card = await request('GET', `/api/inventory/reports/card/${supplies.data[0]._id}`)
    check('GET stock card returns 200', card.status === 200)
    check('Stock card has supply info', !!card.data.supply)
  }

  // Create a transaction
  if (supplies.data.length > 0) {
    const newTx = await request('POST', '/api/inventory/transactions', {
      type: 'import', site: 'Test Site',
      items: [{ supplyId: supplies.data[0]._id, supplyName: supplies.data[0].name, quantity: 5, unitPrice: 10000, lotNumber: 'TEST-LOT', expiryDate: '2027-12-31' }],
    })
    check('POST create transaction returns 201', newTx.status === 201)

    if (newTx.data._id) {
      const confirm = await request('PUT', `/api/inventory/transactions/${newTx.data._id}/confirm`)
      check('PUT confirm transaction returns 200', confirm.status === 200)
      check('Transaction status is confirmed', confirm.data.status === 'confirmed')
    }
  }

  // ── Catalogs ───────────────────────────────────────────
  console.log('\n4. CATALOGS')
  const catalogEndpoints = [
    'service-types', 'services', 'specialties',
    'referral-doctors', 'partner-facilities', 'commission-groups', 'commission-rules',
    'tax-groups', 'users', 'patients',
  ]
  for (const ep of catalogEndpoints) {
    const r = await request('GET', `/api/catalogs/${ep}`)
    check(`GET /catalogs/${ep} returns 200`, r.status === 200)
    check(`  has data (${Array.isArray(r.data) ? r.data.length : '?'} items)`, Array.isArray(r.data) && r.data.length >= 0)
  }

  // Test CRUD on a catalog (use specialties — simple and live)
  const newDoc = await request('POST', '/api/catalogs/specialties', { code: 'TEST-01', name: 'Test Specialty' })
  check('POST create catalog item returns 201', newDoc.status === 201)
  if (newDoc.data._id) {
    const upd = await request('PUT', `/api/catalogs/specialties/${newDoc.data._id}`, { name: 'Test Specialty Updated' })
    check('PUT update catalog item returns 200', upd.status === 200)
    check('Updated name matches', upd.data.name === 'Test Specialty Updated')
    const del = await request('DELETE', `/api/catalogs/specialties/${newDoc.data._id}`)
    check('DELETE catalog item returns 200', del.status === 200)
  }

  // ── Promotions ─────────────────────────────────────────
  console.log('\n5. PROMOTIONS')
  const promos = await request('GET', '/api/promotions')
  check('GET /promotions returns 200', promos.status === 200)
  check('Has promotions', promos.data.length > 0)

  const activePromos = await request('GET', '/api/promotions/active')
  check('GET /promotions/active returns 200', activePromos.status === 200)

  // Validate promo code
  const validate = await request('POST', '/api/promotions/validate', { code: 'LINKRAD10', totalAmount: 1000000 })
  check('POST validate promo code returns 200', validate.status === 200)
  check('Promo code is valid', validate.data.valid === true)
  check('Discount amount calculated', validate.data.discountAmount > 0)

  // Invalid code
  const badCode = await request('POST', '/api/promotions/validate', { code: 'FAKECODE', totalAmount: 1000000 })
  check('Invalid promo code returns 404', badCode.status === 404)

  // Promo codes list
  if (promos.data.length > 0) {
    const codes = await request('GET', `/api/promotions/${promos.data[0]._id}/codes`)
    check('GET promo codes returns 200', codes.status === 200)
  }

  // ── Booking Form ───────────────────────────────────────
  console.log('\n6. BOOKING FORM (public)')
  // These should work without auth
  TOKEN = '' // clear token
  const bkServices = await request('GET', '/api/booking/services')
  check('GET /booking/services (no auth) returns 200', bkServices.status === 200)
  check('Has public services', bkServices.data.length > 0)

  const bkSites = await request('GET', '/api/booking/sites')
  check('GET /booking/sites (no auth) returns 200', bkSites.status === 200)

  const bkSlots = await request('GET', '/api/booking/slots?site=LinkRad%20Hai%20Phong&date=2026-04-20')
  check('GET /booking/slots returns 200', bkSlots.status === 200)
  check('Has available slots', bkSlots.data.length > 0)

  const bkSubmit = await request('POST', '/api/booking/submit', {
    name: 'Test Booking Patient', phone: '0888888888', dob: '1990-01-01', gender: 'M',
    site: 'LinkRad Hai Phong', scheduledDate: '2026-04-20', scheduledTime: '09:00',
    serviceName: 'CT sọ não',
  })
  check('POST /booking/submit returns 201', bkSubmit.status === 201)
  check('Booking returns bookingId', !!bkSubmit.data.bookingId)

  if (bkSubmit.data.bookingId) {
    const bkStatus = await request('GET', `/api/booking/status/${bkSubmit.data.bookingId}`)
    check('GET booking status returns 200', bkStatus.status === 200)
    check('Booking status is scheduled', bkStatus.data.status === 'scheduled')
  }

  // ── Summary ────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`)
  console.log('═══════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
