/**
 * Import patient + clinical data extracted from the "Hồ sơ PK Minh Anh"
 * sample PDFs into the Patient + Encounter collections.
 *
 * Every imported row lands as reviewStatus='pending_review' — an admin
 * reviews/edits and approves it from the Bệnh nhân catalog before the data
 * is treated as trusted.
 *
 * Source so far: the 6 *digital device* PDFs — machine-printed, exact values:
 *   - MediWorks AB800 biometry      → Lê Minh Khôi
 *   - Optopol REVO NX OCT (×3)      → Bành Huyền Trang
 *   - Medmont topography (×2)       → Nguyễn Anh Thư
 * Handwritten-form patients (doc3/4/5/10) are appended to SOURCE as they
 * are transcribed.
 *
 * Clinical values land in encounter.assignedServices[].output, keyed to the
 * Khám form schema (config/serviceOutputFields.js) so they render in Khám.
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

const iso = (ymd) => `${ymd}T00:00:00.000Z`

// ─── Patient A — Lê Minh Khôi (MediWorks AB800 biometry) ──────────────────
const khoi = {
  _id: 'BN-20260522-9001',
  patient: {
    name: 'Lê Minh Khôi', gender: 'M', dob: '2019-01-30',
    importSource: 'MediWorks AB800 — file thiết bị',
    notes: STAMP + ' Nguồn: AB800. Mã thiết bị 202605210001.',
  },
  encounters: [{
    _id: 'enc-hoso-khoi-1',
    date: '2026-05-21',
    examType: 'Khám kiểm soát cận thị',
    importSource: 'Sinh trắc học nhãn cầu.pdf (AB800)',
    conclusion:
      'Sinh trắc nhãn cầu (MediWorks AB800) — 21/05/2026. ' +
      'Trục nhãn cầu (AL): OD 23.38 mm / OS 24.85 mm. AL/CR: OD 3.08 / OS 3.29. ' +
      'K trung bình: OD 44.55 D / OS 44.74 D. CCT: OD 556 / OS 545 µm. ' +
      'Không còn dự trữ viễn thị cả 2 mắt. Theo biểu đồ chuẩn tuổi (7 tuổi): ' +
      'OD-AL trên bách phân vị 50, OS-AL trên bách phân vị 95. ' + STAMP,
    services: [{
      serviceCode: 'SVC-BIOMETRY', serviceName: 'Sinh trắc nhãn cầu (IOL biometry)',
      output: {
        device: 'MediWorks AB800',
        od_axial_length: 23.384, os_axial_length: 24.851,
        od_acd: 2.396, os_acd: 2.710,
        od_k: 44.55, os_k: 44.74,
        od_white_to_white: 11.84, os_white_to_white: 11.69,
        iol_calc_note:
          'AB800, 21/05/2026. K: OD 43.33/45.77 D (ΔK 2.43), OS 43.67/45.80 D (ΔK 2.13). ' +
          'CCT OD 556 / OS 545 µm. LT OD 3.739 / OS 3.352 mm. ' +
          'Buồng dịch (AD) OD 2.396 / OS 2.710 mm. Dịch kính OD 16.693 / OS 18.244 mm. ' +
          'Angle kappa OD 4.20° / OS 3.32°. Đồng tử OD 3.67 / OS 4.20 mm. ' +
          'AL/CR OD 3.08 / OS 3.29. Không còn dự trữ viễn thị 2 mắt.',
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
    _id: 'enc-hoso-trang-1',
    date: '2023-10-28',
    examType: 'Khám mắt — OCT đáy mắt',
    importSource: 'OCT GAI THI / HOANG DIEM / TRUC NHAN CAU - BANH HUYEN TRANG.pdf (REVO NX)',
    conclusion:
      'OCT Optopol REVO NX — 28/10/2023. RNFL trung bình: OD 126 / OS 136 µm. ' +
      'Hoàng điểm: vùng trung tâm OD 240 / OS 238 µm, foveola tối thiểu OD 199 / OS 197 µm. ' +
      'Gai thị: C/D dọc OD 0.51 / OS 0.65, C/D ngang OD 0.60 / OS 0.86 — ' +
      'bất đối xứng đầu thị thần kinh 2 mắt. Sinh trắc trục nhãn cầu: ' +
      'OD 24.58 / OS 24.16 mm (máy cảnh báo chênh lệch 2 mắt). ' + STAMP,
    services: [
      {
        serviceCode: 'SVC-OCT-POST', serviceName: 'OCT bán phần sau (RNFL + macula + ONH)',
        output: {
          od_rnfl_avg: 126, os_rnfl_avg: 136,
          od_macula_thickness: 240, os_macula_thickness: 238,
          note:
            'OPTOPOL REVO NX, 28/10/2023. Hoàng điểm (3D 7×7 mm): foveola tối thiểu ' +
            'OD 199 / OS 197 µm; vùng trung tâm OD 240 / OS 238 µm; thể tích OD 7.91 / OS 8.04 mm³. ' +
            'Gai thị (3D 6×6 mm): C/D dọc OD 0.51 / OS 0.65; C/D ngang OD 0.60 / OS 0.86; ' +
            'disc area OD 2.82 / OS 2.96 mm²; rim area OD 2.08 / OS 1.39 mm²; ' +
            'cup area OD 0.74 / OS 1.58 mm²; DDLS OD 4 / OS 5. ' +
            'Lưu ý bất đối xứng đầu thị thần kinh giữa 2 mắt.',
        },
      },
      {
        serviceCode: 'SVC-BIOMETRY', serviceName: 'Sinh trắc nhãn cầu (IOL biometry)',
        output: {
          device: 'Optopol Revo (OCT trục)',
          od_axial_length: 24.58, os_axial_length: 24.16,
          od_acd: 3.54, os_acd: 3.49,
          iol_calc_note:
            'REVO NX sinh trắc trục nhãn cầu, 28/10/2023. AL OD 24.58 / OS 24.16 mm. ' +
            'ACD OD 3.54 / OS 3.49 mm. LT OD 3.33 / OS 3.36 mm. CCT OD 537 / OS 534 µm. ' +
            'Máy cảnh báo (!!) chênh lệch AL giữa 2 mắt đáng kể.',
        },
      },
    ],
  }],
}

// ─── Patient C — Nguyễn Anh Thư (Medmont topography ×2 visits) ────────────
const thu = {
  _id: 'BN-20260522-9003',
  patient: {
    name: 'Nguyễn Anh Thư', gender: '', dob: '',
    importSource: 'Medmont Studio — file thiết bị',
    notes: STAMP + ' Nguồn: Medmont Studio. ' +
      'Ngày sinh & giới tính KHÔNG có trong file thiết bị — cần bổ sung khi duyệt.',
  },
  encounters: [
    {
      _id: 'enc-hoso-thu-1',
      date: '2025-10-18',
      examType: 'Bản đồ giác mạc',
      importSource: 'BandogiacmacNguyenAnhThu2.pdf (Medmont)',
      conclusion:
        'Bản đồ giác mạc (Medmont Studio 7.2.8) — 18/10/2025. ' +
        'OD: K 41.87 / 42.24 D (ΔK 0.36), K trung bình 42.47 D, IS 0.61, SAI 1.46, SRI 0.77. ' +
        'OS: K 41.54 / 42.19 D (ΔK 0.65), K trung bình 42.39 D, IS 0.98, SAI 1.76, SRI 0.80. ' + STAMP,
      services: [{
        serviceCode: 'SVC-TOPO', serviceName: 'Bản đồ giác mạc',
        output: {
          od_k1: 41.87, od_k2: 42.24, os_k1: 41.54, os_k2: 42.19,
          od_eccentricity: 0.38, os_eccentricity: 0.36,
          note:
            'Medmont Studio 7.2.8 — Tangential Power, 18/10/2025. ' +
            'OD: Flat K 41.87 D@30°, Steep K 42.24 D@120°, ΔK 0.36 D, Avg K 42.47 D, ' +
            'IS 0.61, SAI 1.46, SRI 0.77, đồng tử 3.1 mm. ' +
            'OS: Flat K 41.54 D@161°, Steep K 42.19 D@71°, ΔK 0.65 D, Avg K 42.39 D, ' +
            'IS 0.98, SAI 1.76, SRI 0.80, đồng tử 3.4 mm.',
        },
      }],
    },
    {
      _id: 'enc-hoso-thu-2',
      date: '2026-05-21',
      examType: 'Bản đồ giác mạc',
      importSource: 'BandogiacmacNguyenAnhThu3.pdf (Medmont)',
      conclusion:
        'Bản đồ giác mạc (Medmont Studio 7.2.8) — 21/05/2026 (tái khám). ' +
        'OD: K 42.61 / 43.52 D (ΔK 0.91), K trung bình 42.97 D, IS 0.80, SAI 0.66, SRI 0.28. ' +
        'OS: K 42.64 / 43.45 D (ΔK 0.81), K trung bình 42.92 D, IS 0.82, SAI 0.72, SRI 0.37. ' + STAMP,
      services: [{
        serviceCode: 'SVC-TOPO', serviceName: 'Bản đồ giác mạc',
        output: {
          od_k1: 42.61, od_k2: 43.52, os_k1: 42.64, os_k2: 43.45,
          od_eccentricity: 0.59, os_eccentricity: 0.58,
          note:
            'Medmont Studio 7.2.8 — Tangential Power, 21/05/2026. ' +
            'OD: Flat K 42.61 D@180°, Steep K 43.52 D@90°, ΔK 0.91 D, Avg K 42.97 D, ' +
            'IS 0.80, SAI 0.66, SRI 0.28, đồng tử 3.1 mm. ' +
            'OS: Flat K 42.64 D@173°, Steep K 43.45 D@83°, ΔK 0.81 D, Avg K 42.92 D, ' +
            'IS 0.82, SAI 0.72, SRI 0.37, đồng tử 3.0 mm.',
        },
      }],
    },
  ],
}

// ══════════════════════════════════════════════════════════════════════════
// HANDWRITTEN BATCH — doc3/4/5/10. Scanned paper forms. Clinical numbers are
// BEST-EFFORT reads from handwriting and must be verified against the scans
// during review — they live in `conclusion` text, not structured fields, so
// they don't masquerade as device-grade values. Demographics are partial;
// the admin completes DOB/gender on approval.
// ══════════════════════════════════════════════════════════════════════════
const HW = 'Hồ sơ giấy viết tay (scan) — số liệu lâm sàng đọc theo chữ viết tay, ' +
  'BẮT BUỘC đối chiếu bản scan gốc khi duyệt.'

// doc3 — Ngô Đức Trọng — theo dõi tiến triển cận thị, kính gọng Stellest
const trong = {
  _id: 'BN-20260522-9101',
  patient: {
    name: 'Ngô Đức Trọng', gender: 'M', dob: '',
    importSource: 'Kiểm soát tiến triển cận thị kính gọng.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu theo dõi cận thị viết tay (mã hồ sơ "58"). ' +
      'Sinh năm 2019 (chỉ đọc được năm — cần bổ sung ngày/tháng). Phiếu ban đầu ghi: ' +
      'cao 1m38, nặng 35.5kg, sinh non 37 tuần / 2.8kg, dị ứng thời tiết, gia đình có cận thị.',
  },
  encounters: [
    { _id: 'enc-hoso-trong-1', date: '2024-09-28', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 28/09/2024. KXTĐ (đọc tay): ' +
        'MP ~-3.00/-0.75 ×165, MT ~-3.00/-1.25 ×165. Kính cũ: MP -1.75/-0.50, MT -2.00/-0.75. ' + HW },
    { _id: 'enc-hoso-trong-2', date: '2025-04-09', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 09/04/2025. KXTĐ (đọc tay): MP -3.00/-0.75 ×169, ' +
        'K 44.00/45.75. Trục nhãn cầu (OCT, ~T6/2024): OD ~24.5 / OS ~24.0 mm. ' + HW },
    { _id: 'enc-hoso-trong-3', date: '2025-11-08', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — 08/11/2025. Cao 1m44, nặng 42kg. ' +
        'Trục nhãn cầu (OCT, ~T6/2025). Xử trí: dừng Vigamox; Comfort Shield ×1; khám lại sau 3 tháng. ' + HW },
    { _id: 'enc-hoso-trong-4', date: '2025-11-22', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi tiến triển cận thị — ~22/11/2025. KXTĐ (đọc tay): ' +
        'MP ~-2.50/-0.75 ×167, MT ~-3.00/-1.50 ×158. Trục nhãn cầu (OCT, ~T7/2025). ' + HW },
  ],
}

// doc4 — Nguyễn Đình Tùng — kính tiếp xúc cứng RGP, giác mạc hình chóp
const tung = {
  _id: 'BN-20260522-9102',
  patient: {
    name: 'Nguyễn Đình Tùng', gender: 'M', dob: '',
    importSource: 'Kinh tiếp xúc cứng - Giác mạc chóp.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu khám kính tiếp xúc viết tay (mã 133KTX). ' +
      'Chẩn đoán: giác mạc hình chóp (keratoconus), đeo kính tiếp xúc cứng RGP. ' +
      'Ngày sinh đọc tay 11/7/1991 hoặc 11/7/1994 — cần xác minh. ' +
      'Tên đệm có thể là "Danh" thay vì "Đình" — cần xác minh.',
  },
  encounters: [
    { _id: 'enc-hoso-tung-1', date: '2022-02-15', examType: 'Khám kính tiếp xúc (mới)',
      conclusion: 'Khám kính tiếp xúc cứng — giác mạc hình chóp — 15/02/2022. KXTĐ (đọc tay): ' +
        'MP phẳng/-2.50 ×69, MT -5.25/-6.25 ×84. K dốc bất thường. Thử lens RGP. ' + HW },
    { _id: 'enc-hoso-tung-2', date: '2022-12-15', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 15/12/2022. KXTĐ (đọc tay): MP -7.75 vùng, ' +
        'MT -0.25/-4.00. Thử lens KTX. ' + HW },
    { _id: 'enc-hoso-tung-3', date: '2024-01-11', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 11/01/2024. Thị lực với kính 20/25. ' +
        'Xử trí: Comfort Shield. ' + HW },
    { _id: 'enc-hoso-tung-4', date: '2025-03-14', examType: 'Tái khám kính tiếp xúc',
      conclusion: 'Tái khám kính tiếp xúc cứng — 14/03/2025. Đơn lens RGP cuối (đọc tay): ' +
        'MP 6.70 / 9.00 / -7.00, MT 6.70 / 9.00 / -8.00. ' + HW },
  ],
}

// doc5 — Lê Thu Thảo — kính tiếp xúc Ortho-K
const thao = {
  _id: 'BN-20260522-9103',
  patient: {
    name: 'Lê Thu Thảo', gender: '', dob: '',
    importSource: 'Kính tiếp xúc OrthoK.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu khám Ortho-K viết tay (mã 2O46). ' +
      'Ngày sinh đọc tay ~28/07/1988 — cần xác minh. Giới tính chưa rõ trên phiếu.',
  },
  encounters: [
    { _id: 'enc-hoso-thao-1', date: '2026-02-26', examType: 'Khám kính tiếp xúc (mới)',
      conclusion: 'Khám Ortho-K lần đầu — 26/02/2026. KXTĐ (đọc tay): MP -3.00/-0.75 ×85, ' +
        'MT -3.00/-1.00 ×5. Bản đồ giác mạc: MP K 42.14/42.62, MT K 41.53/42.34. Thử kính Ortho-K. ' + HW },
    { _id: 'enc-hoso-thao-2', date: '2026-03-12', examType: 'Tái khám kính tiếp xúc (Ortho-K)',
      conclusion: 'Tái khám Ortho-K — 12/03/2026. KXTĐ tồn dư (đọc tay): MP -0.75/-0.50 ×97, ' +
        'MT -1.25/-1.25 ×15. Thị lực 20/20. Thuốc: Solidra Plus. ' + HW },
    { _id: 'enc-hoso-thao-3', date: '2026-03-31', examType: 'Tái khám kính tiếp xúc (Ortho-K)',
      conclusion: 'Tái khám Ortho-K — 31/03/2026. Thị lực 20/20, định tâm tốt. ' + HW },
  ],
}

// doc10 — Trần Diệp Anh — theo dõi tiến triển cận thị (điều trị thuốc)
const dipanh = {
  _id: 'BN-20260522-9104',
  patient: {
    name: 'Trần Diệp Anh', gender: '', dob: '',
    importSource: 'kiểm soát tiến triển cận thị bằng thuốc_1.pdf (phiếu viết tay)',
    notes: STAMP + ' ' + HW + ' Nguồn: phiếu theo dõi cận thị viết tay (mã A201–A204). ' +
      'Sinh tháng 3/2014 (đọc tay ~11–16/03/2014) — cần xác minh. Giới tính chưa rõ.',
  },
  encounters: [
    { _id: 'enc-hoso-dipanh-1', date: '2024-03-16', examType: 'Khám kiểm soát cận thị',
      conclusion: 'Phiếu thông tin theo dõi cận thị — 16/03/2024. Cao ~130cm, nặng ~33kg. ' +
        'Tiền sử: bố cận thị. ' + HW },
    { _id: 'enc-hoso-dipanh-2', date: '2024-11-24', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~24/11/2024. KXTĐ (đọc tay) cận thị cao: MP ~-8.00/-4.25 ×119, ' +
        'MT ~-10.25/-2.50 ×122. Trục nhãn cầu (OCT, đọc tay) ~OD 28 / OS 27 mm — SỐ LIỆU NGHI NGỜ, cần đối chiếu. ' + HW },
    { _id: 'enc-hoso-dipanh-3', date: '2025-10-23', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~23/10/2025. KXTĐ (đọc tay): MP -3.00/-1.75 ×138, MT -0.50/-2.50 ×152. ' +
        'Trục nhãn cầu (OCT, đọc tay) OD ~25.9 / OS ~23.5 mm. ' + HW },
    { _id: 'enc-hoso-dipanh-4', date: '2026-03-19', examType: 'Tái khám kiểm soát cận thị',
      conclusion: 'Theo dõi cận thị — ~19/03/2026. Trục nhãn cầu (OCT, đọc tay) OD ~23.7 / OS ~23.5 mm. ' + HW },
  ],
}

const SOURCE = [khoi, trang, thu, trong, tung, thao, dipanh]

// ─── build final Patient + Encounter documents ────────────────────────────
function buildAll() {
  const patients = []
  const encounters = []
  for (const p of SOURCE) {
    const encDates = p.encounters.map(e => e.date).sort()
    const lastDate = encDates[encDates.length - 1]
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
        lastEncounterAt: iso(lastDate),
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
          importSource: e.importSource,
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
    console.log(`         giới tính: ${d.gender || '(trống — cần bổ sung)'}   ` +
      `ngày sinh: ${d.dob || '(trống — cần bổ sung)'}`)
    const encs = encounters.filter(e => e.doc.patientId === p._id)
    for (const e of encs) {
      console.log(`  ENCOUNTER  ${e._id}  ${e.doc.studyDate}  "${e.doc.examType}"  [${e.doc.reviewStatus}]`)
      if (e.doc.conclusion) console.log(`         ↳ ${e.doc.conclusion.slice(0, 96)}…`)
      for (const s of e.doc.assignedServices) {
        console.log(`     • ${s.serviceCode}  ${s.serviceName}`)
        for (const [k, v] of Object.entries(s.output)) {
          const val = String(v).length > 90 ? String(v).slice(0, 90) + '…' : v
          console.log(`         ${k}: ${val}`)
        }
      }
    }
    console.log('')
  }
  console.log(`TOTAL: ${patients.length} bệnh nhân, ${encounters.length} lượt khám — tất cả chờ duyệt.`)
  console.log('Để ghi vào MongoDB Atlas:  railway run node scripts/import-sample-hoso.js\n')
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
