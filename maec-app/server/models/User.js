const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  _id: String,          // username / mã nhân viên
  password: String,
  role: String,         // legacy primary role (admin, giamdoc, truongphong, bacsi, nhanvien, guest)
  // Multi-role assignments — each entry is a functional role.
  // siteId is null for group-scope roles, set to a specific site for site-scope roles.
  assignments: {
    type: [{
      roleId: { type: String, required: true },
      siteId: { type: String, default: null },
    }],
    default: [],
  },
  employeeType: String, // loại hình HV (full_time, part_time, contract, intern)
  department: String,
  departmentId: String,
  displayName: String,  // họ tên
  gender: String,       // giới tính (M/F)
  idCard: String,       // CCCD
  dob: String,          // ngày sinh
  phone: String,        // số điện thoại
  email: String,
  education: String,    // trình độ
  address: String,      // địa chỉ
  joinDate: String,     // ngày vào làm
  socialInsuranceNo: String,  // số BHXH
  insuranceDate: String,      // ngày tham gia BH
  taxCode: String,            // mã số thuế
  taxCodePlace: String,       // nơi cấp mã số thuế
  avatarUrl: String,          // hình ảnh đại diện
  signatureUrl: String,       // ảnh chữ ký
  fingerprintUrl: String,     // vân tay
  position: String,                                                             // chức danh (HR)
  employmentStatus: { type: String, enum: ['active', 'inactive', 'resigned'], default: 'active' },
  notes: String,                                                                // ghi chú HR
}, { _id: false })

// Use _id as the primary key (username)
userSchema.set('_id', true)

module.exports = mongoose.model('User', userSchema)
