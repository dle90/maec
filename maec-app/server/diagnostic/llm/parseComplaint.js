// Parse Vietnamese complaint prose into the structured complaint shape used by
// the diagnostic engine.
//
// Architecture notes:
// - Uses Claude Sonnet 4.6 (`claude-sonnet-4-6`). Sonnet is the right tier for
//   structured extraction: cheaper and faster than Opus, and the task does not
//   need deep reasoning. Per the claude-api skill, Opus is for hard reasoning;
//   Sonnet is for "balanced" workloads, which this is.
// - JSON Schema constrained via output_config.format so the model is forced to
//   return a structured object. No post-hoc regex parsing.
// - System prompt carries the KB vocabulary and is cached with
//   `cache_control: {type: 'ephemeral'}`. Subsequent parses pay ~$0.001-0.003
//   instead of ~$0.01-0.02 (KB vocab is ~3-5K input tokens).
// - No `thinking` field — the default is thinking off, which is correct here.
//   Parsing prose is not reasoning-intensive.
// - Graceful degradation: if ANTHROPIC_API_KEY is unset, the caller sees a
//   503 with a clear message; the rest of the diagnostic service keeps working.

const Anthropic = require('@anthropic-ai/sdk').default
const { buildVocab } = require('./kbVocab')

const MODEL_ID = 'claude-sonnet-4-6'

const COMPLAINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symptoms: {
      type: 'array',
      items: { type: 'string' },
      description: 'Symptom / context / qualifier tag IDs from the vocabulary below. Use the exact tag ID (left side of " — "), not the Vietnamese name or alias. Include only tags the prose actually supports — do not infer.',
    },
    onset: {
      type: 'string',
      enum: ['sudden', 'subacute', 'gradual', 'unknown'],
      description: 'sudden = minutes/hours, subacute = hours-days, gradual = weeks-months. Use unknown if prose does not say.',
    },
    pain: {
      type: 'string',
      enum: ['none', 'mild', 'moderate', 'severe', 'unknown'],
    },
    redness: {
      type: 'string',
      enum: ['none', 'mild', 'moderate', 'severe', 'unknown'],
    },
    visionChange: {
      type: 'string',
      enum: ['none', 'mild', 'severe', 'lost', 'unknown'],
    },
    eyeAffected: {
      type: 'string',
      enum: ['OD', 'OS', 'OU', 'unknown'],
      description: 'OD = right eye, OS = left eye, OU = both eyes.',
    },
    patientContext: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ageYears: { type: ['number', 'null'] },
        sex: { type: 'string', enum: ['M', 'F', 'unknown'] },
        isContactLensWearer: { type: ['boolean', 'null'] },
        recentTrauma: { type: ['boolean', 'null'] },
        recentIntraocularSurgeryOrInjection: { type: ['boolean', 'null'] },
      },
      required: ['ageYears', 'sex', 'isContactLensWearer', 'recentTrauma', 'recentIntraocularSurgeryOrInjection'],
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident is the parser in this extraction overall.',
    },
    explanationVi: {
      type: 'string',
      description: 'One sentence in Vietnamese explaining what was inferred and what was left as unknown. For the clinician to review.',
    },
  },
  required: ['symptoms', 'onset', 'pain', 'redness', 'visionChange', 'eyeAffected', 'patientContext', 'confidence', 'explanationVi'],
}

const SYSTEM_INSTRUCTIONS = `Bạn là trợ lý phân tích lời than phiền của bệnh nhân tại phòng khám mắt MAEC. Nhiệm vụ: chuyển đoạn văn tiếng Việt do bác sĩ ghi thành cấu trúc dữ liệu chuẩn để hệ thống chẩn đoán xử lý.

Quy tắc chặt chẽ:
1) **Không suy diễn.** Chỉ chọn các tag có bằng chứng rõ trong văn bản. Nếu không chắc → để 'unknown' / null. Việc bỏ sót còn an toàn hơn việc gán sai.
2) **Sử dụng đúng tag ID** trong danh sách dưới (vế bên trái dấu " — "). KHÔNG dùng tên tiếng Việt hoặc alias làm symptoms.
3) Các trường tiền sử (CL wearer, recent trauma, recent IOL/injection) chỉ điền true/false khi văn bản nêu rõ; còn lại để null.
4) Tuổi: chỉ điền nếu văn bản nói rõ tuổi cụ thể.
5) Trường explanationVi viết bằng tiếng Việt, súc tích, nêu rõ những gì đã suy luận và những gì để 'unknown' để bác sĩ kiểm tra lại.
6) Mức độ đau / đỏ / thị lực chỉ điền khi văn bản mô tả, không tự gán dựa trên triệu chứng khác.
7) **MỜ MẮT chung chung → dùng tag CHUNG, KHÔNG tự chi tiết hoá.** Nếu chỉ nói "mờ / nhìn không rõ / kém" mà KHÔNG nêu rõ kiểu, hãy dùng vision_blur_gradual (mờ tăng dần) hoặc vision_drop (giảm thị lực) — KHÔNG được suy ra các tag chuyên biệt như central_scotoma, near_only_blur, distance_only_blur, metamorphopsia, micropsia, night_glare_no_blur. CHỈ dùng các tag chuyên biệt khi văn bản mô tả ĐÚNG kiểu đó: central_scotoma = "mất/tối vùng giữa"; near_only_blur = "mờ khi đọc gần, xa rõ"; distance_only_blur = "mờ khi nhìn xa, gần rõ"; metamorphopsia = "đường thẳng bị cong/méo, sóng lượn"; micropsia = "vật nhìn nhỏ lại".
8) **ONSET (diễn tiến)** theo mốc thời gian trong văn bản: "đột ngột / bỗng nhiên / ngay lập tức / vừa xảy ra trong vài phút-giờ" → sudden; "vài giờ đến vài ngày / mấy ngày nay tăng dần" → subacute; "từ từ / vài tuần-tháng-năm / lâu nay / ngày càng" → gradual. Nếu có nêu khoảng thời gian mạn tính (tháng/năm) thì chọn gradual, đừng để 'unknown'.
9) Trả về JSON đúng schema, không thêm trường khác.

Bảng tag (symptom + context + qualifier):
{{VOCAB}}`

function buildSystemPrompt() {
  const { vocab } = buildVocab()
  return SYSTEM_INSTRUCTIONS.replace('{{VOCAB}}', vocab)
}

let _client = null
function getClient() {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  _client = new Anthropic({ apiKey })
  return _client
}

async function parseComplaint(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    const err = new Error('text is required')
    err.code = 'INVALID_INPUT'
    err.status = 400
    throw err
  }

  const client = getClient()
  if (!client) {
    const err = new Error('LLM parser disabled — ANTHROPIC_API_KEY is not configured on the server.')
    err.code = 'LLM_NOT_CONFIGURED'
    err.status = 503
    throw err
  }

  const systemPrompt = buildSystemPrompt()

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Lời than phiền:\n${text.trim()}\n\nHãy trích xuất theo schema.`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: COMPLAINT_SCHEMA,
      },
    },
  })

  let raw = null
  for (const block of response.content || []) {
    if (block.type === 'text' && block.text) {
      raw = (raw || '') + block.text
    }
  }
  if (!raw) {
    const err = new Error('LLM returned no parseable text content.')
    err.code = 'LLM_EMPTY_RESPONSE'
    err.status = 502
    throw err
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    const err = new Error('LLM response was not valid JSON: ' + raw.slice(0, 200))
    err.code = 'LLM_BAD_JSON'
    err.status = 502
    throw err
  }

  const { validTagSet } = buildVocab()
  const unknownTags = (parsed.symptoms || []).filter(t => !validTagSet.has(t))
  const cleanSymptoms = (parsed.symptoms || []).filter(t => validTagSet.has(t))

  return {
    complaint: {
      text: text.trim(),
      symptoms: cleanSymptoms,
      onset: parsed.onset || 'unknown',
      pain: parsed.pain || 'unknown',
      redness: parsed.redness || 'unknown',
      visionChange: parsed.visionChange || 'unknown',
      eyeAffected: parsed.eyeAffected || 'unknown',
      patientContext: parsed.patientContext || {},
    },
    confidence: parsed.confidence || 'low',
    explanationVi: parsed.explanationVi || '',
    droppedUnknownTags: unknownTags,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cacheReadInputTokens: response.usage?.cache_read_input_tokens,
      cacheCreationInputTokens: response.usage?.cache_creation_input_tokens,
    },
    model: response.model,
  }
}

module.exports = { parseComplaint, MODEL_ID }
