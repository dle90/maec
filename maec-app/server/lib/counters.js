const Counter = require('../models/Counter')

// Atomic next-in-sequence for a scope key. findOneAndUpdate($inc) is atomic at
// the document level, so N concurrent callers get N distinct values with zero
// races (replaces countDocuments()+1 and Math.random() suffixes).
async function nextSeq(key) {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  )
  return doc.seq
}

// UTC date stamps — match the existing generators (which use toISOString()).
const ymd = (dateStr) => dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '')
const ym = (monthStr) => monthStr || new Date().toISOString().slice(0, 7).replace('-', '')

// Format helpers reproduce the EXACT existing code shapes (printed numbers look
// identical) but draw the sequence atomically. Wired into the generators in
// Unit 2; inert until then.
async function nextInvoiceCode(dateStr) {        // HD-YYYYMMDD-NNNN  (per day)
  const d = ymd(dateStr)
  return `HD-${d}-${String(await nextSeq(`invoice:${d}`)).padStart(4, '0')}`
}
async function nextTxCode(prefix, dateStr) {     // PREFIX-YYYYMMDD-NNN  (per day, per type)
  const d = ymd(dateStr)
  return `${prefix}-${d}-${String(await nextSeq(`tx:${prefix}:${d}`)).padStart(3, '0')}`
}
async function nextStocktakeCode(monthStr) {     // KK-YYYYMM-NNN  (per month)
  const m = ym(monthStr)
  return `KK-${m}-${String(await nextSeq(`stocktake:${m}`)).padStart(3, '0')}`
}
async function nextPatientCode(dateStr) {        // BN-YYYYMMDD-NNNN  (per day)
  const d = ymd(dateStr)
  return `BN-${d}-${String(await nextSeq(`patient:${d}`)).padStart(4, '0')}`
}

module.exports = { nextSeq, nextInvoiceCode, nextTxCode, nextStocktakeCode, nextPatientCode, ymd, ym }
