import { ReportLogic } from '../../database/reportLogicSchemas.js';
import { Assignment, Response } from '../../database/schemas.js';
import { evaluateTestExpressions } from '../../utils/reportLogicTransformer/utils/helpers.js';
import { normalizeRuleEngineResponses } from '../../utils/reportResponses.js';
import { stripDiagnosticCodes } from '../../utils/diagnosticCodes.js';
import { buildRiskRelevantItems } from './riskItems.js';
import { firedOutcomeOf, resolveFiredOutcome, patientInfoForRender } from './standardReport.js';

const COMPLETED = new Set(['completed', 'downloaded']);

// Severity values that some report-logic JSONs assign to threshold-mapped
// variables. Used as a heuristic to surface a numeric severity into the
// agent payload without knowing each test's variable conventions.
const SEVERITY_TOKENS = new Set([
	'Mild',
	'Moderate',
	'Moderately-Severe',
	'Moderately Severe',
	'Severe',
	'Extreme'
]);

// Every completed interview now reaches the agent, so a payload can carry forty
// entries where it used to carry fifteen. These caps keep that growth in the
// noise: a supported diagnosis still gets everything Section 7 needs to write a
// rationale, while a ruled-out one contributes its one-line verdict and stops.
const SYMPTOM_CAP = { supported: 15, subthreshold: 8, not_supported: 0 };
const SUMMARY_CHAR_CAP = { supported: 900, subthreshold: 700, not_supported: 420 };

/**
 * For tests whose report logic references questions in another test
 * (`{type: 'question', test_code: 'manic_test', value: 'q13'}`), the
 * evaluator looks them up under `context._otherTestResponses[testCode]`.
 * We pre-load every administered test's responses once per patient.
 */
async function loadAllResponsesByTestCode(patientId) {
	const assignments = await Assignment.find({
		patientId,
		status: { $in: [...COMPLETED] }
	})
		.populate('questionnaireId')
		.lean();

	const byTestCode = {};
	for (const a of assignments) {
		const testCode = a.questionnaireId?.test_code;
		if (!testCode) continue;
		const r = await Response.findOne({ assignmentId: a._id }).lean();
		byTestCode[testCode] = normalizeRuleEngineResponses(r?.responses, testCode);
	}
	return byTestCode;
}

// Severity comes in two shapes across the test logics:
//   - a numeric `Severity` variable averaging item scores on a 0-3 scale
//     (most tests: GAD, panic, OCD, manic, …)
//   - a token string like "Mild" / "Moderate" computed via thresholds
//     (rare; included for compat)
// We try token first, then fall back to numeric thresholding.
function severityFromNumber(n) {
	if (typeof n !== 'number' || Number.isNaN(n)) return null;
	if (n < 1) return 'Minimal';
	if (n < 2) return 'Mild';
	if (n < 3) return 'Moderate';
	return 'Severe';
}

function extractSeverity(variables) {
	if (!variables) return null;

	// Token-shape match anywhere in the variables.
	for (const value of Object.values(variables)) {
		if (typeof value === 'string' && SEVERITY_TOKENS.has(value)) return value;
	}

	// Numeric-shape match on a variable named (case-insensitively) "Severity".
	for (const [key, value] of Object.entries(variables)) {
		if (key.toLowerCase() === 'severity' && typeof value === 'number') {
			return severityFromNumber(value);
		}
	}

	return null;
}

/**
 * Pull positive scale answers out of the responses + questionnaire and
 * present them as a list of human-readable symptom phrases. Skips any
 * question whose input_type indicates it isn't a clinical scale item
 * (header text, demographics, free-text reflection, etc.).
 */
function extractPositiveSymptoms(questionnaire, normalizedResponses, cap) {
	if (cap === 0) return [];
	const symptoms = [];
	for (let i = 0; i < questionnaire.questions.length; i++) {
		const q = questionnaire.questions[i];
		const positionalKey = `q${i + 1}`;
		if (q.answer_type !== 'scale' && q.answer_type !== 'boolean') continue;
		const v = normalizedResponses[positionalKey];
		if (typeof v !== 'number' || v <= 0) continue;
		const text = q.text?.en;
		if (text) symptoms.push(text);
		if (symptoms.length >= cap) break;
	}
	return symptoms;
}

/**
 * Generic rule-engine converter — emits an agent_input.v1 interview
 * entry for any test whose ReportLogic is stored in Mongo.
 *
 * The verdict, the disorder name and the DSM/ICD codes all come from the
 * outcome the engine actually fired (see standardReport.js), so the AI report
 * agrees with the algorithmic report on the same patient. `standard_report`
 * carries that report's own Brief Summary statement, which is what lets a
 * ruled-out interview contribute its REASON to Section 7 in one line instead of
 * a paragraph of raw criteria.
 *
 * Diagnostic status rules:
 *   - 'supported'      → the fired branch asserts the diagnosis
 *   - 'subthreshold'   → the branch rules it out but at least one criterion fired
 *   - 'not_supported'  → ruled out with nothing met, or the substance was never used
 */
export async function buildRuleEngineEntry({
	assignment,
	questionnaire,
	patient,
	otherTestResponses,
	moduleCoverage
}) {
	const reportLogic = await ReportLogic.findOne({
		questionnaire: questionnaire._id
	}).lean();

	if (!reportLogic) {
		return {
			interview_name: questionnaire.title?.en ?? questionnaire.test_code,
			administered: true,
			_error: `No ReportLogic in Mongo for questionnaire ${questionnaire._id}`
		};
	}

	const responseDoc = await Response.findOne({ assignmentId: assignment._id }).lean();
	const normalized = normalizeRuleEngineResponses(responseDoc?.responses, questionnaire.test_code);

	const evalResult = evaluateTestExpressions(reportLogic.test_evaluation, {
		_responses: normalized,
		_otherTestResponses: otherTestResponses
	});

	if (!evalResult) {
		return {
			interview_name: questionnaire.title?.en ?? questionnaire.test_code,
			administered: true,
			_error: 'evaluator returned null'
		};
	}

	const fired = firedOutcomeOf(evalResult);
	const anyCriterionFired = Object.values(evalResult.criteria ?? {}).some((v) => v === 1);
	const severity = extractSeverity(evalResult.variables);
	const severityScore =
		typeof evalResult.variables?.Severity === 'number'
			? Number(evalResult.variables.Severity.toFixed(2))
			: null;

	// The standard report substitutes {first_name} / {pronouns.*} and any
	// evaluated variable or raw response into its prose, exactly as the PDF
	// generator does.
	const resolved = resolveFiredOutcome({
		testCode: questionnaire.test_code,
		fired,
		anyCriterionFired,
		patientInfo: patientInfoForRender(patient),
		variables: { ...normalized, ...(evalResult.variables ?? {}) },
		maxSummaryChars: 1200
	});

	const entry = {
		interview_name: questionnaire.title?.en ?? questionnaire.test_code,
		administered: true
	};

	// Two cases carry no diagnostic verdict and must not fabricate one:
	//   'none'         the instrument makes no diagnostic claim at all (the
	//                  Stressful Beliefs Index, the suicide module)
	//   'inconclusive' the answers fell through every outcome branch, so the
	//                  algorithmic report prints nothing for this interview
	// Either way the interview still counts as administered and still appears in
	// the completed-interviews list; it simply contributes no diagnosis.
	if (resolved.polarity === 'inconclusive') {
		entry.inconclusive = true;
	} else if (resolved.polarity !== 'none') {
		const status = resolved.diagnostic_status;
		entry.diagnostic_output = {
			diagnostic_status: status,
			diagnosis_name: resolved.diagnosis_name,
			outcome_label: resolved.outcome_label,
			dsm_code: resolved.dsm_code,
			icd_10_code: resolved.icd_10_code,
			icd_11_code: resolved.icd_11_code,
			average_symptom_severity: severity,
			severity_score: severityScore,
			symptoms: extractPositiveSymptoms(questionnaire, normalized, SYMPTOM_CAP[status] ?? 8)
		};
	}

	// The algorithmic report's own Brief Summary for the branch that fired: the
	// verdict in clinician-authored prose, with the reason when it is negative.
	if (resolved.summary) {
		const cap = SUMMARY_CHAR_CAP[resolved.diagnostic_status] ?? 700;
		// The agent is told this sentence is ground truth and quotes it when it
		// explains a finding, so any code left inside it lands in the narrative.
		// The codes are not lost — `resolveFiredOutcome` has already lifted them
		// into `diagnostic_output.dsm_code` / `.icd_11_code` above, which is where
		// the Section 7 cards read them from.
		const summary = stripDiagnosticCodes(resolved.summary);
		entry.standard_report = {
			outcome_label: resolved.outcome_label,
			summary: summary.length > cap ? `${summary.slice(0, cap).trimEnd()}…` : summary
		};
	}

	// Full rule-engine dump — gives the agent everything it needs to write a
	// defensible Section 7 rationale without trusting our extraction heuristics
	// blindly. A ruled-out interview keeps only the outcome roll-call: its
	// variables and criteria are noise once `standard_report` states the reason.
	entry._raw_eval =
		resolved.diagnostic_status === 'not_supported' || resolved.polarity === 'inconclusive'
			? {
					outcomes_summary: Object.fromEntries(
						Object.entries(evalResult.outcomes ?? {}).map(([k, v]) => [k, v?.value ?? null])
					)
				}
			: {
					variables: evalResult.variables,
					criteria: evalResult.criteria,
					outcomes_summary: Object.fromEntries(
						Object.entries(evalResult.outcomes ?? {}).map(([k, v]) => [k, v?.value ?? null])
					)
				};

	const riskItems = buildRiskRelevantItems({
		testCode: questionnaire.test_code,
		questionnaire,
		normalizedResponses: normalized,
		moduleCoverage
	});
	if (riskItems) entry.risk_relevant_items = riskItems;

	return entry;
}

export { loadAllResponsesByTestCode };
