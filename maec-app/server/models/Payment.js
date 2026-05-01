const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema({
  _id: String,
  invoiceId: String,
  patientId: String,
  amount: Number,
  paymentMethod: {
    type: String,
    enum: ['cash', 'transfer', 'card'],
    default: 'cash',
  },
  reference: String,
  receivedBy: String,
  receivedAt: String,
  status: {
    type: String,
    enum: ['completed', 'refunded'],
    default: 'completed',
  },
  refundedAt: String,
  refundReason: String,
  createdAt: String,
}, { _id: false })

module.exports = mongoose.model('Payment', paymentSchema)
