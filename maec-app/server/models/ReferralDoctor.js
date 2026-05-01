const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  _id: String,
  code: String,
  name: String,
  phone: String,
  email: String,
  idCard: String,          // Số CCCD
  address: String,
  gender: String,          // Giới tính: M / F
  dob: String,             // Ngày sinh
  specialty: String,       // Chuyên khoa
  workplace: String,       // Nơi làm việc
  area: String,            // Địa bàn
  paymentMethod: String,   // Hình thức thanh toán
  bankAccount: String,     // STK
  bankName: String,        // Ngân hàng
  assignedStaff: String,   // Nhân viên theo dõi
  firstReferralDate: String, // Ngày gửi đầu tiên
  contractDate: String,    // Ngày hợp đồng
  notes: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: String, updatedAt: String,
}, { _id: false })
module.exports = mongoose.model('ReferralDoctor', schema)
