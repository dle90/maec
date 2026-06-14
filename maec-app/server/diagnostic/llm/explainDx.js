// Explain WHY a candidate diagnosis is in the differential — grounded in the
// engine's own evidence (matched findings + weights, refuting findings, prevalence
// /age fit, not-yet-observed findings). On-demand per disease; mirrors the other
// LLM helpers (Claude Sonnet, JSON-schema output, graceful 503 if no key).
//
// This is EXPLANATION, not diagnosis — the reasoning narrates the engine's
// existing ranking so the clinician understands it; the clinician still decides.

const Anthropic = require('@anthropic-ai/sdk').default

const MODEL_ID = 'claude-sonnet-4-6'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rankingReason: { type: 'string', description: 'One or two sentences: why this diagnosis appears at this rank for THIS patient, grounded in the evidence given.' },
    supports: { type: 'array', items: { type: 'string' }, description: 'Short bullet factors arguing FOR it (from the evidence given).' },
    against: { type: 'array', items: { type: 'string' }, description: 'Short bullet factors arguing AGAINST / caveats (or empty).' },
    nextStep: { type: 'string', description: 'The single most useful test or finding that would confirm or exclude it.' },
  },
  required: ['rankingReason', 'supports', 'against', 'nextStep'],
}

let _client = null
function getClient() {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  _client = new Anthropic({ apiKey })
  return _client
}

// context: { lang, patient:{ageYears,sex,context[]}, complaintSymptoms:[], observations:[],
//   candidate:{nameVi,name,summary,prevalenceTag,urgency,score,rank},
//   supporting:[{finding,evoking,frequency,present}], refuting:[{finding,evoking}],
//   notYetObserved:[finding] }
async function explainDx(context) {
  const client = getClient()
  if (!client) {
    const e = new Error('LLM disabled — ANTHROPIC_API_KEY is not configured on the server.')
    e.code = 'LLM_NOT_CONFIGURED'; e.status = 503; throw e
  }
  const langName = context.lang === 'en' ? 'English' : 'Vietnamese (tiếng Việt)'
  const system = `You are an ophthalmology attending explaining to a colleague WHY a candidate diagnosis appears in a patient's differential. The differential was produced by a deterministic decision-support engine; your job is to narrate its reasoning clearly so the clinician understands it.

Strict rules:
1) Ground EVERYTHING in the evidence provided below — do NOT invent symptoms, findings, or facts not given.
2) Be concise and clinical. No preamble, no disclaimers.
3) Write entirely in ${langName}.
4) "supports" = factors in the evidence arguing for this diagnosis; "against" = caveats or missing/低-weight evidence (may be empty); "nextStep" = the single most useful test/finding to confirm or exclude.
5) Return JSON matching the schema only.`

  const user = `Bệnh nhân / Patient: age ${context.patient.ageYears ?? '?'}, sex ${context.patient.sex || '?'}${context.patient.context?.length ? ', context: ' + context.patient.context.join(', ') : ''}
Complaint symptoms: ${context.complaintSymptoms.join(', ') || '(none)'}
Exam observations entered: ${context.observations.join(', ') || '(none)'}

Candidate diagnosis: ${context.candidate.nameVi} (${context.candidate.name || ''}) — rank #${context.candidate.rank}, engine score ${context.candidate.score}, prevalence ${context.candidate.prevalenceTag || '?'}, urgency ${context.candidate.urgency}.
Disease summary: ${context.candidate.summary || '(none)'}

Evidence the engine matched FOR it (finding — evoking×freq, present?): ${context.supporting.map(s => `${s.finding} (${s.evoking}×${s.frequency}, ${s.present ? 'present' : 'absent'})`).join('; ') || '(none)'}
Refuting evidence present: ${context.refuting.map(r => `${r.finding} (${r.evoking})`).join('; ') || '(none)'}
Classic findings of this disease NOT yet observed: ${context.notYetObserved.join(', ') || '(none)'}

Explain why it sits at rank #${context.candidate.rank} for this patient.`

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })
  let raw = null
  for (const block of response.content || []) if (block.type === 'text' && block.text) raw = (raw || '') + block.text
  if (!raw) { const e = new Error('LLM returned no text'); e.code = 'LLM_EMPTY_RESPONSE'; e.status = 502; throw e }
  let parsed
  try { parsed = JSON.parse(raw) } catch { const e = new Error('LLM bad JSON: ' + raw.slice(0, 160)); e.code = 'LLM_BAD_JSON'; e.status = 502; throw e }
  return {
    rankingReason: parsed.rankingReason || '',
    supports: parsed.supports || [],
    against: parsed.against || [],
    nextStep: parsed.nextStep || '',
    model: response.model,
  }
}

module.exports = { explainDx, MODEL_ID }
