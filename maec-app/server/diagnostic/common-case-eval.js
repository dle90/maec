// Quick eval — does the engine handle everyday clinic complaints?
// MAEC's case mix is ~70% routine refractive + dry eye + minor surface.
// Adversarial eval already covers the dangerous-rare end; this catches gaps
// at the opposite end where we may be missing obvious common stuff.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('../db')

const mongoose = require('mongoose')
const { parseComplaint } = require('./llm/parseComplaint')
const { runDiagnostic } = require('./engine/orchestrator')

const CASES = [
  // Refractive workups — by far the biggest slice
  { id: 'C01', name: 'Học sinh muốn đo kính',
    prose: 'Cháu nam 12 tuổi, mẹ đưa đến đo kính vì kết quả khám trường thấy mắt mờ. Cháu hay phải nheo mắt khi nhìn bảng.' },
  { id: 'C02', name: 'Cận thị tăng độ ở trẻ',
    prose: 'Cháu nữ 9 tuổi, đeo kính cận 2 năm, gần đây thấy mờ tăng dần khi nhìn xa, kính cũ không đủ độ.' },
  { id: 'C03', name: 'Lão thị mới (40+)',
    prose: 'Bệnh nhân nam 44 tuổi, gần 1 năm nay đọc sách báo phải đưa ra xa mới rõ, nhìn xa vẫn bình thường.' },
  { id: 'C04', name: 'Muốn đo lại kính hàng năm',
    prose: 'Bệnh nhân nữ 28 tuổi, kính cũ đã 18 tháng, muốn kiểm tra lại độ kính.' },
  { id: 'C05', name: 'Mắt mỏi khi dùng máy tính',
    prose: 'Bệnh nhân nam 27 tuổi, làm IT, ngày làm máy tính 10 tiếng, cuối ngày mỏi mắt, hơi mờ, đau đầu nhẹ vùng trán.' },
  // Dry eye / surface
  { id: 'C06', name: 'Khô mắt văn phòng',
    prose: 'Bệnh nhân nữ 38 tuổi, mắt khô rát, cảm giác cộm như có cát, dùng nước mắt nhân tạo đỡ tạm thời. Văn phòng máy lạnh.' },
  { id: 'C07', name: 'Lẹo mắt cấp',
    prose: 'Bệnh nhân nữ 22 tuổi, 3 ngày nay mí trên mắt phải có một cục sưng đỏ đau ấn vào, không lan rộng.' },
  { id: 'C08', name: 'Chắp mạn tính',
    prose: 'Bệnh nhân nam 35 tuổi, mí trên mắt trái có một cục cứng không đau, đã 3 tháng không khỏi, không đỏ, không nóng.' },
  { id: 'C09', name: 'Mộng thịt',
    prose: 'Bệnh nhân nam 50 tuổi, làm nông, mắt phải có một mảng thịt đỏ phát triển từ phía mũi vào giác mạc trong nhiều năm, gần đây thấy khó chịu hơn.' },
  // Routine f/u
  { id: 'C10', name: 'Tái khám CL hàng tháng',
    prose: 'Bệnh nhân nam 25 tuổi, đeo Ortho-K được 6 tháng, đến tái khám định kỳ, không có triệu chứng bất thường.' },
  { id: 'C11', name: 'Tầm soát ĐTĐ (không triệu chứng)',
    prose: 'Bệnh nhân nam 52 tuổi, đái tháo đường type 2 đã 8 năm, đến tầm soát võng mạc định kỳ, không có triệu chứng mắt.' },
  // Mixed common complaints
  { id: 'C12', name: 'Mắt đỏ + ngứa mùa hoa',
    prose: 'Bệnh nhân nữ 30 tuổi, 1 tuần nay hai mắt ngứa, đỏ nhẹ, chảy nước, đang mùa phấn hoa.' },
  { id: 'C13', name: 'Đỏ mắt cấp + sốt nhẹ',
    prose: 'Bệnh nhân nam 28 tuổi, mắt phải đỏ, chảy nước, hơi nhức, hai ngày nay. Em bé ở nhà bị tương tự.' },
  { id: 'C14', name: 'Mắt đỏ + tiết mủ buổi sáng',
    prose: 'Bệnh nhân nam 6 tuổi, hai mắt đỏ, ngủ dậy có nhiều ghèn vàng dính mí.' },
  { id: 'C15', name: 'Co giật mi (myokymia)',
    prose: 'Bệnh nhân nữ 32 tuổi, mí dưới mắt trái thỉnh thoảng giật nhẹ vài giây, không đau, đã 1 tuần. Mất ngủ và stress công việc.' },
]

async function main() {
  console.log('Common-case eval — does the engine cover routine MAEC clinic mix?')
  console.log('Cases:', CASES.length, '\n')
  for (const c of CASES) {
    process.stdout.write(`▸ ${c.id} ${c.name}\n`)
    try {
      const parsed = await parseComplaint(c.prose)
      const result = await runDiagnostic(parsed.complaint, [])
      const top = (result.differential || []).slice(0, 3).map(d => `${d.nameVi} (${d.score.toFixed(2)})`)
      const rfs = (result.redFlags || []).map(rf => rf.redFlagId)
      console.log(`   parsed symptoms: [${parsed.complaint.symptoms.join(', ')}]`)
      console.log(`   top3 differential: ${top.join(' · ') || '(empty)'}`)
      console.log(`   red-flags: ${rfs.join(', ') || '(none)'}`)
      console.log(`   confidence: ${parsed.confidence}`)
      console.log('')
    } catch (e) {
      console.log(`   ERROR: ${e.message}\n`)
    }
  }
}

main().then(() => mongoose.connection.close()).catch(e => { console.error(e); mongoose.connection.close(); process.exit(1) })
