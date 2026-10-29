import { Response } from '../../database/schemas.js';
import { resolveLabels } from './labels.js';

/**
 * Load the Response document for an assignment and rekey it from the
 * positional `qN` keys onto the questionnaire's semantic `question.id`s.
 *
 * Returns BOTH shapes so adapters can pick whichever they need:
 *   - byPosition:    { q1: <value>, q2: <value>, ... }    (matches rule-engine evaluator expectations)
 *   - bySemanticId:  { name: <value>, dob: <value>, ... } (clean for special adapters)
 *
 * Also returns the questionnaire.questions list so adapters can read
 * `question.text.en` for AI-facing labels.
 */
export async function loadResponsesForAssignment(assignment, questionnaire) {
	const responseDoc = await Response.findOne({ assignmentId: assignment._id }).lean();
	const rawResponses = responseDoc?.responses ?? [];

	const byPosition = {};
	for (const r of rawResponses) {
		byPosition[r.questionId] = r.value;
	}

	// Only the semantic map is label-resolved: it feeds the AI-facing adapters,
	// where an i18n key like 'Questionnaire.Config.AdultBio.reasons_for_cct.options.4'
	// is worthless. `byPosition` is left untouched because the rule engine matches
	// stored answer values literally.
	const bySemanticId = {};
	for (let i = 0; i < questionnaire.questions.length; i++) {
		const q = questionnaire.questions[i];
		const positionalKey = `q${i + 1}`;
		if (positionalKey in byPosition) {
			bySemanticId[q.id] = resolveLabels(byPosition[positionalKey]);
		}
	}

	return { byPosition, bySemanticId, rawResponses, questionnaire };
}

/**
 * Coerce a response value to a plain primitive for arithmetic.
 *
 * Patients answer some questions as `{ value: "3", text: "Quite a bit" }`
 * objects, others as bare strings ("3") or numbers. This collapses to a
 * number when the underlying value parses as one, otherwise returns the
 * primitive untouched.
 */
export function unwrapScalar(v) {
	if (v == null) return null;
	if (typeof v === 'object' && 'value' in v) return unwrapScalar(v.value);
	if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
	if (typeof v === 'string') return v;
	return v;
}
