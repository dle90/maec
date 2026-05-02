const mongoose = require('mongoose')

// Bill item subdoc with stable _id. Inline-array shorthand inside a schema
// that has `{ _id: false }` doesn't reliably auto-add subdoc _ids, so we
// declare an explicit subschema (Mongoose's `new Schema(...)` defaults to
// adding _id, which is what we want — the DELETE endpoint uses it to delete
// the right item even when concurrent edits shift the array order.
const billItemSchema = new mongoose.Schema({
  kind: { type: String, enum: ['service', 'package', 'kinh', 'thuoc'] },
  code: String,
  name: String,
  qty: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  addedBy: String,
  addedAt: String,
  note: String,
}) // implicit _id: true — Mongoose auto-generates ObjectId per item

const encounterSchema = new mongoose.Schema({
  _id: String,
  studyUID: String,
  patientName: String,
  patientId: String,
  dob: String,
  gender: { type: String, enum: ['M', 'F'] },
  examType: String,
  modality: String,
  bodyPart: String,
  clinicalInfo: String,
  // Doctor's conclusion / diagnosis written after the exam. Free text.
  // Surfaces in the encounter pane + the printed phiếu khám.
  conclusion: String,
  site: String,
  scheduledDate: String,
  studyDate: String,
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'pending_read', 'reading', 'reported', 'verified', 'completed', 'partial', 'paid', 'cancelled'],
    default: 'scheduled',
  },
  // First-payment denormalised fields — kept for backward compatibility with
  // existing rows + simple report queries. Source of truth going forward is
  // the `payments[]` ledger below; these fields mirror its first 'payment'
  // entry (paidAt = first payment's `at`, paidByName = first payment's
  // `byName`, paidAmount = net positive sum across all payments / refunds).
  paidAt: String,
  paidBy: String,
  paidByName: String,
  paidAmount: Number,
  // Q3 — Payment ledger. Each entry is a positive `amount`; the discriminator
  // `kind` distinguishes 'payment' (cashier collected money) from 'refund'
  // (cashier returned money). Net paid = sum(payment) - sum(refund). When net
  // ≥ grandTotal, status = 'paid'; partial otherwise. Stock-return reversals
  // for kính/thuốc trên bill are handled by a separate inventory transaction
  // referenced via stockReturnTxId.
  payments: {
    type: [{
      at: String,
      by: String,
      byName: String,
      amount: { type: Number, default: 0 },
      method: { type: String, enum: ['cash', 'transfer', 'card', 'mixed', ''], default: '' },
      kind: { type: String, enum: ['payment', 'refund'], default: 'payment' },
      reason: String,
      // Inventory transaction created when refund opted to return stock.
      // Only set on refund entries; null on payment entries.
      stockReturnTxId: String,
    }],
    default: [],
  },
  cancelledAt: String,
  cancelledBy: String,
  cancelReason: String,
  priority: {
    type: String,
    enum: ['routine', 'urgent', 'stat'],
    default: 'routine',
  },
  technician: String,
  technicianName: String,
  radiologist: String,
  radiologistName: String,
  assignedAt: String,
  reportId: String,
  reportText: { type: String, default: '' },
  reportedAt: String,
  verifiedAt: String,
  imageStatus: {
    type: String,
    enum: ['no_images', 'receiving', 'available'],
    default: 'no_images',
  },
  imageCount: { type: Number, default: 0 },
  consumables: {
    type: [{
      supplyId: String,
      supplyCode: String,
      supplyName: String,
      unit: String,
      standardQty: { type: Number, default: 0 },
      actualQty: { type: Number, default: 0 },
      notes: String,
    }],
    default: [],
  },
  consumablesDeductedAt: String,
  consumablesTransactionId: String,

  // Multiple packages per encounter — a package is a combo of services that
  // can stack (e.g. Khám mắt cơ bản + Atropin myopia control). Replaces the
  // old single packageCode/Name/Tier triple as of 2026-05-02.
  packages: {
    type: [{
      code: String,
      name: String,
      tier: String,
      addedAt: String,
      addedBy: String,
    }],
    default: [],
  },

  assignedServices: {
    type: [{
      serviceCode: String,
      serviceName: String,
      status: { type: String, enum: ['pending', 'in_progress', 'done', 'skipped'], default: 'pending' },
      assignedTo: String,
      assignedToName: String,
      startedAt: String,
      completedAt: String,
      output: { type: mongoose.Schema.Types.Mixed, default: {} },
      coveredByEntitlement: { type: Boolean, default: false },
      entitlementId: String,
      // When non-empty, identifies the package that added this service so
      // removing the package can clean up its services.
      addedByPackage: String,
    }],
    default: [],
  },

  billItems: { type: [billItemSchema], default: [] },

  // Sum of billItems totalPrice (no discount applied).
  billTotal: { type: Number, default: 0 },
  // Bill-level discount. Either absolute (discountAmount, in VND) OR percent
  // (discountPercent, 0-100) — mutually exclusive. When discountPercent > 0
  // it takes precedence; effective discount = round(billTotal * percent/100).
  discountAmount: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountReason: String,

  createdAt: String,
  updatedAt: String,
}, { _id: false })

module.exports = mongoose.model('Encounter', encounterSchema)
