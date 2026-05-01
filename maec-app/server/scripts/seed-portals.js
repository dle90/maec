/**
 * Seed data for Patient Portal & Partner Portal
 * Run: node scripts/seed-portals.js
 */
require('../db')
const crypto = require('crypto')

const Patient = require('../models/Patient')
const PatientAccount = require('../models/PatientAccount')
const PatientFeedback = require('../models/PatientFeedback')
const PartnerFacility = require('../models/PartnerFacility')
const PartnerAccount = require('../models/PartnerAccount')
const PartnerReferral = require('../models/PartnerReferral')
const CommissionGroup = require('../models/CommissionGroup')
const CommissionRule = require('../models/CommissionRule')
const Appointment = require('../models/Appointment')
const Invoice = require('../models/Invoice')
const Study = require('../models/Study')

const now = () => new Date().toISOString()

async function seed() {
  console.log('Seeding portal data...\n')

  // ═══════════════════════════════════════════════════════
  // PATIENTS (ensure they exist for portal login)
  // ═══════════════════════════════════════════════════════
  const patients = [
    { _id: 'PAT-001', patientId: 'BN001', name: 'Nguyễn Văn Nam', dob: '1975-04-12', gender: 'M', phone: '0901000001', email: 'nam.nv@gmail.com', idCard: '030175001234', insuranceNumber: 'HS4030175001234', province: 'Hải Dương', district: 'TP Hải Dương', ward: 'Phường Thanh Bình' },
    { _id: 'PAT-002', patientId: 'BN002', name: 'Trần Thị Hoa', dob: '1988-09-23', gender: 'F', phone: '0901000002', email: 'hoa.tt@gmail.com', idCard: '030188005678', insuranceNumber: 'HS4030188005678', province: 'Hải Phòng', district: 'Quận Lê Chân', ward: 'Phường Trại Lẻ' },
    { _id: 'PAT-003', patientId: 'BN003', name: 'Lê Văn Đức', dob: '1965-02-28', gender: 'M', phone: '0901000003', email: '', idCard: '030165009012', insuranceNumber: '', province: 'Hà Nội', district: 'Quận Đống Đa', ward: 'Phường Láng Hạ' },
    { _id: 'PAT-004', patientId: 'BN004', name: 'Phạm Thị Mai', dob: '1992-07-15', gender: 'F', phone: '0901000004', email: 'mai.pt92@gmail.com', idCard: '030192003456', insuranceNumber: 'HS4030192003456', province: 'Hải Dương', district: 'TP Hải Dương', ward: 'Phường Ngọc Châu' },
    { _id: 'PAT-005', patientId: 'BN005', name: 'Hoàng Văn Minh', dob: '1958-11-03', gender: 'M', phone: '0901000005', email: '', idCard: '030158007890', insuranceNumber: 'HS4030158007890', province: 'Hải Dương', district: 'Huyện Gia Lộc', ward: 'TT Gia Lộc' },
  ]
  for (const p of patients) {
    await Patient.findByIdAndUpdate(p._id, {
      ...p, address: '', notes: '', registeredSite: 'Hải Dương',
      createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${patients.length} bệnh nhân`)

  // ═══════════════════════════════════════════════════════
  // APPOINTMENTS (linked to patients & studies)
  // ═══════════════════════════════════════════════════════
  const appointments = [
    { _id: 'APT-P001', patientId: 'PAT-001', patientName: 'Nguyễn Văn Nam', phone: '0901000001', site: 'Hải Dương', modality: 'CT', scheduledAt: '2026-03-12T08:00:00', status: 'completed', studyId: 'std-001', clinicalInfo: 'Ho kéo dài, nghi ngờ u phổi' },
    { _id: 'APT-P002', patientId: 'PAT-002', patientName: 'Trần Thị Hoa', phone: '0901000002', site: 'Hải Dương', modality: 'MRI', scheduledAt: '2026-03-12T09:00:00', status: 'completed', studyId: 'std-002', clinicalInfo: 'Đau lưng mãn tính' },
    { _id: 'APT-P003', patientId: 'PAT-003', patientName: 'Lê Văn Đức', phone: '0901000003', site: 'Hải Dương', modality: 'XR', scheduledAt: '2026-03-12T10:00:00', status: 'completed', studyId: 'std-003', clinicalInfo: 'Chấn thương ngã' },
    { _id: 'APT-P004', patientId: 'PAT-004', patientName: 'Phạm Thị Mai', phone: '0901000004', site: 'Hải Dương', modality: 'US', scheduledAt: '2026-03-12T13:30:00', status: 'scheduled', studyId: 'std-004', clinicalInfo: 'Đau bụng vùng thượng vị' },
    { _id: 'APT-P005', patientId: 'PAT-005', patientName: 'Hoàng Văn Minh', phone: '0901000005', site: 'Hải Dương', modality: 'CT', scheduledAt: '2026-03-11T14:00:00', status: 'completed', studyId: 'std-005', clinicalInfo: 'Đột quỵ nghi ngờ' },
    // Second visit for PAT-001
    { _id: 'APT-P006', patientId: 'PAT-001', patientName: 'Nguyễn Văn Nam', phone: '0901000001', site: 'Hải Dương', modality: 'XR', scheduledAt: '2026-04-01T08:30:00', status: 'completed', studyId: '', clinicalInfo: 'Kiểm tra sau điều trị' },
  ]
  for (const a of appointments) {
    await Appointment.findByIdAndUpdate(a._id, {
      ...a, dob: '', gender: '', duration: 30, referringDoctor: '',
      notes: '', createdBy: 'seed', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${appointments.length} lịch hẹn`)

  // ═══════════════════════════════════════════════════════
  // INVOICES (linked to appointments)
  // ═══════════════════════════════════════════════════════
  const invoices = [
    {
      _id: 'INV-P001', invoiceNumber: 'HD-20260312-P001', patientId: 'PAT-001',
      patientName: 'Nguyễn Văn Nam', phone: '0901000001', appointmentId: 'APT-P001',
      site: 'Hải Dương',
      items: [{ serviceCode: 'CT001', serviceName: 'Chụp CT sọ não', unitPrice: 800000, quantity: 1, amount: 800000 }],
      subtotal: 800000, totalDiscount: 0, totalTax: 0, grandTotal: 800000,
      paidAmount: 800000, status: 'paid', paidAt: '2026-03-12T09:00:00', paymentMethod: 'cash',
      createdBy: 'admin', cashierId: 'admin',
    },
    {
      _id: 'INV-P002', invoiceNumber: 'HD-20260312-P002', patientId: 'PAT-002',
      patientName: 'Trần Thị Hoa', phone: '0901000002', appointmentId: 'APT-P002',
      site: 'Hải Dương',
      items: [{ serviceCode: 'MRI02', serviceName: 'Chụp MRI cột sống', unitPrice: 1500000, quantity: 1, amount: 1500000 }],
      subtotal: 1500000, totalDiscount: 0, totalTax: 0, grandTotal: 1500000,
      paidAmount: 1500000, status: 'paid', paidAt: '2026-03-12T10:30:00', paymentMethod: 'transfer',
      createdBy: 'admin', cashierId: 'admin',
    },
    {
      _id: 'INV-P003', invoiceNumber: 'HD-20260312-P003', patientId: 'PAT-003',
      patientName: 'Lê Văn Đức', phone: '0901000003', appointmentId: 'APT-P003',
      site: 'Hải Dương',
      items: [{ serviceCode: 'XQ001', serviceName: 'X-Quang tay phải', unitPrice: 120000, quantity: 1, amount: 120000 }],
      subtotal: 120000, totalDiscount: 0, totalTax: 0, grandTotal: 120000,
      paidAmount: 120000, status: 'paid', paidAt: '2026-03-12T10:45:00', paymentMethod: 'cash',
      createdBy: 'admin', cashierId: 'admin',
    },
    {
      _id: 'INV-P005', invoiceNumber: 'HD-20260311-P005', patientId: 'PAT-005',
      patientName: 'Hoàng Văn Minh', phone: '0901000005', appointmentId: 'APT-P005',
      site: 'Hải Dương',
      items: [{ serviceCode: 'CT001', serviceName: 'Chụp CT sọ não', unitPrice: 800000, quantity: 1, amount: 800000 }],
      subtotal: 800000, totalDiscount: 0, totalTax: 0, grandTotal: 800000,
      paidAmount: 0, status: 'draft', paymentMethod: 'cash',
      createdBy: 'admin',
    },
    {
      _id: 'INV-P006', invoiceNumber: 'HD-20260401-P006', patientId: 'PAT-001',
      patientName: 'Nguyễn Văn Nam', phone: '0901000001', appointmentId: 'APT-P006',
      site: 'Hải Dương',
      items: [{ serviceCode: 'XQ001', serviceName: 'X-Quang ngực thẳng', unitPrice: 100000, quantity: 1, amount: 100000 }],
      subtotal: 100000, totalDiscount: 0, totalTax: 0, grandTotal: 100000,
      paidAmount: 100000, status: 'paid', paidAt: '2026-04-01T09:00:00', paymentMethod: 'cash',
      createdBy: 'admin', cashierId: 'admin',
    },
  ]
  for (const inv of invoices) {
    await Invoice.findByIdAndUpdate(inv._id, {
      ...inv, createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${invoices.length} phiếu thu`)

  // ═══════════════════════════════════════════════════════
  // PATIENT ACCOUNTS (for portal login)
  // ═══════════════════════════════════════════════════════
  const patientAccounts = patients.map((p, i) => ({
    _id: `PACC-${i + 1}`,
    patientId: p._id,
    phone: p.phone,
    dob: p.dob,
    idCardLast4: p.idCard.slice(-4),
  }))
  for (const pa of patientAccounts) {
    await PatientAccount.findByIdAndUpdate(pa._id, {
      ...pa, lastLoginAt: '', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${patientAccounts.length} tài khoản bệnh nhân`)

  // ═══════════════════════════════════════════════════════
  // PATIENT FEEDBACK
  // ═══════════════════════════════════════════════════════
  const feedbacks = [
    { _id: 'FB-001', patientId: 'PAT-001', appointmentId: 'APT-P001', rating: 5, comment: 'Dịch vụ rất tốt, nhân viên nhiệt tình!' },
    { _id: 'FB-002', patientId: 'PAT-002', appointmentId: 'APT-P002', rating: 4, comment: 'Kết quả nhanh, chờ đợi hơi lâu' },
    { _id: 'FB-003', patientId: 'PAT-003', appointmentId: 'APT-P003', rating: 5, comment: 'Bác sĩ tư vấn rất tận tình' },
  ]
  for (const fb of feedbacks) {
    await PatientFeedback.findByIdAndUpdate(fb._id, {
      ...fb, createdAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${feedbacks.length} đánh giá`)

  // ═══════════════════════════════════════════════════════
  // PARTNER FACILITIES
  // ═══════════════════════════════════════════════════════
  const facilities = [
    { _id: 'PF-001', code: 'BV-NDH', name: 'Bệnh viện Nhi Đồng Hải Phòng', type: 'hospital', contactPerson: 'BS. Trần Văn An', phone: '0225123456', email: 'lienhe@bvndhp.vn' },
    { _id: 'PF-002', code: 'PK-TM', name: 'Phòng khám Tâm Minh', type: 'clinic', contactPerson: 'BS. Lê Thị Bình', phone: '0903456789', email: 'tamminh@clinic.vn' },
    { _id: 'PF-003', code: 'PK-DK', name: 'Phòng khám Đa khoa Sài Gòn', type: 'clinic', contactPerson: 'BS. Nguyễn Hoàng', phone: '0281234567', email: 'contact@pkdksg.vn' },
  ]
  for (const f of facilities) {
    await PartnerFacility.findByIdAndUpdate(f._id, {
      ...f, address: '', notes: '', status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${facilities.length} cơ sở đối tác`)

  // ═══════════════════════════════════════════════════════
  // COMMISSION GROUPS & RULES
  // ═══════════════════════════════════════════════════════
  const commGroups = [
    { _id: 'CG-PARTNER', code: 'HH-DT', name: 'Hoa hồng đối tác chuyển gửi', description: 'Áp dụng cho đối tác bệnh viện/phòng khám giới thiệu bệnh nhân' },
  ]
  for (const cg of commGroups) {
    await CommissionGroup.findByIdAndUpdate(cg._id, {
      ...cg, status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }

  const commRules = [
    { _id: 'CR-001', commissionGroupId: 'CG-PARTNER', commissionGroupName: 'Hoa hồng đối tác', serviceTypeCode: 'CDHA', serviceId: 'CT001', serviceName: 'Chụp CT sọ não', type: 'percentage', value: 10 },
    { _id: 'CR-002', commissionGroupId: 'CG-PARTNER', commissionGroupName: 'Hoa hồng đối tác', serviceTypeCode: 'CDHA', serviceId: 'MRI01', serviceName: 'Chụp MRI sọ não', type: 'percentage', value: 12 },
    { _id: 'CR-003', commissionGroupId: 'CG-PARTNER', commissionGroupName: 'Hoa hồng đối tác', serviceTypeCode: 'CDHA', serviceId: 'SA020', serviceName: 'Siêu âm ổ bụng', type: 'fixed', value: 30000 },
    { _id: 'CR-004', commissionGroupId: 'CG-PARTNER', commissionGroupName: 'Hoa hồng đối tác', serviceTypeCode: 'CDHA', serviceId: 'XQ001', serviceName: 'X-Quang ngực thẳng', type: 'percentage', value: 8 },
  ]
  for (const cr of commRules) {
    await CommissionRule.findByIdAndUpdate(cr._id, {
      ...cr, status: 'active', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${commGroups.length} nhóm hoa hồng, ${commRules.length} quy tắc hoa hồng`)

  // ═══════════════════════════════════════════════════════
  // PARTNER ACCOUNTS
  // ═══════════════════════════════════════════════════════
  const partnerAccounts = [
    { _id: 'PACC-NDH', facilityId: 'PF-001', username: 'partner_ndh', password: 'partner123', displayName: 'BS. Trần Văn An', email: 'tvan@bvndhp.vn', phone: '0903111222', commissionGroupId: 'CG-PARTNER' },
    { _id: 'PACC-TM', facilityId: 'PF-002', username: 'partner_tm', password: 'partner123', displayName: 'BS. Lê Thị Bình', email: 'ltbinh@tamminh.vn', phone: '0903222333', commissionGroupId: 'CG-PARTNER' },
  ]
  for (const pa of partnerAccounts) {
    await PartnerAccount.findByIdAndUpdate(pa._id, {
      ...pa, status: 'active', lastLoginAt: '', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${partnerAccounts.length} tài khoản đối tác`)

  // ═══════════════════════════════════════════════════════
  // PARTNER REFERRALS (sample data in various statuses)
  // ═══════════════════════════════════════════════════════
  const referrals = [
    {
      _id: 'REF-001', facilityId: 'PF-001', partnerAccountId: 'PACC-NDH',
      patientName: 'Lý Văn Phong', patientPhone: '0905111222', patientDob: '1980-05-10', patientGender: 'M',
      requestedServiceId: 'SVC-4', requestedServiceName: 'Chụp CT sọ não', modality: 'CT', site: 'Hải Dương',
      clinicalInfo: 'Đau đầu kéo dài, cần chụp CT kiểm tra',
      status: 'appointment_created', appointmentId: 'APT-P001', patientId: 'PAT-001',
    },
    {
      _id: 'REF-002', facilityId: 'PF-001', partnerAccountId: 'PACC-NDH',
      patientName: 'Trần Thị Hạnh', patientPhone: '0905222333', patientDob: '1995-08-20', patientGender: 'F',
      requestedServiceId: 'SVC-1', requestedServiceName: 'Siêu âm ổ bụng', modality: 'US', site: 'Hải Dương',
      clinicalInfo: 'Đau bụng, nghi sỏi mật',
      status: 'pending',
    },
    {
      _id: 'REF-003', facilityId: 'PF-002', partnerAccountId: 'PACC-TM',
      patientName: 'Nguyễn Minh Tuấn', patientPhone: '0905333444', patientDob: '1970-12-01', patientGender: 'M',
      requestedServiceId: 'SVC-7', requestedServiceName: 'Chụp MRI sọ não', modality: 'MRI', site: 'Hải Dương',
      clinicalInfo: 'U não nghi ngờ, cần MRI',
      status: 'completed', appointmentId: 'APT-P002', patientId: 'PAT-002',
    },
    {
      _id: 'REF-004', facilityId: 'PF-001', partnerAccountId: 'PACC-NDH',
      patientName: 'Phạm Thị Lan', patientPhone: '0905444555', patientDob: '1988-03-15', patientGender: 'F',
      requestedServiceId: 'SVC-10', requestedServiceName: 'X-Quang ngực thẳng', modality: 'XR', site: 'Hải Dương',
      clinicalInfo: 'Khám sức khỏe định kỳ',
      status: 'pending',
    },
    {
      _id: 'REF-005', facilityId: 'PF-002', partnerAccountId: 'PACC-TM',
      patientName: 'Vũ Đức Thịnh', patientPhone: '0905555666', patientDob: '1962-06-25', patientGender: 'M',
      requestedServiceId: 'SVC-5', requestedServiceName: 'Chụp CT ngực', modality: 'CT', site: 'Hải Dương',
      clinicalInfo: 'Theo dõi u phổi',
      status: 'cancelled',
    },
  ]
  for (const r of referrals) {
    await PartnerReferral.findByIdAndUpdate(r._id, {
      ...r, patientIdCard: '', notes: '', createdAt: now(), updatedAt: now(),
    }, { upsert: true })
  }
  console.log(`✓ ${referrals.length} chuyển gửi đối tác (2 pending, 1 accepted, 1 completed, 1 cancelled)`)

  // ═══════════════════════════════════════════════════════
  console.log('\n✅ Seed portal data hoàn tất!')
  console.log('\n📋 Thông tin đăng nhập test:')
  console.log('   Patient Portal: phone=0901000001, dob=1975-04-12 (Nguyễn Văn Nam)')
  console.log('   Patient Portal: phone=0901000002, dob=1988-09-23 (Trần Thị Hoa)')
  console.log('   Partner Portal: username=partner_ndh, password=partner123 (BV Nhi Đồng HP)')
  console.log('   Partner Portal: username=partner_tm, password=partner123 (PK Tâm Minh)')
  process.exit(0)
}

setTimeout(seed, 2000)
