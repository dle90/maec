/**
 * Copy the static SERVICE_OUTPUT_FIELDS config into Service.outputFields so
 * the catalog UI becomes the source of truth. After this runs, admins can
 * edit fields per service via Danh mục → Dịch vụ Khám.
 *
 * Idempotent — only sets outputFields when the Service doc has none. Any
 * service the admin has already edited via the UI is left alone.
 *
 * Run: railway run node scripts/migrate-service-output-fields.js
 */
require('../db')
const mongoose = require('mongoose')
const Service = require('../models/Service')
const SERVICE_OUTPUT_FIELDS = require('../config/serviceOutputFields')

const now = () => new Date().toISOString()

async function run() {
  console.log('═══ Service.outputFields migration ═══')
  let touched = 0, skipped = 0, missing = 0

  for (const [code, fields] of Object.entries(SERVICE_OUTPUT_FIELDS)) {
    const svc = await Service.findOne({ code })
    if (!svc) {
      console.log(`  ? ${code} — service not found in DB, skipping`)
      missing++
      continue
    }
    if ((svc.outputFields || []).length > 0) {
      console.log(`  · ${code} — already has ${svc.outputFields.length} field(s), skipping`)
      skipped++
      continue
    }
    // Normalize each field to the schema shape (drop unknown keys). Some
    // legacy select options are { value, label } objects — coerce to plain
    // strings using label (preferred) or value as the display.
    svc.outputFields = fields.map(f => ({
      key: f.key,
      label: f.label,
      type: f.type || 'text',
      options: Array.isArray(f.options)
        ? f.options.map(o => typeof o === 'string' ? o : (o?.label || o?.value || String(o)))
        : [],
      placeholder: f.placeholder || '',
      step: typeof f.step === 'number' ? f.step : undefined,
      required: !!f.required,
    }))
    svc.updatedAt = now()
    await svc.save()
    console.log(`  + ${code} — ${fields.length} field(s) seeded`)
    touched++
  }

  console.log(`\nDone. Seeded ${touched}, skipped ${skipped}, missing-from-DB ${missing}.`)
  await mongoose.connection.close()
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
