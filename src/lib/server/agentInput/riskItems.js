// ⚠️  UNUSED SINCE 2026-08-24 — DO NOT RE-WIRE WITHOUT FIXING endorsedValue().
//
// buildAgentInput() no longer calls this. The agent receives each interview's
// full standard report and nothing else; there are no endorsement flags in the
// payload. This file is kept only because `buildRuleEngineEntry` still imports
// it and the tests still cover the roll-up.
//
// endorsedValue() BELOW IS WRONG. It tests `value > 0`, but 9 of the 10
// suicide_interview risk items are 1-based — `1 = No`, `1 = Never`,
// `1 = Not at all`. Every denial therefore scored as an endorsement. Verified
// against production on 2026-08-24: patients 11294, 11501, 11508 and 11509 each
// answered "No" to all four self-harm items and each received a report
// asserting active self-injury with strong current urges and a history
// requiring medical attention.
//
// Anything reviving this must derive endorsement from each question's own scale
// — note q26 is REVERSE-coded (`1 = Everyday` is the most severe answer), so a
// blanket `> 1` would turn the worst case into a false negative.
//
// Risk-relevant question ids per interview, surfaced into §6 Risk Assessment.
//
// Why this list matters beyond grounding: when the dedicated suicide module was
// NOT administered, the V2.18 standard makes §6 print a fixed line reading
// "failure to endorse past attempts or self-harm when the opportunity for
// disclosure was provided". That line is a statement of FACT about the patient.
// Until 2026-08-04 the only module in this table was depression_test, so a
// patient who endorsed "repeated suicide attempts" and "cutting or burning
// yourself" on the borderline module still got a report asserting they had
// endorsed neither. Any module carrying an attempt or self-harm item must be
// listed here, and buildRiskSummary() must see it, or the report lies.
//
// Question ids verified against the live `questionnaires` collection.

/**
 * @typedef {{
 *   question_id: string,
 *   kind: 'suicidal_ideation'|'suicide_attempt'|'self_harm',
 *   timeframe: 'current'|'lifetime'
 * }} RiskItemSpec
 *
 * `timeframe` is read from the question's own wording, not inferred: 'current'
 * only where the item explicitly scopes to now or the past two weeks. It is what
 * lets §3 and §6 be stopped from calling risk low while a present-tense item is
 * endorsed.
 */

/** @type {Record<string, RiskItemSpec[]>} */
export const RISK_ITEMS_BY_TEST_CODE = {
	// The dedicated instrument. It used to be absent from this table entirely —
	// the table existed only for the case where this module was NOT administered.
	// So when it WAS administered its items reached the model as a raw rule-engine
	// dump and the model read them item by item. On patient 6a5103bf (report
	// 8d65d909, 2026-08-04) it inverted q29: the patient answered YES to "right
	// now, are you having strong urges to self-harm", and §6 printed "she did not
	// endorse current strong urges to self-harm", which §3 then summarised as
	// "risk is assessed as low". They now arrive as explicit endorsed flags.
	suicide_interview: [
		{ question_id: 'q2', kind: 'suicidal_ideation', timeframe: 'lifetime' },
		{ question_id: 'q13', kind: 'suicide_attempt', timeframe: 'lifetime' },
		{ question_id: 'q14', kind: 'suicide_attempt', timeframe: 'lifetime' },
		{ question_id: 'q15', kind: 'suicide_attempt', timeframe: 'lifetime' },
		{ question_id: 'q24', kind: 'self_harm', timeframe: 'lifetime' },
		{ question_id: 'q25', kind: 'self_harm', timeframe: 'current' },
		{ question_id: 'q26', kind: 'self_harm', timeframe: 'current' },
		{ question_id: 'q27', kind: 'self_harm', timeframe: 'lifetime' },
		{ question_id: 'q28', kind: 'self_harm', timeframe: 'current' },
		{ question_id: 'q29', kind: 'self_harm', timeframe: 'current' }
	],
	depression_test: [{ question_id: 'q11', kind: 'suicidal_ideation', timeframe: 'current' }],
	borderline_personality_test: [
		{ question_id: 'q11', kind: 'suicide_attempt', timeframe: 'lifetime' },
		{ question_id: 'q12', kind: 'suicidal_ideation', timeframe: 'lifetime' },
		{ question_id: 'q13', kind: 'self_harm', timeframe: 'current' }
	]
	// Deliberately NOT included: panic_test q14 ("Fear of dying?") is a panic
	// symptom, not suicidality; adult_adhd_test q5 only matches on the word
	// "order"; and suicide_interview q16 is the emergency-services instruction
	// shown to the patient, not an item they answer about themselves. Adding any
	// of them would suppress the §6 limitation line for the wrong reason.
};

/** Human-readable label per risk-item kind, for the agent-facing payload. */
const KIND_LABEL = {
	suicidal_ideation: 'suicidal ideation',
	suicide_attempt: 'past suicide attempt',
	self_harm: 'non-suicidal self-injury'
};

function endorsedValue(value) {
	if (typeof value === 'number') return value > 0;
	if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
		return Number(value) > 0;
	}
	return false;
}

/**
 * Build the `risk_relevant_items` entry for one interview, or null when the
 * interview carries no risk item.
 */
export function buildRiskRelevantItems({
	testCode,
	questionnaire,
	normalizedResponses,
	moduleCoverage
}) {
	const specs = RISK_ITEMS_BY_TEST_CODE[testCode];
	if (!specs?.length) return null;

	const suicideModuleNotAdministered =
		moduleCoverage?.not_administered?.includes('comprehensive_suicide_self_harm') ?? false;

	const items = specs.map((spec) => {
		const value = normalizedResponses[spec.question_id];
		const positionalIndex = parseInt(spec.question_id.slice(1), 10) - 1;
		return {
			kind: spec.kind,
			kind_label: KIND_LABEL[spec.kind],
			timeframe: spec.timeframe,
			endorsed: endorsedValue(value),
			question_id: spec.question_id,
			question_text: questionnaire.questions?.[positionalIndex]?.text?.en ?? null,
			raw_value: value ?? null
		};
	});

	const out = { items };

	// Back-compat: the agent's case-context brief and §6 prompt were written
	// against this single-item shape.
	const ideation = items.find((i) => i.kind === 'suicidal_ideation');
	if (ideation) {
		out.suicidal_ideation_item = {
			endorsed: ideation.endorsed,
			question_id: ideation.question_id,
			question_text: ideation.question_text,
			raw_value: ideation.raw_value,
			...(suicideModuleNotAdministered && {
				limitations:
					'The Comprehensive Suicide and Self-Harm Assessment Module was not administered.'
			})
		};
	}

	return out;
}

/**
 * Roll every interview's risk items up into one top-level block.
 *
 * Two separate gates, because they answer different questions:
 *
 *   any_endorsed      anything at all, over any timeframe. Gates §6's fixed
 *                     "failure to endorse past attempts or self-harm" line,
 *                     which may only be printed when nothing was endorsed.
 *   current_endorsed  a present-tense item — "right now", "in the past 2
 *                     weeks". Gates any statement that current risk is low or
 *                     absent. A report may truthfully say lifetime attempts were
 *                     denied while a current self-harm urge is endorsed; it may
 *                     never say risk is low while one is.
 */
export function buildRiskSummary(interviews) {
	const endorsed = [];
	for (const [interviewKey, entry] of Object.entries(interviews ?? {})) {
		for (const item of entry?.risk_relevant_items?.items ?? []) {
			if (item.endorsed) {
				endorsed.push({
					interview_key: interviewKey,
					kind: item.kind,
					kind_label: item.kind_label,
					timeframe: item.timeframe ?? 'lifetime',
					question_text: item.question_text
				});
			}
		}
	}

	const current = endorsed.filter((e) => e.timeframe === 'current');

	return {
		any_endorsed: endorsed.length > 0,
		current_endorsed: current.length > 0,
		endorsed_items: endorsed,
		current_endorsed_items: current,
		endorsing_modules: [...new Set(endorsed.map((e) => e.interview_key))]
	};
}
