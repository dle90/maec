// Bilingual support for the diagnostic assistant (dx page only, for now).
// `t(vn)` is identity in Vietnamese mode, so wrapping a string never changes the
// default UI; in English mode it looks up this VN→EN map (falls back to the VN
// string if a key is missing). `pickLang` chooses between a KB object's EN
// `name` and Vietnamese `nameVi`.

export const pickLang = (obj, lang) =>
  !obj ? '' : (lang === 'en' ? (obj.name || obj.nameVi || obj._id) : (obj.nameVi || obj.name || obj._id))

export const EN = {
  // page / header
  'Hỗ trợ chẩn đoán': 'Diagnostic assistant',
  'Tìm bệnh nhân (tên / SĐT / mã)...': 'Find patient (name / phone / ID)…',
  'Lượt khám (tuỳ chọn)': 'Encounter (optional)',
  '+ Phiên mới': '+ New session',
  'Đổi': 'Change',
  'Lỗi:': 'Error:',
  'Công cụ này chỉ hỗ trợ chẩn đoán — bác sĩ chịu trách nhiệm chẩn đoán cuối cùng và quyết định điều trị.':
    'Decision support only — the clinician is responsible for the final diagnosis and treatment.',
  'Bắt đầu phiên mới? Phiên hiện tại đã lưu trong hệ thống.': 'Start a new session? The current one is already saved.',

  // exam-sync (Khám integration)
  '🔄 Lấy kết quả khám vào trợ lý': '🔄 Pull exam results into the assistant',
  'Đã lấy:': 'Pulled:',
  'Chưa có kết quả khám dạng số để lấy.': 'No numeric exam results to pull yet.',

  // blank / routine check-up ready-state
  '🟢 Trợ lý sẵn sàng': '🟢 Assistant ready',
  'Chưa có triệu chứng hay dấu hiệu bất thường — với khám định kỳ thì đây là bình thường, không có gì để cảnh báo. Thêm triệu chứng ở khung trên khi có; khi khám phát hiện dấu hiệu bất thường (vd. nhãn áp cao, tổn thương đáy mắt) trợ lý sẽ tự đưa ra gợi ý chẩn đoán.':
    'No symptoms or abnormal findings yet — for a routine check-up this is normal, nothing to flag. Add a symptom above if one emerges; when the exam turns up an abnormal finding (e.g. high IOP, a fundus lesion) the assistant will surface diagnostic suggestions automatically.',

  // complaint form
  '1. Lý do đến khám (tiếng Việt tự do)': '1. Chief complaint (free text)',
  '2. Triệu chứng': '2. Symptoms',
  '3. Tiền sử / bối cảnh': '3. History / context',
  '✨ Phân tích bằng AI': '✨ Parse with AI',
  '⏳ Đang phân tích...': '⏳ Parsing…',
  'Tự thêm triệu chứng bên dưới. Bác sĩ kiểm tra mắt, khởi phát & mức độ trước khi chạy.':
    'Auto-fills symptoms below. Review eye, onset & severity before running.',
  'Trình phân tích AI chưa được cấu hình. Vui lòng chọn triệu chứng thủ công bên dưới.':
    'AI parser is not configured. Please select symptoms manually below.',
  'Độ tin cậy': 'Confidence',
  'Bỏ qua tag không hợp lệ': 'Dropped invalid tags',
  '— bấm để thêm (có thể thêm cùng triệu chứng cho 2 mắt); ghi rõ mắt, khởi phát & mức độ từng dòng':
    '— click to add (the same symptom can be added for both eyes); set eye, onset & severity per row',
  'Chưa chọn triệu chứng nào.': 'No symptoms selected yet.',
  'Mắt:': 'Eye:',
  'Khởi phát:': 'Onset:',
  'Mức độ:': 'Severity:',
  'Bỏ': 'Remove',
  'Tuổi': 'Age',
  'Thời gian bị': 'Duration',
  'Đeo kính tiếp xúc': 'Contact lens wearer',
  'Chấn thương gần đây': 'Recent trauma',
  'Mổ/tiêm nội nhãn gần đây': 'Recent intraocular surgery/injection',
  'Hút thuốc': 'Smoker',
  'Có thai / cho con bú': 'Pregnant / breastfeeding',
  'Bệnh nền': 'Comorbidities',
  'Thuốc đang dùng': 'Current medications',
  'Tiền sử gia đình': 'Family history',
  '+ thêm': '+ add',
  'Chạy phân tích chẩn đoán →': 'Run diagnostic analysis →',
  '↻ Cập nhật triệu chứng': '↻ Update symptoms',
  '⏳ Đang chạy...': '⏳ Running…',
  'Cần chọn ít nhất 1 triệu chứng hoặc nhập mô tả tự do.': 'Select at least 1 symptom or enter free text.',
  'Thêm/bớt triệu chứng rồi cập nhật — kết quả khám phía dưới được giữ nguyên.':
    'Add/remove symptoms then update — the exam results below are preserved.',

  // symptom chips
  'Đau': 'Pain', 'Đỏ': 'Redness', 'Mờ tăng dần': 'Gradual blur', 'Mất TL đột ngột': 'Sudden vision loss',
  'Sợ ánh sáng': 'Photophobia', 'Quầng sáng': 'Halos', 'Chớp sáng': 'Flashes', 'Ruồi bay mới': 'New floaters',
  'Màn che': 'Curtain', 'Nhìn đôi': 'Diplopia', 'Cộm rát': 'Gritty/burning', 'Ngứa': 'Itching',
  'Tiết dịch': 'Discharge', 'Đau đầu': 'Headache', 'Buồn nôn': 'Nausea',
  // severity / onset / sex / duration units
  'Nhẹ': 'Mild', 'Vừa': 'Moderate', 'Dữ dội': 'Severe', 'Nặng': 'Severe',
  'Cấp': 'Acute', 'Bán cấp': 'Subacute', 'Từ từ': 'Gradual',
  '— Giới —': '— Sex —', 'Nam': 'Male', 'Nữ': 'Female', 'Có': 'Yes', 'Không': 'No',
  'giờ': 'hours', 'ngày': 'days', 'tuần': 'weeks', 'tháng': 'months',
  // history chips
  'Đái tháo đường': 'Diabetes', 'Tăng huyết áp': 'Hypertension', 'Bệnh tuyến giáp': 'Thyroid disease',
  'Bệnh tự miễn': 'Autoimmune disease', 'Chống đông': 'Anticoagulant', 'Corticoid': 'Corticosteroid',
  'Thuốc hạ nhãn áp': 'IOP-lowering drops', 'Glôcôm': 'Glaucoma', 'Thoái hóa hoàng điểm': 'Macular degeneration',
  'Lác / nhược thị': 'Strabismus / amblyopia',

  // red-flag panel
  'Loại trừ với lý do →': 'Exclude with reason →',
  'Loại trừ': 'Exclude',
  'Huỷ': 'Cancel',
  '— đã loại trừ:': '— excluded:',
  '(không có lý do)': '(no reason)',

  // urgency
  'CẤP CỨU': 'EMERGENCY', 'KHẨN — chuyển': 'URGENT — refer', 'Khẩn': 'Urgent', 'Thường': 'Routine',

  // next-tests panel
  '🎯 Bước tiếp theo': '🎯 Next step',
  'Nhập kết quả → danh sách chẩn đoán cập nhật tự động': 'Enter results → the differential updates automatically',
  'Đã có đủ thông tin — không cần thêm xét nghiệm. Chuyển sang xác nhận chẩn đoán.':
    'Enough information — no further tests needed. Proceed to confirm the diagnosis.',
  '⭐ Ưu tiên': '⭐ Priority',
  '💾 Nhập KQ': '💾 Enter result',
  '💾 Lưu kết quả': '💾 Save result',
  'Dấu hiệu quan sát:': 'Observed signs:',
  '✨ Phân tích KQ bằng AI': '✨ Parse result with AI',
  '⏳ Đang phân tích KQ...': '⏳ Parsing result…',
  'Mô tả kết quả khám (tự do)...': 'Describe the result (free text)…',
  'AI gợi ý — bấm để thêm dấu hiệu:': 'AI suggestions — click to add:',
  'Thêm tất cả': 'Add all',
  'Cần chỉ định / chuyển (ngoài phòng khám)': 'Order / refer (external)',
  '↗ chuyển': '↗ refer',
  'Lưu dấu hiệu': 'Save sign',
  'Đã ghi nhận': 'Recorded',
  '↳ tự suy ra': '↳ derived',

  // differential panel
  'Chẩn đoán phân biệt': 'Differential diagnosis',
  'Chưa có ứng cử viên — cần thêm triệu chứng hoặc dữ liệu khám.':
    'No candidates yet — add symptoms or exam data.',
  'Vì sao?': 'Why?',
  'Xác nhận': 'Confirm',
  '✓ Đã xác nhận': '✓ Confirmed',
  'Tóm tắt:': 'Summary:',
  'Bằng chứng:': 'Evidence:',
  'Mức độ khẩn:': 'Urgency:',
  '✨ Giải thích bằng AI': '✨ Explain with AI',
  '⏳ Đang giải thích...': '⏳ Explaining…',
  'Lý do xếp hạng:': 'Why this rank:',
  'Ủng hộ:': 'Supports:',
  'Phản đối / lưu ý:': 'Against / caveats:',
  'Bước xác nhận:': 'To confirm:',
  'Trình giải thích AI chưa được cấu hình.': 'AI explanation is not configured.',

  // outcome / treatment panel
  'Kết luận & điều trị': 'Conclusion & treatment',
  '✓ Chẩn đoán xác nhận:': '✓ Confirmed diagnosis:',
  'Đề xuất điều trị': 'Suggested treatments',
  '— chọn nhóm phù hợp; bác sĩ kê đơn cụ thể': '— select the relevant options; the clinician prescribes specifics',
  'Điều trị đã chọn:': 'Selected treatments:',
  'Đã đóng phiên lúc': 'Closed at',
  'Ghi chú': 'Notes',
  'Ghi chú lâm sàng, kế hoạch theo dõi...': 'Clinical notes, follow-up plan…',
  'Chuyển khám chuyên khoa': 'Refer to a specialist',
  'Lý do chuyển': 'Referral reason',
  'Lưu vào hồ sơ & đóng phiên': 'Save to record & close',
  '⏳ Đang lưu...': '⏳ Saving…',
  "Lý do loại trừ (vd: 'gonioscopy: góc mở')": "Exclusion reason (e.g. 'gonioscopy: open angle')",

  // treatment categories
  'Kính gọng': 'Spectacles', 'Kính tiếp xúc': 'Contact lenses', 'Quang học khác': 'Other optical',
  'Thuốc': 'Medication', 'Thủ thuật': 'Procedure', 'Laser': 'Laser', 'Tiêm': 'Injection',
  'Phẫu thuật': 'Surgery', 'Toàn thân / bệnh nền': 'Systemic', 'Chuyển khám / hội chẩn': 'Referral / consult',
  'Chăm sóc & lối sống': 'Care & lifestyle', 'Theo dõi': 'Monitoring', 'Hỗ trợ': 'Supportive',
}
