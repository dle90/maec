/**
 * Seed mock consumables data for "Hoàn tất ca chụp" testing.
 *
 * Creates:
 *   - 15 Supply items (radiology + lab consumables) with realistic VN names
 *   - Stock via InventoryLot (FIFO-ready: 2 lots each, older + newer)
 *   - SupplyServiceMapping entries linking each seeded service (SA*, CT*, MR*,
 *     XQ*, XN*) to its typical consumables + default quantities (định mức)
 *
 * Idempotent (all upserts). All _ids are prefixed with SEED-MOCK- so they're
 * easy to identify and remove via the companion cleanup script if needed.
 *
 * Run:
 *   node linkrad-app/server/scripts/seed-consumables-mock.js          # write
 *   node linkrad-app/server/scripts/seed-consumables-mock.js --dry    # preview
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')
const Supply = require('../models/Supply')
const InventoryLot = require('../models/InventoryLot')
const SupplyServiceMapping = require('../models/SupplyServiceMapping')

const DRY = process.argv.includes('--dry')
const now = () => new Date().toISOString()

// ── Supplies ──────────────────────────────────────────────────────────────
// _id: SEED-MOCK-SUP-<CODE>  ·  status: active  ·  site: '' (global, no scoping)
const SUPPLIES = [
  { code: 'GEL-US',   name: 'Gel siêu âm',                              unit: 'mL',     initStock: 2450 },
  { code: 'GIAY-IN',  name: 'Giấy in ảnh nhiệt Sony UPP-110S',          unit: 'tờ',     initStock: 400 },
  { code: 'CN-OMNI',  name: 'Thuốc cản quang Omnipaque 350 mgI/mL',     unit: 'mL',     initStock: 5000 },
  { code: 'CN-GADO',  name: 'Thuốc cản quang Gadovist 1.0',             unit: 'mL',     initStock: 1500 },
  { code: 'KIM-20G',  name: 'Kim cannula 20G',                          unit: 'cái',    initStock: 200 },
  { code: 'KIM-22G',  name: 'Kim cannula 22G',                          unit: 'cái',    initStock: 200 },
  { code: 'ONG-50',   name: 'Ống tiêm 50mL',                            unit: 'cái',    initStock: 120 },
  { code: 'ONG-10',   name: 'Ống tiêm 10mL',                            unit: 'cái',    initStock: 250 },
  { code: 'BONG-CON', name: 'Bông gòn y tế tẩm cồn',                    unit: 'miếng',  initStock: 800 },
  { code: 'BANG-DINH',name: 'Băng dính y tế (cuộn 5m)',                 unit: 'cuộn',   initStock: 60 },
  { code: 'GANG-YT',  name: 'Găng tay y tế (không bột)',                unit: 'cái',    initStock: 1200 },
  { code: 'PHIM-XR',  name: 'Phim X-quang 14×17',                       unit: 'tờ',     initStock: 300 },
  { code: 'KHAN-LOT', name: 'Khăn lót giấy (dùng một lần)',             unit: 'chiếc',  initStock: 600 },
  { code: 'ONG-EDTA', name: 'Ống nghiệm EDTA (chống đông máu)',         unit: 'ống',    initStock: 500 },
  { code: 'CHAI-MC',  name: 'Chai máu cấy Bactec (hiếu khí/kỵ khí)',    unit: 'chai',   initStock: 60 },
]

// ── SupplyServiceMapping (định mức) ──────────────────────────────────────
// Keyed by service code; each maps to a list of { supplyCode, quantity }.
// The script looks up supplyId/supplyName/unit from the SUPPLIES table above.
const MAPPINGS = {
  // Siêu âm — gel + giấy in + khăn
  SA020: [{ s: 'GEL-US', q: 30 }, { s: 'GIAY-IN', q: 1 }, { s: 'KHAN-LOT', q: 1 }],
  SA026: [{ s: 'GEL-US', q: 15 }, { s: 'GIAY-IN', q: 1 }, { s: 'KHAN-LOT', q: 1 }],
  SA028: [{ s: 'GEL-US', q: 30 }, { s: 'GIAY-IN', q: 1 }, { s: 'KHAN-LOT', q: 1 }],

  // X-Quang — phim + khăn
  XQ001: [{ s: 'PHIM-XR', q: 1 }, { s: 'KHAN-LOT', q: 1 }],
  XQ002: [{ s: 'PHIM-XR', q: 1 }, { s: 'KHAN-LOT', q: 1 }],

  // CT — không tiêm vs có tiêm
  CT001: [{ s: 'KHAN-LOT', q: 1 }],
  CT002: [
    { s: 'CN-OMNI', q: 80 }, { s: 'KIM-20G', q: 1 }, { s: 'ONG-50', q: 1 },
    { s: 'BONG-CON', q: 2 }, { s: 'BANG-DINH', q: 1 }, { s: 'KHAN-LOT', q: 1 },
  ],
  CT003: [
    { s: 'CN-OMNI', q: 100 }, { s: 'KIM-20G', q: 1 }, { s: 'ONG-50', q: 1 },
    { s: 'BONG-CON', q: 2 }, { s: 'BANG-DINH', q: 1 }, { s: 'KHAN-LOT', q: 1 },
  ],
  CT004: [
    { s: 'CN-OMNI', q: 100 }, { s: 'KIM-20G', q: 1 }, { s: 'ONG-50', q: 1 },
    { s: 'BONG-CON', q: 2 }, { s: 'BANG-DINH', q: 1 }, { s: 'KHAN-LOT', q: 1 },
  ],

  // MRI — Gadovist + kim + ống tiêm nhỏ
  MR001: [
    { s: 'CN-GADO', q: 15 }, { s: 'KIM-22G', q: 1 }, { s: 'ONG-10', q: 1 },
    { s: 'BONG-CON', q: 2 }, { s: 'BANG-DINH', q: 1 }, { s: 'GANG-YT', q: 2 }, { s: 'KHAN-LOT', q: 1 },
  ],
  MR002: [
    { s: 'CN-GADO', q: 20 }, { s: 'KIM-22G', q: 1 }, { s: 'ONG-10', q: 1 },
    { s: 'BONG-CON', q: 2 }, { s: 'BANG-DINH', q: 1 }, { s: 'GANG-YT', q: 2 }, { s: 'KHAN-LOT', q: 1 },
  ],

  // XN — lab
  XN001: [
    { s: 'ONG-EDTA', q: 1 }, { s: 'KIM-22G', q: 1 }, { s: 'BONG-CON', q: 1 },
    { s: 'BANG-DINH', q: 1 }, { s: 'GANG-YT', q: 2 },
  ],
}

const supplyId = (code) => `SEED-MOCK-SUP-${code}`
const lotId    = (code, n) => `SEED-MOCK-LOT-${code}-${n}`
const mapId    = (svc, code) => `SEED-MOCK-MAP-${svc}-${code}`

async function run() {
  const tag = DRY ? '[DRY RUN] ' : ''
  console.log(`${tag}Seeding mock consumables data to ${process.env.MONGO_URI || 'default'}…\n`)

  // ── Supplies ──────────────────────────────────────────────────────────
  for (const s of SUPPLIES) {
    const doc = {
      _id: supplyId(s.code),
      code: s.code,
      name: s.name,
      unit: s.unit,
      categoryId: '',
      packagingSpec: '',
      conversionRate: 1,
      minimumStock: Math.max(10, Math.floor(s.initStock * 0.1)),
      currentStock: s.initStock,
      supplierId: '',
      status: 'active',
      updatedAt: now(),
    }
    if (DRY) {
      console.log(`  supply ${s.code.padEnd(10)} → ${s.name} (${s.initStock} ${s.unit})`)
    } else {
      await Supply.findByIdAndUpdate(
        doc._id,
        { ...doc, $setOnInsert: { createdAt: now() } },
        { upsert: true, setDefaultsOnInsert: true }
      )
    }
  }
  console.log(`${tag}✓ ${SUPPLIES.length} supplies`)

  // ── Inventory lots (2 per supply, older + newer, for FIFO testing) ────
  // Older lot gets 40% of stock, newer lot gets 60%. FIFO should drain
  // the older one first.
  let lotCount = 0
  for (const s of SUPPLIES) {
    const olderQty = Math.floor(s.initStock * 0.4)
    const newerQty = s.initStock - olderQty
    const lots = [
      {
        _id: lotId(s.code, 1),
        lotNumber: `L-${s.code}-2601`,
        manufacturingDate: '2026-01-05',
        expiryDate: '2028-01-05',
        importDate: '2026-02-10',
        createdAt: '2026-02-10T09:00:00.000Z',
        initialQuantity: olderQty,
        currentQuantity: olderQty,
      },
      {
        _id: lotId(s.code, 2),
        lotNumber: `L-${s.code}-2604`,
        manufacturingDate: '2026-03-15',
        expiryDate: '2028-03-15',
        importDate: '2026-04-02',
        createdAt: '2026-04-02T09:00:00.000Z',
        initialQuantity: newerQty,
        currentQuantity: newerQty,
      },
    ]
    for (const lot of lots) {
      const doc = {
        ...lot,
        supplyId: supplyId(s.code),
        site: 'DEPT-HN',
        warehouseId: 'WH-HN',
        importTransactionId: '',
        unitPrice: 0,
        status: 'available',
      }
      if (DRY) {
        console.log(`  lot ${doc._id.padEnd(36)} qty=${lot.currentQuantity}`)
      } else {
        await InventoryLot.findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true })
      }
      lotCount++
    }
  }
  console.log(`${tag}✓ ${lotCount} inventory lots`)

  // ── Mappings (định mức) ───────────────────────────────────────────────
  const supplyByCode = Object.fromEntries(SUPPLIES.map(s => [s.code, s]))
  let mapCount = 0
  for (const [svcCode, items] of Object.entries(MAPPINGS)) {
    for (const { s: sCode, q } of items) {
      const sup = supplyByCode[sCode]
      if (!sup) { console.warn(`! missing supply ${sCode} for service ${svcCode}`); continue }
      const doc = {
        _id: mapId(svcCode, sCode),
        serviceId: '',
        serviceCode: svcCode,
        serviceName: '',
        supplyId: supplyId(sCode),
        supplyCode: sCode,
        supplyName: sup.name,
        quantity: q,
        unit: sup.unit,
        updatedAt: now(),
      }
      if (DRY) {
        console.log(`  map ${svcCode.padEnd(6)} → ${sCode.padEnd(10)} × ${q} ${sup.unit}`)
      } else {
        await SupplyServiceMapping.findByIdAndUpdate(
          doc._id,
          { ...doc, $setOnInsert: { createdAt: now() } },
          { upsert: true, setDefaultsOnInsert: true }
        )
      }
      mapCount++
    }
  }
  console.log(`${tag}✓ ${mapCount} supply-service mappings`)

  console.log(`\n${tag}Done.`)
  process.exit(0)
}

run().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
