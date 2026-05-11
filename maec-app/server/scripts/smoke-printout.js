#!/usr/bin/env node
// Offline smoke for lib/patientPrintout.js — no DB required.
// Renders templates/patient-printout.docx with a synthetic encounter and
// writes the result to ./_smoke_printout.docx so you can open it in Word.
//
//   cd maec-app/server && node scripts/smoke-printout.js
//
// On success: prints the output path + size. On render failure: docxtemplater
// throws a tagged error with which placeholder it choked on.

const fs = require('fs')
const path = require('path')
const { renderPrintout } = require('../lib/patientPrintout')

const enc = {
  _id: 'enc-smoke-001',
  patientId: 'BN-20260510-0001',
  patientName: 'Nguyễn Văn A',
  dob: '2015-03-12',
  gender: 'M',
  site: 'Trung Kính',
  studyDate: '2026-05-10',
  scheduledDate: '2026-05-10',
  clinicalInfo: 'Nhìn xa mờ, hay nheo mắt khi đọc.',
  diagnosis: 'Cận thị tiến triển hai mắt; theo dõi quản lý cận thị.',
  conclusion: 'Cấp đơn kính mới + tư vấn ngoài trời 2h/ngày. Tái khám sau 6 tháng.',
  radiologistName: 'BS. Nguyễn Thị B',
  assignedServices: [
    {
      serviceCode: 'KHX-AR',
      output: {
        va_ucdva_od: '20/40', va_ucdva_os: '20/50',
        va_with_old_glasses_od: '20/25', va_with_old_glasses_os: '20/30',
        final_rx_od: '-2.50 / -0.50 x 180', final_rx_os: '-2.75 / -0.50 x 175',
        va_final_rx_od: '20/20', va_final_rx_os: '20/20',
        near_va_od: 'N6', near_va_os: 'N6',
        add_od: '+0.00', add_os: '+0.00',
        next_visit_date: '2026-11-10',
        followup_interval: '6 tháng',
      },
    },
    {
      serviceCode: 'NA-NCT',
      output: {
        iop_od: 14, iop_os: 15, iop_time: '09:30',
      },
    },
    {
      serviceCode: 'SHV',
      output: {
        lids_od: 'BT', lids_os: 'BT',
        bulbar_conjunctiva_od: 'BT', bulbar_conjunctiva_os: 'BT',
        cornea_clarity_od: 'Trong', cornea_clarity_os: 'Trong',
        anterior_chamber_od: 'Sâu', anterior_chamber_os: 'Sâu',
        pupil_od: 'Tròn đều, phản xạ tốt', pupil_os: 'Tròn đều, phản xạ tốt',
        lens_od: 'Trong', lens_os: 'Trong',
      },
    },
    {
      serviceCode: 'DM',
      output: {
        disc_color_od: 'BT', disc_margin_od: 'rõ',
        disc_color_os: 'BT', disc_margin_os: 'rõ',
        cdr_vertical_od: 0.3, cdr_vertical_os: 0.3,
        macula_status_od: 'BT', peripheral_retina_od: 'BT',
        macula_status_os: 'BT', peripheral_retina_os: 'BT',
        fundus_impression: 'Đáy mắt hai bên trong giới hạn bình thường.',
      },
    },
  ],
}

const patient = {
  phone: '0901234567',
  guardianName: 'Nguyễn Thị C (mẹ)',
}

const buf = renderPrintout(enc, patient)
const out = path.join(__dirname, '..', '_smoke_printout.docx')
fs.writeFileSync(out, buf)
console.log('OK — wrote', out, `(${(buf.length / 1024).toFixed(1)} KB)`)
