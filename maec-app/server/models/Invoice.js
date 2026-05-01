const mongoose = require('mongoose')

const invoiceItemSchema = new mongoose.Schema({
  serviceCode: String,
  serviceName: String,
  quantity: { type: Number, default: 1 },
  unitPrice: Number,
  discountAmount: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  amount: Number,
}, { _id: false })

const invoiceSchema = new mongoose.Schema({
  _id: String,
  invoiceNumber: String,
  patientId: String,
  patientName: String,
  phone: String,
  appointmentId: String,
  site: String,
  // Referral source snapshot (copied from Appointment at invoice creation, immutable afterwards)
  sourceCode: String,
  sourceName: String,
  referralType: { type: String, enum: ['doctor', 'facility', 'salesperson', ''], default: '' },
  referralId: String,
  referralName: String,
  // Effective salesperson = direct NVKD if referralType='salesperson', else assignedStaff of the partner
  effectiveSalespersonId: String,
  effectiveSalespersonName: String,
  items: [invoiceItemSchema],
  subtotal: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  changeAmount: { type: Number, default: 0 },
  paymentMethod: {
    type: String,
    enum: ['cash', 'transfer', 'card', 'mixed'],
    default: 'cash',
  },
  status: {
    type: String,
    enum: ['draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'refunded'],
    default: 'draft',
  },
  issuedAt: String,
  paidAt: String,
  cancelledAt: String,
  cancelReason: String,
  createdBy: String,
  cashierId: String,
  notes: String,
  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Invoice', invoiceSchema)
