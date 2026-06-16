const mongoose = require('mongoose')

// Atomic sequence counters for human-facing codes (invoice / inventory-tx /
// stocktake / patient). One document per scope key (e.g. "invoice:20260616",
// "tx:NK:20260616", "stocktake:202606", "patient:20260616"). nextSeq() bumps
// `seq` atomically via findOneAndUpdate($inc, {upsert}) so any number of
// concurrent callers get distinct values with zero race — replacing the old
// countDocuments()+1 and Math.random() suffix generators. See lib/counters.js.
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}, { _id: false })

module.exports = mongoose.model('Counter', counterSchema)
