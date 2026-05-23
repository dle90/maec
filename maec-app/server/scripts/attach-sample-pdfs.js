/**
 * Attach the "Hồ sơ PK Minh Anh" sample PDFs to their corresponding
 * encounters via Cloudflare R2 + EncounterAttachment.
 *
 * Mirrors the attachment route's upload flow (lib/r2.js + EncounterAttachment
 * model) but uses deterministic attachment _ids so the script is idempotent —
 * re-runs upsert metadata and re-PUT bytes for the same key, never duplicate.
 *
 * Multi-visit handwritten PDFs are SPLIT per-visit with pdf-lib before upload:
 * each encounter gets only the pages that belong to its visit date. Source PDFs
 * with date-uncertain pages are bundled with the nearest dated visit.
 *
 *   node scripts/attach-sample-pdfs.js --dry-run    # preview, no R2/DB writes
 *   railway run node scripts/attach-sample-pdfs.js  # real run (prod R2 + Atlas)
 *
 * Sources read from:  d:/_works/maec/patient pdf/unzipped/Hồ sơ PK Minh Anh/
 * (paths hardcoded — this is a one-shot helper, not part of the live app.)
 */

const DRY = process.argv.includes('--dry-run')
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PDFDocument } = require('pdf-lib')

const r2 = require('../lib/r2')

// Source filenames in the unzipped Vietnamese-named folder. Read at runtime
// so we don't need to track unicode normalization.
const SRC_DIR = 'd:/_works/maec/patient pdf/unzipped/Hồ sơ PK Minh Anh'
const FILE_MATCH = {
  khoi:              /Sinh\s*tr.+nh.+n\s*c/i,        // "Sinh trắc học nhãn cầu"
  'trang-gaithi':    /OCT\s*GAI\s*THI/i,
  'trang-hoangdiem': /OCT\s*HOANG\s*DIEM/i,
  'trang-trucnhancau': /OCT\s*TRUC\s*NHAN\s*CAU/i,
  'thu-2':           /BandogiacmacNguyenAnhThu2/i,
  'thu-3':           /BandogiacmacNguyenAnhThu3/i,
  trong:             /k.+nh\s*g.+ng/i,                // "Kiểm soát ... kính gọng"
  tung:              /Kinh\s*ti.+c\s*c.+ng/i,         // "Kinh tiếp xúc cứng"
  thao:              /OrthoK/i,
  dipanh:            /thu.+c_1/i,                     // "...bằng thuốc_1"
}

// Per-attachment plan: which source file (by key above), which 1-indexed pages
// (null = whole file), and which encounter to attach it to. The `label` becomes
// the user-visible filename suffix so the UI shows distinct entries.
const PLAN = [
  // ─── Digital device PDFs (no split — one file per encounter) ──────────
  { src: 'khoi',              pages: null, encounterId: 'enc-hoso-khoi-1',  label: 'AB800 Sinh trắc nhãn cầu.pdf' },
  { src: 'trang-gaithi',      pages: null, encounterId: 'enc-hoso-trang-1', label: 'OCT gai thị.pdf' },
  { src: 'trang-hoangdiem',   pages: null, encounterId: 'enc-hoso-trang-1', label: 'OCT hoàng điểm.pdf' },
  { src: 'trang-trucnhancau', pages: null, encounterId: 'enc-hoso-trang-1', label: 'OCT trục nhãn cầu.pdf' },
  { src: 'thu-2',             pages: null, encounterId: 'enc-hoso-thu-1',   label: 'Bản đồ giác mạc (Medmont) — 18-10-2025.pdf' },
  { src: 'thu-3',             pages: null, encounterId: 'enc-hoso-thu-2',   label: 'Bản đồ giác mạc (Medmont) — 21-05-2026.pdf' },

  // ─── trong.pdf (10 pages, 4 visits + intake) ──────────────────────────
  { src: 'trong', pages: [1,2,3,4,5], encounterId: 'enc-hoso-trong-1', label: 'Phiếu theo dõi cận thị — 28-09-2024 (intake + p1-5).pdf' },
  { src: 'trong', pages: [6,7],       encounterId: 'enc-hoso-trong-2', label: 'Phiếu theo dõi cận thị — 09-04-2025.pdf' },
  { src: 'trong', pages: [8,9],       encounterId: 'enc-hoso-trong-3', label: 'Phiếu theo dõi cận thị — 08-11-2025.pdf' },
  { src: 'trong', pages: [10],        encounterId: 'enc-hoso-trong-4', label: 'Phiếu theo dõi cận thị — 22-11-2025.pdf' },

  // ─── tung.pdf (5 pages, 4 visits + 1 orphan) ──────────────────────────
  { src: 'tung', pages: [3],   encounterId: 'enc-hoso-tung-1', label: 'Phiếu khám KTX — 15-02-2022.pdf' },
  { src: 'tung', pages: [2],   encounterId: 'enc-hoso-tung-2', label: 'Phiếu khám KTX — 15-12-2022.pdf' },
  { src: 'tung', pages: [4,5], encounterId: 'enc-hoso-tung-3', label: 'Phiếu khám KTX — 28-11-2023 + 11-01-2024.pdf' },  // orphan 28/11/23 bundled
  { src: 'tung', pages: [1],   encounterId: 'enc-hoso-tung-4', label: 'Phiếu khám KTX — 14-03-2025.pdf' },

  // ─── thao.pdf (4 pages, 3 visits + 1 orphan) ──────────────────────────
  { src: 'thao', pages: [1],   encounterId: 'enc-hoso-thao-1', label: 'Phiếu khám Ortho-K — 26-02-2026.pdf' },
  { src: 'thao', pages: [2],   encounterId: 'enc-hoso-thao-2', label: 'Phiếu khám Ortho-K — 12-03-2026.pdf' },
  { src: 'thao', pages: [3,4], encounterId: 'enc-hoso-thao-3', label: 'Phiếu khám Ortho-K — 31-03-2026 + 12-05-2026.pdf' },  // orphan 12/5/26 bundled

  // ─── dipanh.pdf (12 pages, 4 visits + 2 orphans) ──────────────────────
  { src: 'dipanh', pages: [3,4],            encounterId: 'enc-hoso-dipanh-1', label: 'Phiếu theo dõi cận thị — 16-03-2024.pdf' },
  { src: 'dipanh', pages: [1,2,5,6,7,8],    encounterId: 'enc-hoso-dipanh-2', label: 'Phiếu theo dõi cận thị — 24-11-2024 + 28-09-2024 + 21-02-2025.pdf' },  // 2 orphans bundled
  { src: 'dipanh', pages: [9,10],           encounterId: 'enc-hoso-dipanh-3', label: 'Phiếu theo dõi cận thị — 23-10-2025.pdf' },
  { src: 'dipanh', pages: [11,12],          encounterId: 'enc-hoso-dipanh-4', label: 'Phiếu theo dõi cận thị — 19-03-2026.pdf' },
]

const STAMP = '2026-05-23T00:00:00.000Z'
const UPLOADER = 'import-script'

function resolveSourcePaths() {
  const files = fs.readdirSync(SRC_DIR)
  const out = {}
  for (const [key, rx] of Object.entries(FILE_MATCH)) {
    const match = files.find(f => rx.test(f))
    if (!match) throw new Error(`Source PDF for "${key}" not found in ${SRC_DIR} (regex ${rx})`)
    out[key] = path.join(SRC_DIR, match)
  }
  return out
}

// Deterministic attachment _id — re-running upserts cleanly instead of
// creating duplicate rows. Hash of (encounterId + label) is short + stable.
function attachmentId(encounterId, label) {
  const h = crypto.createHash('sha1').update(`${encounterId}::${label}`).digest('hex').slice(0, 10)
  return `ATT-hoso-${h}`
}

// R2 object key — single canonical path per attachment id.
function r2Key(encounterId, attId, filename) {
  return `encounters/${encounterId}/${attId}/${filename}`
}

// Returns a Buffer with either the whole PDF (pages=null) or just the chosen
// 1-indexed pages, copied into a fresh single-file PDF.
async function extractPages(srcPath, pages /* 1-indexed | null */) {
  const bytes = fs.readFileSync(srcPath)
  if (!pages) return bytes

  const src = await PDFDocument.load(bytes)
  const out = await PDFDocument.create()
  const idxs = pages.map(n => n - 1)  // 1-indexed → 0-indexed
  const max = src.getPageCount()
  for (const i of idxs) {
    if (i < 0 || i >= max) throw new Error(`Page ${i+1} out of range (${srcPath} has ${max} pages)`)
  }
  const copied = await out.copyPages(src, idxs)
  copied.forEach(p => out.addPage(p))
  return Buffer.from(await out.save())
}

async function main() {
  console.log(`Mode: ${DRY ? 'DRY-RUN (no R2 / DB writes)' : 'LIVE'}\n`)

  const paths = resolveSourcePaths()
  console.log(`Source PDFs (${Object.keys(paths).length}):`)
  for (const [k, p] of Object.entries(paths)) console.log(`  ${k.padEnd(20)}  ${path.basename(p)}`)
  console.log('')

  if (!DRY) {
    if (!r2.isConfigured()) {
      console.error('FAIL — R2 not configured. Need R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.')
      process.exit(1)
    }
    require('../db')
    const mongoose = require('mongoose')
    await mongoose.connection.asPromise()
  }

  const Encounter = !DRY && require('../models/Encounter')
  const EncounterAttachment = !DRY && require('../models/EncounterAttachment')

  console.log(`Plan: ${PLAN.length} attachments → ${new Set(PLAN.map(p => p.encounterId)).size} encounters\n`)

  let ok = 0, skip = 0, fail = 0
  for (const item of PLAN) {
    const attId = attachmentId(item.encounterId, item.label)
    const tag = `${item.encounterId.padEnd(22)}  ${item.pages ? `[p ${item.pages.join(',')}]`.padEnd(14) : '[whole file]  '}  ${item.label}`
    try {
      // Verify the encounter exists (skip on live run if it doesn't — better
      // than a dangling attachment that can't be reached from any UI).
      if (!DRY) {
        const enc = await Encounter.findById(item.encounterId).lean()
        if (!enc) {
          console.log(`  SKIP  ${tag}   (encounter not found)`)
          skip++
          continue
        }
      }

      const body = await extractPages(paths[item.src], item.pages)
      const key = r2Key(item.encounterId, attId, item.label)

      if (DRY) {
        console.log(`  PLAN  ${tag}   bytes=${body.length}`)
        console.log(`        key=${key}`)
      } else {
        await r2.putObject(key, body, 'application/pdf')
        await EncounterAttachment.updateOne(
          { _id: attId },
          { $set: {
              _id: attId,
              encounterId: item.encounterId,
              patientId: undefined,  // filled by lookup below
              filename: item.label,
              mimeType: 'application/pdf',
              size: body.length,
              storage: 'r2',
              r2Key: key,
              uploadedBy: UPLOADER,
              uploadedByName: 'Nhập tự động từ hồ sơ PK Minh Anh',
              uploadedAt: STAMP,
            } },
          { upsert: true },
        )
        // Backfill patientId from the encounter so the doc matches a manual upload.
        const enc = await Encounter.findById(item.encounterId).lean()
        if (enc?.patientId) {
          await EncounterAttachment.updateOne({ _id: attId }, { $set: { patientId: enc.patientId } })
        }
        console.log(`  ✓     ${tag}`)
      }
      ok++
    } catch (err) {
      console.log(`  FAIL  ${tag}   ${err.message}`)
      fail++
    }
  }

  console.log(`\nDone — ok=${ok}, skip=${skip}, fail=${fail}`)
  if (!DRY) {
    await require('mongoose').disconnect()
  }
  process.exit(fail ? 1 : 0)
}

main().catch(err => { console.error('SCRIPT FAILED:', err); process.exit(1) })
