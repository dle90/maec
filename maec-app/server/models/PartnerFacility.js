const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  type: { type: String, enum: ['hospital', 'clinic', 'lab', 'other'], default: 'hospital' },
  phone: String,
  address: String,
  specialty: String,        // Chuyên khoa
  clinicHeadName: String,   // Tên trưởng phòng khám
  contactPerson: String,    // Tên người liên hệ
  email: String,
  area: String,             // Địa bàn
  paymentMethod: String,    // Hình thức thanh toán
  bankAccount: String,      // STK
  bankName: String,         // Ngân hàng
  firstReferralDate: String, // Ngày gửi đầu tiên
  contractDate: String,     // Ngày hợp đồng
  assignedStaff: String,    // Người theo dõi
  notes: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String, updatedAt: String,
}, { _id: false })
module.exports = mongoose.model('PartnerFacility', schema)
