/**
 * Upload the 3 source vendor docs in equipments/ to R2 and link them to the
 * Equipment rows seeded by seed-equipment.js. Each contract/quote attaches to
 * every device it covers — so the slit lamp (TB-002) and the patient chair
 * (TB-007) both link to HD2636 even though they're separate units.
 *
 *   node scripts/attach-equipment-contracts.js --dry-run
 *   railway run node scripts/attach-equipment-contracts.js
 *
 * Idempotent — deterministic _ids (sha8 of equipmentId + filename), re-runs
 * upsert metadata + re-PUT bytes for the same key.
 */
const DRY = process.argv.includes('--dry-run')
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const r2 = require('../lib/r2')

const SRC_DIR = 'd:/_works/maec/equipments'
const STAMP = '2026-05-23T00:00:00.000Z'
const UPLOADER = 'import-script'

// Source files identified by stable substring (filenames have Vietnamese chars
// + spaces; read directory at runtime to dodge normalisation issues).
const SRC = [
  {
    key: 'hd2636',
    matchRx: /HĐMB-2636/i,
    displayName: 'HD2636-NH-MA — Hợp đồng mua bán (Nam Hưng, 25-03-2026).docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'contract',
    // Nam Hưng contract covers TB-001..TB-007 (6 line items, TCS-880 ×2)
    equipmentIds: ['TB-001','TB-002','TB-003','TB-004','TB-005','TB-006','TB-007'],
  },
  {
    key: 'medmont',
    matchRx: /Medmont/i,
    displayName: 'HĐMB Medmont Professional — Y Tế Mỹ (draft).doc',
    mime: 'application/msword',
    kind: 'contract',
    equipmentIds: ['TB-008'],
  },
  {
    key: 'ikachi',
    matchRx: /Ikachart/i,
    displayName: 'IKACHI — Báo giá IKAChart (13-03-2026).pdf',
    mime: 'application/pdf',
    kind: 'quote',
    equipmentIds: ['TB-009', 'TB-010', 'TB-011'],
  },
]

function resolvePaths() {
  const files = fs.readdirSync(SRC_DIR)
  for (const s of SRC) {
    const match = files.find(f => s.matchRx.test(f))
    if (!match) throw new Error(`Source for ${s.key} not found in ${SRC_DIR} (regex ${s.matchRx})`)
    s.absPath = path.join(SRC_DIR, match)
    s.bytes = fs.statSync(s.absPath).size
  }
}

const keySafe = (n) => (n || 'file').normalize('NFC').replace(/[^\w.\-]+/g, '_').slice(0, 120)
const attachmentId = (equipmentId, filename) =>
  `ATT-eq-${crypto.createHash('sha1').update(`${equipmentId}::${filename}`).digest('hex').slice(0, 10)}`

async function main() {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'LIVE'}\n`)
  resolvePaths()

  console.log('Source files:')
  for (const s of SRC) {
    console.log(`  ${s.key.padEnd(8)} ${path.basename(s.absPath)}  (${(s.bytes / 1024).toFixed(0)} KB)`)
    console.log(`           → ${s.equipmentIds.length} thiết bị: ${s.equipmentIds.join(', ')}`)
  }
  console.log('')

  if (!DRY) {
    if (!r2.isConfigured()) {
      console.error('FAIL — R2 not configured')
      process.exit(1)
    }
    require('../db')
    const mongoose = require('mongoose')
    await mongoose.connection.asPromise()
  }

  const Equipment = !DRY && require('../models/Equipment')
  const EquipmentAttachment = !DRY && require('../models/EquipmentAttachment')

  let ok = 0, skip = 0, fail = 0
  // R2 cache: read each source PDF/DOCX once, push to each equipment's key.
  for (const s of SRC) {
    const body = fs.readFileSync(s.absPath)
    for (const eqId of s.equipmentIds) {
      const attId = attachmentId(eqId, s.displayName)
      const key = `equipment/${eqId}/${attId}/${keySafe(s.displayName)}`
      const tag = `${eqId}  ${s.kind.padEnd(8)}  ${s.displayName}`
      try {
        if (!DRY) {
          const eq = await Equipment.findById(eqId).lean()
          if (!eq) { console.log(`  SKIP  ${tag}   (equipment not found)`); skip++; continue }
        }
        if (DRY) {
          console.log(`  PLAN  ${tag}   bytes=${body.length}`)
          console.log(`        key=${key}`)
        } else {
          await r2.putObject(key, body, s.mime)
          await EquipmentAttachment.updateOne(
            { _id: attId },
            { $set: {
                _id: attId,
                equipmentId: eqId,
                filename: s.displayName,
                mimeType: s.mime,
                size: body.length,
                kind: s.kind,
                storage: 'r2',
                r2Key: key,
                uploadedBy: UPLOADER,
                uploadedByName: 'Nhập tự động từ tài liệu nhà cung cấp',
                uploadedAt: STAMP,
              } },
            { upsert: true },
          )
          console.log(`  ✓     ${tag}`)
        }
        ok++
      } catch (err) {
        console.log(`  FAIL  ${tag}   ${err.message}`)
        fail++
      }
    }
  }

  console.log(`\nDone — ok=${ok}, skip=${skip}, fail=${fail}`)
  if (!DRY) await require('mongoose').disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(err => { console.error('SCRIPT FAILED:', err); process.exit(1) })
