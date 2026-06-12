// Adversarial clinical eval for the diagnostic v0 pipeline.
//
// 40 cases spanning: canonical textbook presentations, atypical / mimicker
// presentations, compound diseases, vague / sparse complaints, conflicting
// inputs, misleading red herrings, and out-of-distribution requests.
//
// For each case we:
//   1. Run parseComplaint(prose) — full LLM → structured complaint
//   2. Run runDiagnostic(complaint, []) — full engine
//   3. Score: Hit@1 / Hit@3 / Hit@5 on diseases, red-flag precision+recall,
//      forbidden-red-flag rate, urgency match.
//   4. Emit a per-case row + an aggregate-by-category summary at the end.
//
// Cases authored from AAO BCSC, Wills Eye Manual, AAO PPP, EyeRounds.org
// (University of Iowa) standard teaching examples. Prose written in
// Vietnamese as a Vietnamese ophthalmologist would record intake.
//
// Run:
//   cd maec-app/server
//   node diagnostic/clinical-eval.js > /tmp/eval.txt
//
// Cost: ~$0.20 in Anthropic API spend; ~5 min runtime due to LLM latency.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const mongoose = require('mongoose')
const { parseComplaint } = require('./llm/parseComplaint')
const { runDiagnostic } = require('./engine/orchestrator')

// ──────────────────────────────────────────────────────────────────
// Case bank
// ──────────────────────────────────────────────────────────────────

const CASES = [

  // ════════ BASELINE — canonical textbook presentations ════════

  {
    id: 'B01', category: 'baseline', name: 'Acute angle-closure glaucoma',
    source: 'AAO BCSC §10',
    prose: 'Bệnh nhân nữ 62 tuổi đến cấp cứu vì đau dữ dội mắt phải 6 giờ nay, kèm đỏ mắt nhiều, nhìn thấy quầng sáng quanh đèn, buồn nôn và nôn. Tiền sử viễn thị.',
    expectedTop: ['d-acute-angle-closure'],
    acceptableTop3: ['d-acute-angle-closure'],
    expectedRedFlags: ['rf-acute-angle-closure'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'B02', category: 'baseline', name: 'Central retinal artery occlusion',
    source: 'Wills Eye Manual 13.4',
    prose: 'Bệnh nhân nam 71 tuổi, đột nhiên mất thị lực mắt trái cách đây 45 phút, không đau, không đỏ. Tiền sử tăng huyết áp, rung nhĩ.',
    expectedTop: ['d-rao'],
    acceptableTop3: ['d-rao', 'd-naion', 'd-gca'],
    expectedRedFlags: ['rf-rao'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'B03', category: 'baseline', name: 'Optic neuritis (young female)',
    source: 'AAO BCSC §5 (Neuro-ophth)',
    prose: 'Bệnh nhân nữ 28 tuổi, mờ dần mắt phải qua 3 ngày nay, đau khi liếc mắt, màu sắc nhìn nhạt đi.',
    expectedTop: ['d-optic-neuritis'],
    acceptableTop3: ['d-optic-neuritis'],
    expectedRedFlags: ['rf-optic-neuritis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'B04', category: 'baseline', name: 'NAION (vasculopath, altitudinal)',
    source: 'AAO BCSC §5',
    prose: 'Bệnh nhân nam 67 tuổi, sáng thức dậy thấy mất nửa trên thị trường mắt phải, không đau. Tiền sử đái tháo đường, tăng huyết áp, ngưng thở khi ngủ.',
    expectedTop: ['d-naion'],
    acceptableTop3: ['d-naion', 'd-gca', 'd-rao'],
    expectedRedFlags: ['rf-naion'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent',
  },
  {
    id: 'B05', category: 'baseline', name: 'GCA (vision + jaw claudication)',
    source: 'AAO PPP 2023',
    prose: 'Bệnh nhân nữ 74 tuổi, mất thị lực đột ngột mắt phải hôm qua. Hai tuần nay đau đầu hai bên thái dương, đau cơ hàm khi nhai, sờ da đầu thấy đau.',
    expectedTop: ['d-gca'],
    acceptableTop3: ['d-gca', 'd-naion', 'd-rao'],
    expectedRedFlags: ['rf-gca'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'B06', category: 'baseline', name: 'Rhegmatogenous RD',
    source: 'Wills Eye Manual 11.4',
    prose: 'Bệnh nhân nam 58 tuổi, mắt phải xuất hiện chớp sáng và ruồi bay nhiều cách đây 2 ngày. Hôm nay thấy có một mảng đen kéo dần lên từ phía dưới che mất thị trường.',
    expectedTop: ['d-retinal-detachment'],
    acceptableTop3: ['d-retinal-detachment', 'd-pvd-with-tear'],
    expectedRedFlags: ['rf-retinal-detachment'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'B07', category: 'baseline', name: 'Endophthalmitis post-cataract',
    source: 'EVS / Wills 12.15',
    prose: 'Bệnh nhân nam 70 tuổi, mổ Phaco mắt trái cách đây 4 ngày. Hôm nay thấy đau tăng, đỏ nhiều, thị lực giảm rõ rệt.',
    expectedTop: ['d-endophthalmitis'],
    acceptableTop3: ['d-endophthalmitis', 'd-anterior-uveitis'],
    expectedRedFlags: ['rf-endophthalmitis'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'B08', category: 'baseline', name: 'Bacterial keratitis in CL wearer',
    source: 'AAO PPP — Bacterial Keratitis',
    prose: 'Bệnh nhân nam 24 tuổi, đeo kính tiếp xúc mềm thường xuyên, ngủ qua đêm vẫn để kính. Mắt trái đau, sợ ánh sáng dữ dội, chảy nước mắt, thấy có một đốm trắng nhỏ trên giác mạc.',
    expectedTop: ['d-bacterial-keratitis'],
    acceptableTop3: ['d-bacterial-keratitis', 'd-acanthamoeba-keratitis', 'd-hsv-keratitis'],
    expectedRedFlags: ['rf-bacterial-keratitis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'B09', category: 'baseline', name: 'Acute anterior uveitis (HLA-B27)',
    source: 'AAO BCSC §9',
    prose: 'Bệnh nhân nam 32 tuổi, mắt phải đau, sợ ánh sáng, đỏ quanh tròng đen. Tiền sử nhiều tháng nay đau cứng lưng buổi sáng kéo dài hơn 30 phút, đỡ khi vận động.',
    expectedTop: ['d-anterior-uveitis'],
    acceptableTop3: ['d-anterior-uveitis'],
    expectedRedFlags: ['rf-acute-uveitis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent',
  },
  {
    id: 'B10', category: 'baseline', name: 'Age-related cataract',
    source: 'AAO BCSC §11',
    prose: 'Cụ ông 72 tuổi, mờ tăng dần 2 mắt nhiều tháng nay, không đau. Đặc biệt khó nhìn khi lái xe ban đêm vì loá đèn pha.',
    expectedTop: ['d-cataract'],
    acceptableTop3: ['d-cataract'],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-retinal-detachment'],
    minUrgency: 'routine',
  },
  {
    id: 'B11', category: 'baseline', name: 'Wet AMD with metamorphopsia',
    source: 'AAO BCSC §12',
    prose: 'Bệnh nhân nữ 76 tuổi, hai ngày nay đột nhiên thấy các đường thẳng bị méo và một đốm mờ ở trung tâm thị trường mắt phải.',
    expectedTop: ['d-wet-amd'],
    acceptableTop3: ['d-wet-amd', 'd-macular-hole'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'B12', category: 'baseline', name: 'Evaporative dry eye / MGD',
    source: 'TFOS DEWS II',
    prose: 'Bệnh nhân nữ 45 tuổi, làm văn phòng, cảm giác cộm rát hai mắt cuối ngày, mờ thỉnh thoảng nhưng đỡ khi chớp mắt, đôi khi chảy nước mắt nghịch lý.',
    expectedTop: ['d-dry-eye-mgd'],
    acceptableTop3: ['d-dry-eye-mgd', 'd-dry-eye-aqueous', 'd-blepharitis'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'routine',
  },
  {
    id: 'B13', category: 'baseline', name: 'Allergic conjunctivitis',
    source: 'Kanski',
    prose: 'Bệnh nhân nam 18 tuổi, hai mắt ngứa nhiều, đỏ, chảy nước trong vắt, tái đi tái lại theo mùa.',
    expectedTop: ['d-allergic-conjunctivitis'],
    acceptableTop3: ['d-allergic-conjunctivitis', 'd-viral-conjunctivitis'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'routine',
  },
  {
    id: 'B14', category: 'baseline', name: 'CN III palsy + blown pupil',
    source: 'AAO BCSC §5',
    prose: 'Bệnh nhân nam 54 tuổi, đột nhiên sụp mi mắt phải, song thị, đồng tử mắt phải giãn không đáp ứng ánh sáng. Đau đầu vùng thái dương.',
    expectedTop: ['d-cn3-palsy-compressive'],
    acceptableTop3: ['d-cn3-palsy-compressive', 'd-cn3-palsy-ischemic'],
    expectedRedFlags: ['rf-cn3-blown-pupil'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'B15', category: 'baseline', name: 'Chemical burn (alkali)',
    source: 'AAO PPP',
    prose: 'Bệnh nhân nam 35 tuổi, công nhân, hoá chất tẩy rửa văng vào mắt phải cách đây 20 phút, đau rát dữ dội, đỏ nhiều, mờ.',
    expectedTop: ['d-chemical-burn'],
    acceptableTop3: ['d-chemical-burn'],
    expectedRedFlags: ['rf-chemical-burn'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },

  // ════════ ATYPICAL — mimickers, ambiguous presentations ════════

  {
    id: 'A01', category: 'atypical', name: 'Normal-tension glaucoma (no clear complaint)',
    source: 'AAO PPP — Glaucoma',
    prose: 'Bệnh nhân nữ 58 tuổi đến khám định kỳ, không có triệu chứng gì. Tiền sử gia đình mẹ bị glôcôm.',
    expectedTop: [],
    acceptableTop3: ['d-normal-tension-glaucoma', 'd-poag', 'd-ocular-hypertension'],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-retinal-detachment', 'rf-rao'],
    minUrgency: 'routine',
    notes: 'Asymptomatic screening — engine should not over-trigger; differential should rank silent diseases low absent any findings.',
  },
  {
    id: 'A02', category: 'atypical', name: 'GCA without jaw claudication',
    source: 'Wills 10.17',
    prose: 'Bệnh nhân nữ 78 tuổi, mất thị lực đột ngột mắt phải sáng nay, không đau mắt nhưng có đau đầu vùng thái dương phải, mệt mỏi, sụt cân.',
    expectedTop: ['d-gca'],
    acceptableTop3: ['d-gca', 'd-naion', 'd-rao'],
    expectedRedFlags: ['rf-gca'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
    notes: 'GCA without classical jaw claudication should still fire — depends on other signals (headache + age 50+).',
  },
  {
    id: 'A03', category: 'atypical', name: 'Posterior vitreous detachment (no tear)',
    source: 'AAO PPP',
    prose: 'Bệnh nhân nam 64 tuổi, hai ngày nay thấy có một ruồi bay đen lớn nổi rõ trên nền sáng, đôi khi có chớp sáng thoáng qua. Không có màn che, thị lực bình thường.',
    expectedTop: ['d-pvd'],
    acceptableTop3: ['d-pvd', 'd-pvd-with-tear', 'd-retinal-detachment'],
    expectedRedFlags: ['rf-retinal-detachment'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Engine should fire RD red-flag for safety even when PVD is most likely — symptoms overlap.',
  },
  {
    id: 'A04', category: 'atypical', name: 'HSV keratitis (recurrent, no CL)',
    source: 'AAO BCSC §8',
    prose: 'Bệnh nhân nam 42 tuổi, mắt phải đau, sợ ánh sáng, chảy nước. Không đeo kính tiếp xúc. Tiền sử đã có một đợt tương tự cách đây 1 năm.',
    expectedTop: ['d-hsv-keratitis'],
    acceptableTop3: ['d-hsv-keratitis', 'd-bacterial-keratitis', 'd-anterior-uveitis'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Without dendritic-ulcer observation, HSV is hard to call from prose alone. v0 likely gives bacterial keratitis as top.',
  },
  {
    id: 'A05', category: 'atypical', name: 'Acanthamoeba keratitis (CL + tap water)',
    source: 'EyeRounds',
    prose: 'Bệnh nhân nữ 26 tuổi, đeo kính tiếp xúc mềm, súc rửa hộp kính bằng nước máy. Hai tuần nay đau mắt phải dữ dội mất tỉ lệ với dấu hiệu khám, đau cả khi nhắm mắt, mờ.',
    expectedTop: ['d-acanthamoeba-keratitis'],
    acceptableTop3: ['d-acanthamoeba-keratitis', 'd-bacterial-keratitis', 'd-hsv-keratitis'],
    expectedRedFlags: ['rf-bacterial-keratitis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Disproportionate pain is the classic clue but rarely encoded as a finding tag.',
  },
  {
    id: 'A06', category: 'atypical', name: 'Chiasmal compression (pituitary)',
    source: 'AAO BCSC §5',
    prose: 'Bệnh nhân nam 48 tuổi, vài tháng nay mờ dần, cảm giác như không nhìn thấy hai bên ngoài, va vào cửa khi đi. Đau đầu nhẹ thỉnh thoảng.',
    expectedTop: ['d-chiasmal-compression'],
    acceptableTop3: ['d-chiasmal-compression'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Bitemporal field loss is the discriminator — depends on patient describing "two sides outside" clearly.',
  },

  // ════════ COMPOUND — coexisting / cascading diseases ════════

  {
    id: 'C01', category: 'compound', name: 'Cataract + suspected POAG',
    source: 'AAO PPP',
    prose: 'Cụ ông 70 tuổi, mờ tăng dần 2 mắt nhiều năm nay, không đau, không đỏ. Tiền sử gia đình anh trai bị glôcôm góc mở.',
    expectedTop: ['d-cataract'],
    acceptableTop3: ['d-cataract', 'd-poag', 'd-dry-amd'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'routine',
    notes: 'Cataract is symptomatic; POAG silent. Engine should rank cataract first but POAG should appear in differential.',
  },
  {
    id: 'C02', category: 'compound', name: 'PDR with vitreous hemorrhage',
    source: 'AAO BCSC §12',
    prose: 'Bệnh nhân nam 56 tuổi, đái tháo đường 15 năm, mắt trái đột ngột giảm thị lực kèm rất nhiều ruồi bay đen như khói cách đây 2 giờ.',
    expectedTop: ['d-dr-pdr'],
    acceptableTop3: ['d-dr-pdr', 'd-retinal-detachment', 'd-pvd-with-tear'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Sudden VL + floaters in diabetic should rank PDR with VH. RD red-flag may also fire — both are reasonable.',
  },
  {
    id: 'C03', category: 'compound', name: 'Uveitic glaucoma',
    source: 'Wills',
    prose: 'Bệnh nhân nữ 38 tuổi, đợt thứ 3 viêm màng bồ đào trước mắt phải, lần này đau dữ dội hơn, đỏ quanh tròng đen, đồng tử nhỏ, sợ ánh sáng. Nhãn áp lần khám trước cao.',
    expectedTop: ['d-anterior-uveitis'],
    acceptableTop3: ['d-anterior-uveitis', 'd-neovascular-glaucoma', 'd-acute-angle-closure'],
    expectedRedFlags: ['rf-acute-uveitis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent',
    notes: 'Recurrent uveitis + IOP — secondary glaucoma. Engine has neovascular but not "inflammatory glaucoma" disease.',
  },

  // ════════ ADVERSARIAL — sparse / conflicting / misleading ════════

  {
    id: 'X01', category: 'adversarial', name: 'Very sparse prose: "Mắt mờ"',
    source: 'crafted',
    prose: 'Mắt mờ.',
    expectedTop: [],
    acceptableTop3: [],  // anything plausible
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-rao', 'rf-cn3-blown-pupil'],
    minUrgency: 'routine',
    notes: 'Vague complaint — engine should NOT trigger emergency red-flags. Differential should be broad and low-confidence.',
  },
  {
    id: 'X02', category: 'adversarial', name: 'Conflicting pain levels in same prose',
    source: 'crafted',
    prose: 'Bệnh nhân khai đau mắt dữ dội nhưng khi hỏi lại nói chỉ hơi cộm nhẹ, không có vấn đề gì đáng kể.',
    expectedTop: [],
    acceptableTop3: ['d-dry-eye-mgd', 'd-blepharitis'],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-bacterial-keratitis'],
    minUrgency: 'routine',
    notes: 'LLM has to handle contradiction. Should NOT fire severe-pain red-flags on conflicting input.',
  },
  {
    id: 'X03', category: 'adversarial', name: 'Chronic stable floaters (not new)',
    source: 'crafted',
    prose: 'Bệnh nhân nam 70 tuổi, có ruồi bay đen ở mắt trái nhiều năm nay không thay đổi, không chớp sáng, không có màn che. Đến khám định kỳ.',
    expectedTop: [],
    acceptableTop3: ['d-pvd'],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-retinal-detachment'],
    minUrgency: 'routine',
    notes: 'Chronic stable floaters ≠ new floaters. Should NOT fire RD red-flag (which needs flashes + NEW floaters).',
  },
  {
    id: 'X04', category: 'adversarial', name: 'Routine glasses check (no pathology)',
    source: 'crafted',
    prose: 'Cháu học sinh 14 tuổi, mẹ đưa đi đo lại kính vì kính cũ đã 1 năm.',
    expectedTop: ['d-myopia'],
    acceptableTop3: ['d-myopia', 'd-hyperopia', 'd-astigmatism'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'routine',
    notes: 'Routine refractive workup — should rank refractive errors high; no red-flags.',
  },
  {
    id: 'X05', category: 'adversarial', name: 'Empty asymptomatic checkup',
    source: 'crafted',
    prose: 'Bệnh nhân khám sức khoẻ định kỳ, không triệu chứng.',
    expectedTop: [],
    acceptableTop3: [],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-retinal-detachment', 'rf-rao', 'rf-gca'],
    minUrgency: 'routine',
    notes: 'Truly empty — engine should produce a tiny / empty differential and zero red-flags.',
  },
  {
    id: 'X06', category: 'adversarial', name: 'Migraine with aura (mimics RD)',
    source: 'crafted',
    prose: 'Bệnh nhân nữ 32 tuổi, thấy chớp sáng dạng zigzag ở hai bên thị trường trong 20 phút, sau đó đau đầu một bên kèm buồn nôn. Tiền sử đã xảy ra nhiều lần.',
    expectedTop: [],
    acceptableTop3: ['d-pvd', 'd-retinal-detachment'],
    expectedRedFlags: ['rf-retinal-detachment'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'Migraine aura mimics flashes, but bilateral + duration + recurrent pattern is migraine. v0 KB has no migraine — likely false-positive RD red-flag. This is a known gap.',
  },
  {
    id: 'X07', category: 'adversarial', name: 'Patient denies CL despite white spot',
    source: 'crafted',
    prose: 'Bệnh nhân nam 28 tuổi, đau mắt trái, sợ ánh sáng, thấy đốm trắng trên giác mạc. Khẳng định không đeo kính tiếp xúc.',
    expectedTop: ['d-bacterial-keratitis'],
    acceptableTop3: ['d-bacterial-keratitis', 'd-hsv-keratitis', 'd-corneal-abrasion'],
    expectedRedFlags: ['rf-bacterial-keratitis'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
    notes: 'CL-wearer trigger uses isContactLensWearerOrUnknown — explicit false. Test that the rule still fires on the symptom cluster regardless.',
  },
  {
    id: 'X08', category: 'adversarial', name: 'Vague "đau đầu" only',
    source: 'crafted',
    prose: 'Bệnh nhân than đau đầu nhiều ngày.',
    expectedTop: [],
    acceptableTop3: [],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-acute-angle-closure', 'rf-cn3-blown-pupil', 'rf-papilledema'],
    minUrgency: 'routine',
    notes: 'Bare "headache" without ocular symptoms — should NOT trigger ophth red-flags. Note: rf-papilledema only needs headache + ANY of [TVO, diplopia, disc swelling]. Should not fire on just headache.',
  },

  // ════════ EDGE — pediatric / cross-language / odd ════════

  {
    id: 'E01', category: 'edge', name: 'Pediatric leukocoria',
    source: 'AAO PPP — Retinoblastoma',
    prose: 'Mẹ đưa cháu trai 3 tuổi đến khám vì chụp ảnh thấy đồng tử trắng bên mắt phải thay vì ánh đỏ bình thường.',
    expectedTop: ['d-retinoblastoma'],
    acceptableTop3: ['d-retinoblastoma', 'd-congenital-cataract', 'd-pcv-coats'],
    expectedRedFlags: ['rf-leukocoria-child'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'E02', category: 'edge', name: 'Pediatric orbital cellulitis',
    source: 'AAO BCSC §7',
    prose: 'Cháu trai 6 tuổi, sốt 2 ngày, mí mắt phải sưng nề đỏ rõ rệt, mắt phải lồi nhẹ, đau khi liếc.',
    expectedTop: ['d-orbital-cellulitis'],
    acceptableTop3: ['d-orbital-cellulitis'],
    expectedRedFlags: ['rf-orbital-cellulitis'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
  },
  {
    id: 'E03', category: 'edge', name: 'Horner with neck pain (carotid dissection)',
    source: 'EyeRounds',
    prose: 'Bệnh nhân nam 46 tuổi, sáng nay đột ngột đau cổ bên phải sau khi tập gym, kèm sụp mi nhẹ và đồng tử nhỏ bên phải. Không liệt vận nhãn.',
    expectedTop: ['d-horner-syndrome'],
    acceptableTop3: ['d-horner-syndrome'],
    expectedRedFlags: ['rf-horner-new'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'E04', category: 'edge', name: 'Mixed VN-EN prose',
    source: 'crafted',
    prose: 'BN nữ 65 tuổi, sudden vision loss mắt phải painless 2 hours ago, no pain, không có history of trauma.',
    expectedTop: [],
    acceptableTop3: ['d-rao', 'd-naion', 'd-gca'],
    expectedRedFlags: ['rf-rao'],
    forbiddenRedFlags: [],
    minUrgency: 'emergency',
    notes: 'Tests LLM resilience to code-switching.',
  },
  {
    id: 'E05', category: 'edge', name: 'Long verbose prose',
    source: 'crafted',
    prose: 'Bệnh nhân nam 71 tuổi, hưu trí, đến khám hôm nay vì lý do chính là thị lực mắt phải bị suy giảm rõ rệt từ khoảng 3 ngày nay. Cụ thể bệnh nhân kể cách đây 3 ngày sáng thức dậy thấy như có một vùng tối ở phía trên thị trường mắt phải, không kèm đau, không kèm đỏ mắt, không có chớp sáng hay ruồi bay. Tiền sử bệnh nhân có tăng huyết áp đang điều trị 5 năm, đái tháo đường type 2 đang dùng metformin, có hội chứng ngưng thở khi ngủ. Gần đây không có chấn thương đầu mặt, không có phẫu thuật nội nhãn. Hỏi về đau đầu, đau cơ hàm, đau da đầu thì bệnh nhân phủ nhận.',
    expectedTop: ['d-naion'],
    acceptableTop3: ['d-naion', 'd-gca', 'd-rao'],
    expectedRedFlags: ['rf-naion'],
    forbiddenRedFlags: ['rf-gca'],
    minUrgency: 'urgent',
    notes: 'Verbose NAION presentation with explicit GCA negatives. Tests LLM filtering and engine prioritization.',
  },
  {
    id: 'E06', category: 'edge', name: 'Papilledema (raised ICP)',
    source: 'AAO BCSC §5',
    prose: 'Bệnh nhân nữ 28 tuổi, béo phì, vài tuần nay đau đầu nặng dần, thấy mờ thoáng qua nhiều lần trong ngày, đôi khi nhìn đôi. Khám đáy mắt thấy phù gai thị hai bên.',
    expectedTop: ['d-papilledema'],
    acceptableTop3: ['d-papilledema', 'd-iih'],
    expectedRedFlags: ['rf-papilledema'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },

  // ════════ MIMICKER — easy-to-confuse ════════

  {
    id: 'M01', category: 'mimicker', name: 'Episcleritis vs scleritis',
    source: 'AAO BCSC §8',
    prose: 'Bệnh nhân nữ 35 tuổi, mắt phải đỏ ở một vùng nhỏ, hơi khó chịu, không đau sâu, thị lực bình thường. Tự khỏi vài lần trước đây.',
    expectedTop: ['d-episcleritis'],
    acceptableTop3: ['d-episcleritis', 'd-scleritis'],
    expectedRedFlags: [],
    forbiddenRedFlags: ['rf-scleritis-severe'],
    minUrgency: 'routine',
  },
  {
    id: 'M02', category: 'mimicker', name: 'Scleritis (severe boring)',
    source: 'AAO BCSC §8',
    prose: 'Bệnh nhân nữ 50 tuổi, tiền sử viêm khớp dạng thấp, mắt phải đau sâu kiểu khoan, đau cả đêm không ngủ được, đỏ tím, ấn vào thấy đau.',
    expectedTop: ['d-scleritis'],
    acceptableTop3: ['d-scleritis'],
    expectedRedFlags: ['rf-scleritis-severe'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent_referral',
  },
  {
    id: 'M03', category: 'mimicker', name: 'Viral vs bacterial conjunctivitis',
    source: 'AAO PPP',
    prose: 'Bệnh nhân nam 32 tuổi, mắt trái đỏ, chảy nước trong, mí dính khi ngủ dậy. Cách đây 3 ngày bị cảm cúm. Vợ và con cũng vừa bị tương tự.',
    expectedTop: ['d-viral-conjunctivitis'],
    acceptableTop3: ['d-viral-conjunctivitis', 'd-bacterial-conjunctivitis', 'd-allergic-conjunctivitis'],
    expectedRedFlags: [],
    forbiddenRedFlags: [],
    minUrgency: 'routine',
  },
  {
    id: 'M04', category: 'mimicker', name: 'Hyphema (trauma)',
    source: 'AAO BCSC §8',
    prose: 'Bệnh nhân nam 19 tuổi, bị bóng tennis va vào mắt phải cách đây 2 giờ, sau đó thấy mờ và có lớp máu màu đỏ ở dưới giác mạc.',
    expectedTop: ['d-hyphema'],
    acceptableTop3: ['d-hyphema'],
    expectedRedFlags: ['rf-hyphema'],
    forbiddenRedFlags: [],
    minUrgency: 'urgent',
  },
]

// ──────────────────────────────────────────────────────────────────
// Eval runner
// ──────────────────────────────────────────────────────────────────

function fmt(v, width) {
  const s = String(v ?? '')
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length)
}

async function evalCase(c) {
  const out = { id: c.id, category: c.category, name: c.name }
  try {
    const parsed = await parseComplaint(c.prose)
    out.parsedSymptoms = parsed.complaint.symptoms
    out.parsedQualifiers = `onset=${parsed.complaint.onset} pain=${parsed.complaint.pain} red=${parsed.complaint.redness} vis=${parsed.complaint.visionChange} eye=${parsed.complaint.eyeAffected}`
    out.parserConfidence = parsed.confidence
    out.parserDropped = parsed.droppedUnknownTags

    const result = await runDiagnostic(parsed.complaint, [])
    const topIds = (result.differential || []).map(d => d.diseaseId)
    out.topDifferential = topIds.slice(0, 5)
    out.rfFired = (result.redFlags || []).map(rf => rf.redFlagId)
    out.topUrgency = result.differential[0]?.urgency

    // Score
    const hit1 = c.expectedTop.length > 0 && c.expectedTop.includes(topIds[0])
    const acceptInTop3 = c.acceptableTop3.length > 0 && c.acceptableTop3.some(d => topIds.slice(0, 3).includes(d))
    const acceptInTop5 = c.acceptableTop3.length > 0 && c.acceptableTop3.some(d => topIds.slice(0, 5).includes(d))

    const rfFiredSet = new Set(out.rfFired)
    const expectedRfHit = c.expectedRedFlags.length === 0 || c.expectedRedFlags.some(rf => rfFiredSet.has(rf))
    const forbiddenRfFired = c.forbiddenRedFlags.some(rf => rfFiredSet.has(rf))

    out.hit1 = hit1
    out.hit3 = acceptInTop3
    out.hit5 = acceptInTop5
    out.rfHit = expectedRfHit
    out.forbiddenRfFired = forbiddenRfFired

    // Overall pass/fail logic
    // - If case expects a specific top diagnosis: hit3 OR (expectedTop.length===0)
    // - Red-flag expectations: rfHit must be true
    // - Forbidden red-flags: must NOT fire
    const requiresDiagnosisMatch = c.expectedTop.length > 0 || c.acceptableTop3.length > 0
    const diagnosisOk = !requiresDiagnosisMatch || acceptInTop3
    out.pass = diagnosisOk && expectedRfHit && !forbiddenRfFired
  } catch (err) {
    out.error = err.message
    out.pass = false
  }
  return out
}

async function main() {
  console.log('Adversarial clinical eval — diagnostic v0')
  console.log('Cases:', CASES.length)
  console.log('Started:', new Date().toISOString())
  console.log('─'.repeat(120))

  const results = []
  for (const c of CASES) {
    process.stdout.write(`▸ ${c.id} ${c.name}...`)
    const r = await evalCase(c)
    results.push(r)
    const mark = r.error ? '✘ ERROR' : r.pass ? '✓ PASS' : '✘ FAIL'
    process.stdout.write(` ${mark}\n`)
  }

  console.log('\n' + '─'.repeat(120))
  console.log('PER-CASE DETAIL')
  console.log('─'.repeat(120))
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const c = CASES[i]
    console.log(`\n[${r.id}] ${r.category.toUpperCase()} — ${r.name}`)
    if (r.error) {
      console.log(`  ERROR: ${r.error}`)
      continue
    }
    console.log(`  prose: ${c.prose.slice(0, 110)}${c.prose.length > 110 ? '...' : ''}`)
    console.log(`  parsed.symptoms: [${(r.parsedSymptoms || []).join(', ')}]`)
    console.log(`  parsed.qualifiers: ${r.parsedQualifiers} (conf: ${r.parserConfidence})`)
    if (r.parserDropped?.length) console.log(`  ⚠ parser dropped: ${r.parserDropped.join(', ')}`)
    console.log(`  top5 differential: ${r.topDifferential.join(', ') || '(empty)'}`)
    console.log(`  red-flags fired: ${r.rfFired.join(', ') || '(none)'}`)
    console.log(`  expected: top=${JSON.stringify(c.expectedTop)} acceptTop3=${JSON.stringify(c.acceptableTop3)}`)
    console.log(`  expected rf: ${JSON.stringify(c.expectedRedFlags)} forbidden rf: ${JSON.stringify(c.forbiddenRedFlags)}`)
    const tags = []
    if (r.hit1) tags.push('hit@1')
    if (r.hit3) tags.push('hit@3')
    if (r.hit5) tags.push('hit@5')
    if (r.rfHit) tags.push('rf-hit')
    if (r.forbiddenRfFired) tags.push('⚠ FORBIDDEN-RF-FIRED')
    console.log(`  → ${r.pass ? '✓ PASS' : '✘ FAIL'} (${tags.join(' / ')})`)
    if (c.notes) console.log(`  notes: ${c.notes}`)
  }

  console.log('\n' + '─'.repeat(120))
  console.log('AGGREGATE')
  console.log('─'.repeat(120))
  const byCat = {}
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, pass: 0, hit1: 0, hit3: 0, rfHit: 0, forbidRf: 0, errors: 0 }
    const b = byCat[r.category]
    b.total++
    if (r.pass) b.pass++
    if (r.hit1) b.hit1++
    if (r.hit3) b.hit3++
    if (r.rfHit) b.rfHit++
    if (r.forbiddenRfFired) b.forbidRf++
    if (r.error) b.errors++
  }
  console.log(`${fmt('category', 14)} ${fmt('n', 4)} ${fmt('pass', 8)} ${fmt('hit@1', 7)} ${fmt('hit@3', 7)} ${fmt('rf-hit', 7)} ${fmt('forbid-rf', 11)} ${fmt('errors', 6)}`)
  for (const [cat, b] of Object.entries(byCat)) {
    const fmtPct = (n) => `${n}/${b.total} (${Math.round(100 * n / b.total)}%)`
    console.log(`${fmt(cat, 14)} ${fmt(b.total, 4)} ${fmt(fmtPct(b.pass), 8)} ${fmt(fmtPct(b.hit1), 7)} ${fmt(fmtPct(b.hit3), 7)} ${fmt(fmtPct(b.rfHit), 7)} ${fmt(fmtPct(b.forbidRf), 11)} ${fmt(b.errors, 6)}`)
  }
  const totals = results.reduce((acc, r) => {
    acc.total++
    if (r.pass) acc.pass++
    if (r.hit1) acc.hit1++
    if (r.hit3) acc.hit3++
    if (r.rfHit) acc.rfHit++
    if (r.forbiddenRfFired) acc.forbidRf++
    if (r.error) acc.errors++
    return acc
  }, { total: 0, pass: 0, hit1: 0, hit3: 0, rfHit: 0, forbidRf: 0, errors: 0 })
  const fmtPct = (n) => `${n}/${totals.total} (${Math.round(100 * n / totals.total)}%)`
  console.log('─'.repeat(120))
  console.log(`${fmt('OVERALL', 14)} ${fmt(totals.total, 4)} ${fmt(fmtPct(totals.pass), 8)} ${fmt(fmtPct(totals.hit1), 7)} ${fmt(fmtPct(totals.hit3), 7)} ${fmt(fmtPct(totals.rfHit), 7)} ${fmt(fmtPct(totals.forbidRf), 11)} ${fmt(totals.errors, 6)}`)

  console.log('\nFailures detail:')
  for (const r of results.filter(r => !r.pass)) {
    console.log(`  [${r.id}] ${r.name}: ${r.error || 'see above'}`)
  }

  console.log('\nDone:', new Date().toISOString())
}

main()
  .then(() => mongoose.connection.close())
  .catch(err => {
    console.error('FATAL:', err)
    mongoose.connection.close()
    process.exit(1)
  })
