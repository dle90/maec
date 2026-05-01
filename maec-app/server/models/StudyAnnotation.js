const mongoose = require('mongoose')

const studyAnnotationSchema = new mongoose.Schema({
  _id: String,
  studyId: { type: String, index: true },
  studyUID: String,
  measurements: String,     // JSON string of OHIF measurement export
  measurementCount: { type: Number, default: 0 },
  savedBy: String,          // username
  savedByName: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('StudyAnnotation', studyAnnotationSchema)
