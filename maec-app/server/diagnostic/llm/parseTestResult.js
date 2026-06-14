// Parse a clinician's free-text test-result description into the finding tags
// that test can produce. Mirrors parseComplaint.js: Claude Sonnet, JSON-schema
// constrained, vocab limited to THIS test's producesFindings, unknown tags
// dropped, graceful 503 if ANTHROPIC_API_KEY is unset.
//
// Use for high-dimensional qualitative tests (slit-lamp, fundus, OCT) where a
// fixed chip set is lossy. The clinician reviews/edits the suggested findings
// before they become observations — the parser never writes anything itself.

const Anthropic = require('@anthropic-ai/sdk').default
const { buildTestVocab } = require('./kbTestVocab')

const MODEL_ID = 'claude-sonnet-4-6'

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          findingId: { type: 'string', description: 'a finding tag ID from the vocabulary below (left of " — ")' },
          eye: { type: 'string', enum: ['OD', 'OS', 'OU', 'unknown'], description: 'which eye the finding is in, if stated' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['findingId', 'eye', 'confidence'],
      },
      description: 'Findings the prose directly supports. Empty if none. Do NOT infer findings the text does not state.',
    },
    explanationVi: { type: 'string', description: 'One short Vietnamese sentence on what was extracted / left out, for the clinician to verify.' },
  },
  required: ['findings', 'explanationVi'],
}

function buildSystemPrompt(testNameVi, vocab) {
  return `Bạn là trợ lý phân tích kết quả khám/cận lâm sàng tại phòng khám mắt MAEC. Bác sĩ vừa thực hiện "${testNameVi}" và ghi mô tả tự do bằng tiếng Việt. Nhiệm vụ: ánh xạ mô tả đó thành các dấu hiệu (finding) chuẩn mà xét nghiệm này có thể tạo ra.

Quy tắc chặt chẽ:
1) **Không suy diễn.** Chỉ chọn dấu hiệu có bằng chứng rõ trong văn bản. Nếu mô tả là bình thường / không có gì → trả về danh sách rỗng.
2) **Chỉ dùng đúng tag ID** trong danh sách dưới (vế trái dấu " — "). KHÔNG bịa tag ngoài danh sách.
3) Ghi rõ mắt (OD/OS/OU) nếu văn bản nêu; nếu không rõ để 'unknown'.
4) Mỗi dấu hiệu kèm độ tin cậy (confidence) high/medium/low.
5) explanationVi: một câu tiếng Việt ngắn nêu rõ đã trích gì và bỏ gì để bác sĩ kiểm tra.
6) Trả về JSON đúng schema.

Danh sách dấu hiệu hợp lệ cho "${testNameVi}":
${vocab}`
}

let _client = null
function getClient() {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  _client = new Anthropic({ apiKey })
  return _client
}

async function parseTestResult(testId, text) {
  if (!testId) { const e = new Error('testId is required'); e.code = 'INVALID_INPUT'; e.status = 400; throw e }
  if (!text || typeof text !== 'string' || !text.trim()) {
    const e = new Error('text is required'); e.code = 'INVALID_INPUT'; e.status = 400; throw e
  }
  const v = buildTestVocab(testId)
  if (!v) { const e = new Error(`test ${testId} has no parseable findings`); e.code = 'NO_VOCAB'; e.status = 400; throw e }

  const client = getClient()
  if (!client) {
    const e = new Error('LLM parser disabled — ANTHROPIC_API_KEY is not configured on the server.')
    e.code = 'LLM_NOT_CONFIGURED'; e.status = 503; throw e
  }

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: [{ type: 'text', text: buildSystemPrompt(v.test.nameVi || v.test.name, v.vocab), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Mô tả kết quả:\n${text.trim()}\n\nHãy trích xuất theo schema.` }],
    output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
  })

  let raw = null
  for (const block of response.content || []) {
    if (block.type === 'text' && block.text) raw = (raw || '') + block.text
  }
  if (!raw) { const e = new Error('LLM returned no parseable text content.'); e.code = 'LLM_EMPTY_RESPONSE'; e.status = 502; throw e }

  let parsed
  try { parsed = JSON.parse(raw) } catch (err) {
    const e = new Error('LLM response was not valid JSON: ' + raw.slice(0, 200)); e.code = 'LLM_BAD_JSON'; e.status = 502; throw e
  }

  // Drop any finding outside this test's vocabulary (no hallucinated tags).
  const all = parsed.findings || []
  const valid = all.filter(f => v.validTagSet.has(f.findingId))
  const dropped = all.filter(f => !v.validTagSet.has(f.findingId)).map(f => f.findingId)

  return {
    testId,
    findings: valid.map(f => ({ findingId: f.findingId, eye: f.eye && f.eye !== 'unknown' ? f.eye : null, confidence: f.confidence || 'low' })),
    droppedUnknownTags: dropped,
    explanationVi: parsed.explanationVi || '',
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cacheReadInputTokens: response.usage?.cache_read_input_tokens,
    },
    model: response.model,
  }
}

module.exports = { parseTestResult, MODEL_ID }
