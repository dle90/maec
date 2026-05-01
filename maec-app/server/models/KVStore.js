const mongoose = require('mongoose')

// Generic key-value store for blob data (sites, pl, cf, bs, breakeven, actuals)
const kvSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed,
}, { _id: false })

kvSchema.set('_id', true)

module.exports = mongoose.model('KVStore', kvSchema)
