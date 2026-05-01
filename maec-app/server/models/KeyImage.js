const mongoose = require('mongoose')

const keyImageSchema = new mongoose.Schema({
  _id: String,
  studyId: { type: String, index: true },
  studyUID: String,
  seriesUID: String,
  instanceUID: String,
  frameNumber: { type: Number, default: 0 },
  description: String,
  flaggedBy: String,
  flaggedByName: String,
  createdAt: String,
}, { _id: false })

module.exports = mongoose.model('KeyImage', keyImageSchema)
