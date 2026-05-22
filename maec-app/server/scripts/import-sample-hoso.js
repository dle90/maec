/**
 * Import patient + clinical data extracted from the "Hồ sơ PK Minh Anh"
 * sample PDFs into the Patient + Encounter collections.
 *
 * Clinical values are parsed into structured encounter.assignedServices[].output
 * fields, keyed to the Khám form schema (config/serviceOutputFields.js) — so the
 * data renders in the Khám form, not as a wall of text in `conclusion`.
 * `conclusion` holds only a short clinical summary / plan.
 *
 * Every imported row lands as reviewStatus='pending_review' — an admin
 * reviews/edits and approves it from the Bệnh nhân catalog.
 *
 * Sources:
 *   - 6 digital device PDFs (Medmont / Optopol REVO / AB800) — exact values.
 *   - 4 handwritten scanned forms (doc3/4/5/10) — BEST-EFFORT reads; each
 *     handwritten service carries a ⚠ note to verify against the scan.
 *
 * Idempotent — deterministic _ids, re-run safe (upsert).
 *
 *   node scripts/import-sample-hoso.js --dry-run    # preview, no DB
 *   railway run node scripts/import-sample-hoso.js  # write to Atlas
 *
 * Extracted 2026-05-22.
 */
const DRY = process.argv.includes('--dry-run')
const BATCH = 'hoso-pkminhanh-2026-05-22'
const IMPORTED_AT = '2026-05-22T00:00:00.000Z'
const STAMP = 'Nhập từ hồ sơ PK Minh Anh, chờ duyệt — 2026-05-22.'
// Caveat stamped into each handwritten-sourced service note.
const HW = '⚠ Số liệu đọc từ chữ viết tay — đối chiếu bản scan gốc khi duyệt.'

const iso = (ymd) => `${ymd}T00:00:00.000Z`

const SVC = {
  AUTOREF:  'Chụp khúc xạ tự động (+ đo số kính cũ nếu có)',
  REFRACT:  'Đo khúc xạ (VA + chủ quan + khách quan + PD)',
  TG2M:     'Đo thị giác hai mắt',
  TOPO:     'Bản đồ giác mạc',
  BIOMETRY: 'Sinh trắc nhãn cầu (IOL biometry)',
  OCTPOST:  'OCT bán phần sau (RNFL + macula + ONH)',
  CLRGP:    'Thử kính tiếp xúc cứng (RGP / ortho-K)',
}

// ─── Patient A — Lê Minh Khôi (MediWorks AB800 biometry) ──────────────────
const khoi = {
  _id: 'BN-20260522-9001',
  patient: {
    name: 'Lê Minh Khôi', gender: 'M', dob: '2019-01-30',
    importSource: 'MediWorks AB800 — file thiết bị',
    notes: STAMP + ' Nguồn: AB800. Mã thiết bị 202605210001.',
  },
  encounters: [{
    _id: 'enc-hoso-khoi-1', date: '2026-05-21', examType: 'Khám kiểm soát cận thị',
    importSource: 'Sinh trắc học nhãn cầu.pdf (AB800)',
    conclusion: 'Sinh trắc nhãn cầu AB800 — OS-AL 24.85 mm trên bách phân vị 95 theo tuổi (7t), '
      + 'nguy cơ tiến triển cận thị; không còn dự trữ viễn thị 2 mắt.',
    services: [{
      serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
      output: {
        device: 'MediWorks AB800',
        od_axial_length: 23.384, os_axial_length: 24.851,
        od_acd: 2.396, os_acd: 2.710,
        od_k: 44.55, os_k: 44.74,
        od_white_to_white: 11.84, os_white_to_white: 11.69,
        iol_calc_note:
          'CCT OD 556 / OS 545 µm. LT OD 3.739 / OS 3.352 mm. '
          + 'K1/K2 OD 43.33/45.77, OS 43.67/45.80 D. AL/CR OD 3.08 / OS 3.29. '
          + 'Dịch kính OD 16.69 / OS 18.24 mm. Đồng tử OD 3.67 / OS 4.20 mm.',
      },
    }],
  }],
}

// ─── Patient B — Bành Huyền Trang (Optopol REVO NX OCT ×3) ────────────────
const trang = {
  _id: 'BN-20260522-9002',
  patient: {
    name: 'Bành Huyền Trang', gender: 'F', dob: '2011-10-08',
    importSource: 'Optopol REVO NX — file thiết bị',
    notes: STAMP + ' Nguồn: Optopol REVO NX. Mã thiết bị AUTO20240727092246.',
  },
  encounters: [{
    _id: 'enc-hoso-trang-1', date: '2023-10-28', examType: 'Khám mắt — OCT đáy mắt',
    importSource: 'OCT GAI THI / HOANG DIEM / TRUC NHAN CAU - BANH HUYEN TRANG.pdf (REVO NX)',
    conclusion: 'OCT REVO NX — bất đối xứng đầu thị thần kinh 2 mắt (C/D dọc OD 0.51 / OS 0.65), '
      + 'cân nhắc theo dõi glôcôm.',
    services: [
      {
        serviceCode: 'SVC-OCT-POST', serviceName: SVC.OCTPOST,
        output: {
          od_rnfl_avg: 126, os_rnfl_avg: 136,
          od_macula_thickness: 240, os_macula_thickness: 238,
          od_cd_ratio: 0.51, os_cd_ratio: 0.65,
          note:
            'C/D ngang OD 0.60 / OS 0.86. Foveola tối thiểu OD 199 / OS 197 µm. '
            + 'Disc area OD 2.82 / OS 2.96 mm². Rim area OD 2.08 / OS 1.39 mm². DDLS OD 4 / OS 5.',
        },
      },
      {
        serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
        output: {
          device: 'Optopol Revo (OCT trục)',
          od_axial_length: 24.58, os_axial_length: 24.16,
          od_acd: 3.54, os_acd: 3.49,
          iol_calc_note: 'LT OD 3.33 / OS 3.36 mm. CCT OD 537 / OS 534 µm. '
            + 'Máy cảnh báo chênh lệch AL giữa 2 mắt.',
        },
      },
    ],
  }],
}

// ─── Patient C — Nguyễn Anh Thư (Medmont topography ×2 visits) ────────────
const thuTopo = (k, ecc, extra) => ({
  serviceCode: 'SVC-TOPO', serviceName: SVC.TOPO,
  output: { ...k, ...ecc, note: extra },
})
const thu = {
  _id: 'BN-20260522-9003',
  patient: {
    name: 'Nguyễn Anh Thư', gender: '', dob: '',
    importSource: 'Medmont Studio — file thiết bị',
    notes: STAMP + ' Nguồn: Medmont Studio. '
      + 'Ngày sinh & giới tính KHÔNG có trong file thiết bị — cần bổ sung khi duyệt.',
  },
  encounters: [
    {
      _id: 'enc-hoso-thu-1', date: '2025-10-18', examType: 'Bản đồ giác mạc',
      importSource: 'BandogiacmacNguyenAnhThu2.pdf (Medmont)',
      conclusion: 'Bản đồ giác mạc Medmont — 18/10/2025.',
      services: [thuTopo(
        { od_k1: 41.87, od_k2: 42.24, os_k1: 41.54, os_k2: 42.19 },
        { od_eccentricity: 0.38, os_eccentricity: 0.36 },
        'Avg K OD 42.47 / OS 42.39 D. ΔK OD 0.36 / OS 0.65. '
        + 'IS index OD 0.61 / OS 0.98. SAI OD 1.46 / OS 1.76. SRI OD 0.77 / OS 0.80. '
        + 'Đồng tử OD 3.1 / OS 3.4 mm. (Medmont Studio 7.2.8)',
      )],
    },
    {
      _id: 'enc-hoso-thu-2', date: '2026-05-21', examType: 'Bản đồ giác mạc',
      importSource: 'BandogiacmacNguyenAnhThu3.pdf (Medmont)',
      conclusion: 'Bản đồ giác mạc Medmont — 21/05/2026 (tái khám).',
      services: [thuTopo(
        { od_k1: 42.61, od_k2: 43.52, os_k1: 42.64, os_k2: 43.45 },
        { od_eccentricity: 0.59, os_eccentricity: 0.58 },
        'Avg K OD 42.97 / OS 42.92 D. ΔK OD 0.91 / OS 0.81. '
        + 'IS index OD 0.80 / OS 0.82. SAI OD 0.66 / OS 0.72. SRI OD 0.28 / OS 0.37. '
        + 'Đồng tử OD 3.1 / OS 3.0 mm. (Medmont Studio 7.2.8)',
      )],
    },
  ],
}

// ══════════════════════════════════════════════════════════════════════════
// HANDWRITTEN BATCH — doc3/4/5/10. Refraction / K / axial values parsed into
// structured fields BEST-EFFORT from handwriting; each service note carries
// the ⚠ verify-against-scan caveat. Demographics partial — admin completes.
// ══════════════════════════════════════════════════════════════════════════

// doc3 — Ngô Đức Trọng — theo dõi tiến triển cận thị, kính gọng Stellest
const trong = {
  _id: 'BN-20260522-9101',
  patient: {
    name: 'Ngô Đức Trọng', gender: 'M', dob: '',
    importSource: 'Kiểm soát tiến triển cận thị kính gọng.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu theo dõi cận thị viết tay (mã hồ sơ "58"). '
      + 'Sinh năm 2019 (chỉ đọc được năm — cần bổ sung ngày/tháng). Phiếu ban đầu ghi: '
      + 'cao 1m38, nặng 35.5kg, sinh non 37 tuần / 2.8kg, dị ứng thời tiết, gia đình có cận thị.',
  },
  encounters: [
    {
      _id: 'enc-hoso-trong-1', date: '2024-09-28', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 28/09/2024.',
      services: [{
        serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
        output: {
          od_sphere: -3.00, od_cyl: -0.75, od_axis: 165,
          os_sphere: -3.00, os_cyl: -1.25, os_axis: 165,
          old_glasses: 'MP -1.75/-0.50, MT -2.00/-0.75', note: HW,
        },
      }],
    },
    {
      _id: 'enc-hoso-trong-2', date: '2025-04-09', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 09/04/2025.',
      services: [
        {
          serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
          output: { od_sphere: -3.00, od_cyl: -0.75, od_axis: 169, od_k1: 44.00, od_k2: 45.75, note: HW },
        },
        {
          serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
          output: {
            device: 'Optopol Revo (OCT trục)', od_axial_length: 24.5, os_axial_length: 24.0,
            iol_calc_note: HW + ' Trục nhãn cầu OCT ~T6/2024, giá trị gần đúng.',
          },
        },
      ],
    },
    {
      _id: 'enc-hoso-trong-3', date: '2025-11-08', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — 08/11/2025 (cao 1m44, nặng 42kg). '
        + 'Xử trí: dừng Vigamox; Comfort Shield ×1 lọ; tái khám sau 3 tháng.',
      services: [{
        serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
        output: {
          device: 'Optopol Revo (OCT trục)',
          iol_calc_note: HW + ' OCT trục nhãn cầu ~T6/2025 — giá trị chưa đọc rõ từ bản scan.',
        },
      }],
    },
    {
      _id: 'enc-hoso-trong-4', date: '2025-11-22', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 22/11/2025.',
      services: [{
        serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
        output: {
          od_sphere: -2.50, od_cyl: -0.75, od_axis: 167,
          os_sphere: -3.00, os_cyl: -1.50, os_axis: 158, note: HW,
        },
      }],
    },
  ],
}

// doc4 — Nguyễn Đình Tùng — kính tiếp xúc cứng RGP, giác mạc hình chóp
const tung = {
  _id: 'BN-20260522-9102',
  patient: {
    name: 'Nguyễn Đình Tùng', gender: 'M', dob: '',
    importSource: 'Kinh tiếp xúc cứng - Giác mạc chóp.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu khám kính tiếp xúc viết tay (mã 133KTX). '
      + 'Chẩn đoán: giác mạc hình chóp (keratoconus), đeo kính tiếp xúc cứng RGP. '
      + 'Ngày sinh đọc tay 11/7/1991 hoặc 11/7/1994 — cần xác minh. '
      + 'Tên đệm có thể là "Danh" thay vì "Đình" — cần xác minh.',
  },
  encounters: [
    {
      _id: 'enc-hoso-tung-1', date: '2022-02-15', examType: 'Khám kính tiếp xúc (mới)',
      conclusion: 'Khám kính tiếp xúc cứng — giác mạc hình chóp — 15/02/2022.',
      services: [{
        serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
        output: {
          od_sphere: 0, od_cyl: -2.50, od_axis: 69,
          os_sphere: -5.25, os_cyl: -6.25, os_axis: 84,
          note: HW + ' MP cầu phẳng (plano). K dốc bất thường (keratoconus).',
        },
      }],
    },
    {
      _id: 'enc-hoso-tung-2', date: '2022-12-15', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 15/12/2022.',
      services: [{
        serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
        output: {
          od_sphere: -7.75, os_sphere: -0.25, os_cyl: -4.00,
          note: HW + ' MP trụ/trục chưa đọc rõ.',
        },
      }],
    },
    {
      _id: 'enc-hoso-tung-3', date: '2024-01-11', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 11/01/2024. Xử trí: Comfort Shield.',
      services: [{
        serviceCode: 'SVC-REFRACT', serviceName: SVC.REFRACT,
        output: { od_va_corrected: '20/25', os_va_corrected: '20/25', note: HW + ' Thị lực với kính.' },
      }],
    },
    {
      _id: 'enc-hoso-tung-4', date: '2025-03-14', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 14/03/2025. Đơn kính RGP cuối.',
      services: [{
        serviceCode: 'SVC-CL-FIT-RGP', serviceName: SVC.CLRGP,
        output: {
          lens_type: 'RGP',
          od_bc: 6.70, od_dia: 9.00, od_power: -7.00,
          os_bc: 6.70, os_dia: 9.00, os_power: -8.00,
          final_rx: 'OD 6.70 / 9.00 / -7.00 · OS 6.70 / 9.00 / -8.00 (RGP, giác mạc chóp)',
          fit_assessment: HW,
        },
      }],
    },
  ],
}

// doc5 — Lê Thu Thảo — kính tiếp xúc Ortho-K
const thao = {
  _id: 'BN-20260522-9103',
  patient: {
    name: 'Lê Thu Thảo', gender: '', dob: '',
    importSource: 'Kính tiếp xúc OrthoK.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu khám Ortho-K viết tay (mã 2O46). '
      + 'Ngày sinh đọc tay ~28/07/1988 — cần xác minh. Giới tính chưa rõ trên phiếu.',
  },
  encounters: [
    {
      _id: 'enc-hoso-thao-1', date: '2026-02-26', examType: 'Khám kính tiếp xúc (mới)',
      conclusion: 'Khám Ortho-K lần đầu — 26/02/2026.',
      services: [
        {
          serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
          output: {
            od_sphere: -3.00, od_cyl: -0.75, od_axis: 85,
            os_sphere: -3.00, os_cyl: -1.00, os_axis: 5, note: HW,
          },
        },
        {
          serviceCode: 'SVC-TOPO', serviceName: SVC.TOPO,
          output: {
            od_k1: 42.14, od_k2: 42.62, os_k1: 41.53, os_k2: 42.34,
            note: HW + ' Bản đồ giác mạc (Sim K).',
          },
        },
        {
          serviceCode: 'SVC-CL-FIT-RGP', serviceName: SVC.CLRGP,
          output: { lens_type: 'Ortho-K', fit_assessment: HW + ' Thử kính Ortho-K lần đầu.' },
        },
      ],
    },
    {
      _id: 'enc-hoso-thao-2', date: '2026-03-12', examType: 'Tái khám kính tiếp xúc (Ortho-K)',
      conclusion: 'Tái khám Ortho-K — 12/03/2026. Thị lực 20/20. Thuốc: Solidra Plus.',
      services: [
        {
          serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
          output: {
            od_sphere: -0.75, od_cyl: -0.50, od_axis: 97,
            os_sphere: -1.25, os_cyl: -1.25, os_axis: 15,
            note: HW + ' Khúc xạ tồn dư sau Ortho-K.',
          },
        },
        {
          serviceCode: 'SVC-REFRACT', serviceName: SVC.REFRACT,
          output: { od_va_corrected: '20/20', os_va_corrected: '20/20', note: HW },
        },
        {
          serviceCode: 'SVC-CL-FIT-RGP', serviceName: SVC.CLRGP,
          output: { lens_type: 'Ortho-K', fit_assessment: HW + ' Theo dõi kính Ortho-K.' },
        },
      ],
    },
    {
      _id: 'enc-hoso-thao-3', date: '2026-03-31', examType: 'Tái khám kính tiếp xúc (Ortho-K)',
      conclusion: 'Tái khám Ortho-K — 31/03/2026. Thị lực 20/20, định tâm kính tốt.',
      services: [
        {
          serviceCode: 'SVC-REFRACT', serviceName: SVC.REFRACT,
          output: { od_va_corrected: '20/20', os_va_corrected: '20/20', note: HW },
        },
        {
          serviceCode: 'SVC-CL-FIT-RGP', serviceName: SVC.CLRGP,
          output: { lens_type: 'Ortho-K', centration: 'Tốt', fit_assessment: HW + ' Định tâm kính tốt.' },
        },
      ],
    },
  ],
}

// doc10 — Trần Diệp Anh — theo dõi tiến triển cận thị (điều trị thuốc)
const dipanh = {
  _id: 'BN-20260522-9104',
  patient: {
    name: 'Trần Diệp Anh', gender: '', dob: '',
    importSource: 'kiểm soát tiến triển cận thị bằng thuốc_1.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu theo dõi cận thị viết tay (mã A201–A204). '
      + 'Sinh tháng 3/2014 (đọc tay ~11–16/03/2014) — cần xác minh. Giới tính chưa rõ.',
  },
  encounters: [
    {
      _id: 'enc-hoso-dipanh-1', date: '2024-03-16', examType: 'Khám kiểm soát cận thị',
      conclusion: 'Khám ban đầu kiểm soát cận thị — 16/03/2024 '
        + '(cao ~130 cm, nặng ~33 kg; tiền sử bố cận thị).',
    },
    {
      _id: 'enc-hoso-dipanh-2', date: '2024-11-24', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~24/11/2024. Cận thị cao 2 mắt.',
      services: [
        {
          serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
          output: {
            od_sphere: -8.00, od_cyl: -4.25, od_axis: 119,
            os_sphere: -10.25, os_cyl: -2.50, os_axis: 122,
            note: HW + ' Cận thị cao — kiểm tra kỹ giá trị.',
          },
        },
        {
          serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
          output: {
            device: 'Optopol Revo (OCT trục)', od_axial_length: 28, os_axial_length: 27,
            iol_calc_note: HW + ' NGHI NGỜ SAI SỐ — trục nhãn cầu đọc tay ~OD 28 / OS 27 mm '
              + 'bất thường lớn, BẮT BUỘC đối chiếu bản scan.',
          },
        },
      ],
    },
    {
      _id: 'enc-hoso-dipanh-3', date: '2025-10-23', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~23/10/2025.',
      services: [
        {
          serviceCode: 'SVC-AUTOREF', serviceName: SVC.AUTOREF,
          output: {
            od_sphere: -3.00, od_cyl: -1.75, od_axis: 138,
            os_sphere: -0.50, os_cyl: -2.50, os_axis: 152, note: HW,
          },
        },
        {
          serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
          output: {
            device: 'Optopol Revo (OCT trục)', od_axial_length: 25.9, os_axial_length: 23.5,
            iol_calc_note: HW + ' Trục nhãn cầu OCT, giá trị gần đúng.',
          },
        },
      ],
    },
    {
      _id: 'enc-hoso-dipanh-4', date: '2026-03-19', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~19/03/2026.',
      services: [{
        serviceCode: 'SVC-BIOMETRY', serviceName: SVC.BIOMETRY,
        output: {
          device: 'Optopol Revo (OCT trục)', od_axial_length: 23.7, os_axial_length: 23.5,
          iol_calc_note: HW + ' Trục nhãn cầu OCT, giá trị gần đúng.',
        },
      }],
    },
  ],
}

const SOURCE = [khoi, trang, thu, trong, tung, thao, dipanh]

// ─── build final Patient + Encounter documents ────────────────────────────
function buildAll() {
  const patients = []
  const encounters = []
  for (const p of SOURCE) {
    const encDates = p.encounters.map(e => e.date).sort()
    patients.push({
      _id: p._id,
      doc: {
        patientId: p._id,
        name: p.patient.name,
        gender: p.patient.gender || undefined,
        dob: p.patient.dob || '',
        notes: p.patient.notes,
        registeredSite: '',
        reviewStatus: 'pending_review',
        importBatch: BATCH,
        importSource: p.patient.importSource,
        importedAt: IMPORTED_AT,
        lastEncounterAt: iso(encDates[encDates.length - 1]),
        createdAt: iso(encDates[0]),
        updatedAt: IMPORTED_AT,
      },
    })
    for (const e of p.encounters) {
      encounters.push({
        _id: e._id,
        doc: {
          patientId: p._id,
          patientName: p.patient.name,
          dob: p.patient.dob || '',
          ...(p.patient.gender ? { gender: p.patient.gender } : {}),
          examType: e.examType,
          site: '',
          scheduledDate: e.date,
          studyDate: e.date,
          status: 'completed',
          priority: 'routine',
          conclusion: e.conclusion,
          assignedServices: (e.services || []).map(s => ({
            serviceCode: s.serviceCode,
            serviceName: s.serviceName,
            status: 'done',
            output: s.output,
            addedAt: iso(e.date),
            startedAt: iso(e.date),
            completedAt: iso(e.date),
          })),
          billItems: [],
          billTotal: 0,
          reviewStatus: 'pending_review',
          importBatch: BATCH,
          importSource: e.importSource || p.patient.importSource,
          importedAt: IMPORTED_AT,
          createdAt: iso(e.date),
          updatedAt: IMPORTED_AT,
        },
      })
    }
  }
  return { patients, encounters }
}

function printPreview({ patients, encounters }) {
  console.log('\n═══ DRY RUN — preview, nothing written ═══\n')
  for (const p of patients) {
    const d = p.doc
    console.log(`PATIENT  ${p._id}  ${d.name}   [${d.reviewStatus}]`)
    console.log(`         giới tính: ${d.gender || '(trống)'}   ngày sinh: ${d.dob || '(trống)'}`)
    for (const e of encounters.filter(x => x.doc.patientId === p._id)) {
      console.log(`  ENCOUNTER  ${e._id}  ${e.doc.studyDate}  "${e.doc.examType}"`)
      console.log(`     KL: ${e.doc.conclusion}`)
      for (const s of e.doc.assignedServices) {
        const fields = Object.entries(s.output)
          .filter(([k]) => !['note', 'iol_calc_note', 'fit_assessment'].includes(k))
        console.log(`     • ${s.serviceCode} — ${fields.length} trường: `
          + fields.map(([k, v]) => `${k}=${v}`).join(', '))
      }
    }
    console.log('')
  }
  console.log(`TOTAL: ${patients.length} bệnh nhân, ${encounters.length} lượt khám — tất cả chờ duyệt.`)
  console.log('Ghi vào MongoDB Atlas:  railway run node scripts/import-sample-hoso.js\n')
}

async function main() {
  const data = buildAll()
  if (DRY) { printPreview(data); return }

  require('../db')
  const mongoose = require('mongoose')
  await mongoose.connection.asPromise()
  const Patient = require('../models/Patient')
  const Encounter = require('../models/Encounter')

  let pN = 0, eN = 0
  for (const p of data.patients) {
    await Patient.updateOne({ _id: p._id }, { $set: p.doc }, { upsert: true })
    pN++
    console.log(`✓ patient   ${p._id}  ${p.doc.name}`)
  }
  for (const e of data.encounters) {
    await Encounter.updateOne({ _id: e._id }, { $set: e.doc }, { upsert: true })
    eN++
    console.log(`✓ encounter ${e._id}  ${e.doc.studyDate}`)
  }
  console.log(`\nDone — ${pN} patients, ${eN} encounters upserted (pending_review).`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch(err => { console.error('IMPORT FAILED:', err); process.exit(1) })
